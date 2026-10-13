"""ShopOS admin: sign-in, every shop at a glance, platform numbers, and the few actions an
operator needs (suspend, reactivate, change plan). Every action is written to ``admin_actions``.

Admins are not shop users: they live in their own table, sign in at ``/admin`` with their own
short-lived token type, and are created from the command line (``python -m app.admin_cli``).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import Session

from app import schemas
from app.config import settings
from app.errors import BadRequest, Conflict, NotFound, TooManyRequests, Unauthorized
from app.models import Admin, AdminAction, Customer, Order, Product, Shop, User
from app.money import to_rupees
from app.security import (
    burn_password_check,
    create_admin_token,
    hash_password,
    login_limiter,
    verify_password,
)
from app.serializers import user_out
from app.services import customers as customers_service
from app.services import media
from app.services.common import clean_line, clean_text, normalize_email, require_password
from app.timeutil import ist_date, now_utc, today_ist

INVALID_LOGIN = "Email or password is incorrect."
TOO_MANY_ATTEMPTS = "Too many failed sign-in attempts. Wait 5 minutes and try again."
SHOP_NOT_FOUND = "Shop not found."
PLANS: tuple[str, ...] = ("free", "basic", "pro", "business")
ACTIONS_SHOWN = 20


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


def admin_out(admin: Admin) -> schemas.AdminUser:
    return schemas.AdminUser(
        id=admin.id, email=admin.email, name=admin.name, last_login_at=admin.last_login_at
    )


def issue_token(admin: Admin) -> str:
    return create_admin_token(
        admin_id=admin.id, token_version=admin.token_version, secret=settings.secret_key
    )


def create_admin(db: Session, *, email: str, name: str, password: str) -> Admin:
    normalized = normalize_email(email)
    if not normalized:
        raise BadRequest("Enter the admin's email address.")
    display_name = clean_line(name)
    if not display_name:
        raise BadRequest("Enter the admin's name.")
    require_password(password)
    if db.scalar(select(Admin.id).where(Admin.email == normalized)) is not None:
        raise Conflict("An admin with this email already exists.")
    admin = Admin(email=normalized, name=display_name, password_hash=hash_password(password))
    db.add(admin)
    db.flush()
    return admin


def set_password(db: Session, admin: Admin, password: str) -> None:
    """New password; every signed-in admin session for this account ends."""
    require_password(password)
    admin.password_hash = hash_password(password)
    admin.token_version += 1
    db.flush()


def login(db: Session, email: str, password: str) -> Admin:
    key = "admin:" + (email or "").strip().lower()
    if login_limiter.is_blocked(key):
        raise TooManyRequests(TOO_MANY_ATTEMPTS)
    admin = db.scalar(select(Admin).where(Admin.email == email.strip().lower()))
    if admin is None:
        burn_password_check(password)
        login_limiter.record_failure(key)
        raise Unauthorized(INVALID_LOGIN)
    if not verify_password(password, admin.password_hash) or not admin.is_active:
        login_limiter.record_failure(key)
        raise Unauthorized(INVALID_LOGIN)
    login_limiter.reset(key)
    admin.last_login_at = now_utc()
    return admin


# ---------------------------------------------------------------------------
# Shops
# ---------------------------------------------------------------------------


def _setup_incomplete() -> ColumnElement[bool]:
    return or_(
        Shop.photo_file.is_(None),
        Shop.latitude.is_(None),
        Shop.longitude.is_(None),
        func.trim(Shop.address) == "",
    )


@dataclass
class _Activity:
    orders: int = 0
    customers: int = 0
    last_order_at: datetime | None = None
    last_login_at: datetime | None = None

    @property
    def last_active_at(self) -> datetime | None:
        moments = [moment for moment in (self.last_order_at, self.last_login_at) if moment]
        return max(moments) if moments else None


def _activity(db: Session, shop_ids: list[int]) -> dict[int, _Activity]:
    result = {shop_id: _Activity() for shop_id in shop_ids}
    if not shop_ids:
        return result
    for shop_id, count, last in db.execute(
        select(Order.shop_id, func.count(), func.max(Order.created_at))
        .where(Order.shop_id.in_(shop_ids))
        .group_by(Order.shop_id)
    ):
        result[shop_id].orders = int(count)
        result[shop_id].last_order_at = last  # max() keeps the column's type: an aware datetime
    for shop_id, count in db.execute(
        select(Customer.shop_id, func.count())
        .where(Customer.shop_id.in_(shop_ids), Customer.is_archived.is_(False))
        .group_by(Customer.shop_id)
    ):
        result[shop_id].customers = int(count)
    for shop_id, last in db.execute(
        select(User.shop_id, func.max(User.last_login_at))
        .where(User.shop_id.in_(shop_ids))
        .group_by(User.shop_id)
    ):
        result[shop_id].last_login_at = last
    return result


def _row(shop: Shop, activity: _Activity) -> schemas.AdminShopRow:
    return schemas.AdminShopRow(
        id=shop.id,
        code=shop.code or "",
        name=shop.name,
        owner_name=shop.owner_name,
        phone=shop.phone,
        email=shop.email,
        city=shop.city,
        plan=shop.plan,  # type: ignore[arg-type]
        photo_url=media.photo_url(shop.photo_file),
        latitude=shop.latitude,
        longitude=shop.longitude,
        setup_complete=shop.setup_complete,
        is_suspended=shop.is_suspended,
        is_demo=shop.is_demo,
        created_at=shop.created_at,
        last_active_at=activity.last_active_at,
        orders_count=activity.orders,
        customers_count=activity.customers,
    )


def _filtered(query: Select[tuple[Shop]], search: str | None, status: str, plan: str | None) -> Select[tuple[Shop]]:
    term = clean_line(search)
    if term:
        query = query.where(
            or_(
                Shop.name.icontains(term, autoescape=True),
                Shop.owner_name.icontains(term, autoescape=True),
                Shop.phone.icontains(term, autoescape=True),
                Shop.email.icontains(term, autoescape=True),
                Shop.code.icontains(term, autoescape=True),
                Shop.city.icontains(term, autoescape=True),
            )
        )
    if status == "active":
        query = query.where(Shop.is_suspended.is_(False), Shop.is_demo.is_(False))
    elif status == "suspended":
        query = query.where(Shop.is_suspended.is_(True))
    elif status == "setup_incomplete":
        query = query.where(_setup_incomplete())
    elif status == "demo":
        query = query.where(Shop.is_demo.is_(True))
    if plan:
        query = query.where(Shop.plan == plan)
    return query


def list_shops(
    db: Session,
    *,
    search: str | None,
    status: str,
    plan: str | None,
    offset: int,
    limit: int,
) -> schemas.Paginated[schemas.AdminShopRow]:
    base = _filtered(select(Shop), search, status, plan)
    total = int(db.scalar(select(func.count()).select_from(base.subquery())) or 0)
    shops = list(db.scalars(base.order_by(Shop.created_at.desc(), Shop.id.desc()).offset(offset).limit(limit)))
    activity = _activity(db, [shop.id for shop in shops])
    return schemas.Paginated[schemas.AdminShopRow](
        items=[_row(shop, activity[shop.id]) for shop in shops], total=total, limit=limit, offset=offset
    )


def get_shop(db: Session, shop_id: int) -> Shop:
    shop = db.get(Shop, shop_id)
    if shop is None:
        raise NotFound(SHOP_NOT_FOUND)
    return shop


def shop_detail(db: Session, shop: Shop, *, now: datetime | None = None) -> schemas.AdminShopDetail:
    now = now or now_utc()
    since = now - timedelta(days=30)
    activity = _activity(db, [shop.id])[shop.id]
    sales, orders = db.execute(
        select(func.coalesce(func.sum(Order.total_paise), 0), func.count())
        .where(Order.shop_id == shop.id, Order.status != "cancelled", Order.created_at >= since)
    ).one()
    dues = customers_service.dues_by_customer(db, shop.id)
    users = list(db.scalars(select(User).where(User.shop_id == shop.id).order_by(User.id)))
    products = int(
        db.scalar(
            select(func.count()).where(Product.shop_id == shop.id, Product.is_archived.is_(False))
        )
        or 0
    )
    actions = list(
        db.scalars(
            select(AdminAction)
            .where(AdminAction.shop_id == shop.id)
            .order_by(AdminAction.created_at.desc(), AdminAction.id.desc())
            .limit(ACTIONS_SHOWN)
        )
    )
    return schemas.AdminShopDetail(
        **_row(shop, activity).model_dump(),
        address=shop.address,
        segment=shop.segment,
        upi_id=shop.upi_id,
        suspended_reason=shop.suspended_reason,
        suspended_at=shop.suspended_at,
        users=[user_out(user) for user in users],
        totals=schemas.AdminShopTotals(
            sales_30d=to_rupees(int(sales)),
            orders_30d=int(orders),
            outstanding=to_rupees(sum(dues.values())),
            products=products,
            staff=sum(1 for user in users if user.role != "owner"),
        ),
        actions=[
            schemas.AdminAction(
                id=action.id,
                action=action.action,
                detail=action.detail,
                admin_name=action.admin.name,
                created_at=action.created_at,
            )
            for action in actions
        ],
    )


def _record(db: Session, admin: Admin, shop: Shop, action: str, detail: str) -> None:
    db.add(AdminAction(admin_id=admin.id, shop_id=shop.id, action=action, detail=detail))
    db.flush()


def suspend(db: Session, admin: Admin, shop: Shop, reason: str) -> None:
    if shop.is_demo:
        raise BadRequest("The demo shop can't be suspended: the website's 'Try the demo' uses it.")
    text = clean_text(reason)
    if not text:
        raise BadRequest("Write why the shop is being suspended. The team will see it later.")
    if shop.is_suspended:
        raise Conflict("This shop is already suspended.")
    shop.is_suspended = True
    shop.suspended_reason = text
    shop.suspended_at = now_utc()
    _record(db, admin, shop, "suspend", text)


def reactivate(db: Session, admin: Admin, shop: Shop) -> None:
    if not shop.is_suspended:
        raise Conflict("This shop isn't suspended.")
    shop.is_suspended = False
    shop.suspended_reason = ""
    shop.suspended_at = None
    _record(db, admin, shop, "reactivate", "")


def change_plan(db: Session, admin: Admin, shop: Shop, plan: str) -> None:
    if plan not in PLANS:
        raise BadRequest("Choose a plan: free, basic, pro or business.")
    if plan == shop.plan:
        return
    previous = shop.plan
    shop.plan = plan
    _record(db, admin, shop, "plan", f"{previous} → {plan}")


# ---------------------------------------------------------------------------
# Platform numbers
# ---------------------------------------------------------------------------


def stats(db: Session, *, now: datetime | None = None) -> schemas.AdminStats:
    """Real shops only; demo shops are left out of every number."""
    now = now or now_utc()
    real = Shop.is_demo.is_(False)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    def count(*conditions: ColumnElement[bool]) -> int:
        return int(db.scalar(select(func.count()).select_from(Shop).where(real, *conditions)) or 0)

    real_ids = select(Shop.id).where(real)
    active_by_orders = select(Order.shop_id).where(Order.created_at >= week_ago)
    active_by_logins = select(User.shop_id).where(User.last_login_at >= week_ago)
    orders_30d, gmv_paise = db.execute(
        select(func.count(), func.coalesce(func.sum(Order.total_paise), 0)).where(
            Order.shop_id.in_(real_ids),
            Order.status != "cancelled",
            Order.created_at >= month_ago,
        )
    ).one()

    today = today_ist(now)
    days = [today - timedelta(days=offset) for offset in range(29, -1, -1)]
    signups = Counter(
        ist_date(created)
        for created in db.scalars(select(Shop.created_at).where(real, Shop.created_at >= month_ago))
    )
    plans = Counter(db.scalars(select(Shop.plan).where(real)))

    return schemas.AdminStats(
        shops_total=count(),
        shops_active_7d=count(
            Shop.is_suspended.is_(False),
            or_(Shop.id.in_(active_by_orders), Shop.id.in_(active_by_logins)),
        ),
        shops_new_30d=count(Shop.created_at >= month_ago),
        shops_suspended=count(Shop.is_suspended.is_(True)),
        shops_setup_incomplete=count(_setup_incomplete()),
        customers_total=int(
            db.scalar(
                select(func.count()).where(
                    Customer.shop_id.in_(real_ids), Customer.is_archived.is_(False)
                )
            )
            or 0
        ),
        orders_30d=int(orders_30d),
        gmv_30d=to_rupees(int(gmv_paise)),
        signups_30d=[schemas.AdminDailyCount(date=day, count=signups.get(day, 0)) for day in days],
        by_plan=[schemas.AdminPlanCount(plan=plan, count=plans.get(plan, 0)) for plan in PLANS],  # type: ignore[arg-type]
    )
