"""Deterministic demo data for "Raj Local Mart", a busy kirana shop in Pune.

    python -m app.seed            # create the demo shop if it does not exist yet
    python -m app.seed --reset    # drop every table, recreate them and seed again

Everything goes through the same service functions the API uses (with timestamp
overrides), and events are replayed in time order, so stock transactions, payment
statuses, khata balances and supplier dues are all internally consistent.
The data is generated relative to "now" with ``random.Random(2026)``.
"""

from __future__ import annotations

import argparse
import heapq
import random
from functools import partial
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import schemas
from app.db import SessionLocal, init_database, reset_database
from app.models import Customer, Order, Product, Shop, Supplier, User
from app.money import multiply_paise, to_paise, to_rupees
from app.services import auth as auth_service
from app.services import customers as customers_service
from app.services import expenses as expenses_service
from app.services import inventory as inventory_service
from app.services import orders as orders_service
from app.services import payments as payments_service
from app.services import shop as shop_service
from app.services import suppliers as suppliers_service
from app.services import users as users_service
from app.timeutil import ist_at, ist_day_start, now_utc, today_ist

SEED = 2026
HISTORY_DAYS = 60  # including today
DEMO_PASSWORD = "demo1234"
DEMO_OWNER_EMAIL = "demo@shopos.app"

# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProductSpec:
    name: str
    category: str
    unit: str
    cost: float
    price: float
    min_level: float
    target: float  # comfortable shelf level the shop restocks to
    supplier: str
    weight: int  # how often it appears in orders
    quantities: tuple[float, ...]
    sku: str | None = None


PRODUCTS: tuple[ProductSpec, ...] = (
    ProductSpec("Basmati Rice", "Staples", "kg", 88, 110, 10, 50, "ganesh", 6, (1, 2, 5), "STP-001"),
    ProductSpec("Sona Masoori Rice", "Staples", "kg", 50, 62, 15, 70, "ganesh", 7, (1, 2, 5, 10), "STP-002"),
    ProductSpec("Wheat Atta", "Staples", "kg", 38, 48, 15, 80, "ganesh", 8, (1, 2, 5, 10), "STP-003"),
    ProductSpec("Sugar", "Staples", "kg", 40, 46, 10, 60, "ganesh", 8, (0.5, 1, 2), "STP-004"),
    ProductSpec("Poha", "Staples", "kg", 48, 60, 5, 25, "ganesh", 4, (0.5, 1), "STP-005"),
    ProductSpec("Rava (Sooji)", "Staples", "kg", 40, 50, 5, 25, "ganesh", 3, (0.5, 1), "STP-006"),
    ProductSpec("Besan", "Staples", "kg", 78, 95, 4, 20, "ganesh", 3, (0.5, 1), "STP-007"),
    ProductSpec("Jaggery", "Staples", "kg", 56, 70, 4, 20, "ganesh", 3, (0.5, 1), "STP-008"),
    ProductSpec("Iodised Salt 1 kg", "Staples", "pcs", 22, 28, 10, 48, "ganesh", 4, (1, 2), "STP-009"),
    ProductSpec("Toor Dal", "Pulses", "kg", 140, 165, 8, 40, "ganesh", 7, (0.5, 1, 2), "PUL-001"),
    ProductSpec("Moong Dal", "Pulses", "kg", 112, 135, 5, 25, "ganesh", 4, (0.5, 1), "PUL-002"),
    ProductSpec("Chana Dal", "Pulses", "kg", 80, 95, 5, 25, "ganesh", 4, (0.5, 1), "PUL-003"),
    ProductSpec("Masoor Dal", "Pulses", "kg", 88, 105, 4, 20, "ganesh", 3, (0.5, 1), "PUL-004"),
    ProductSpec("Sunflower Oil 1 L", "Oils & Ghee", "pcs", 136, 155, 10, 48, "oil", 6, (1, 2), "OIL-001"),
    ProductSpec("Groundnut Oil 1 L", "Oils & Ghee", "pcs", 186, 210, 6, 24, "oil", 3, (1, 2), "OIL-002"),
    ProductSpec("Cow Ghee 500 ml", "Oils & Ghee", "pcs", 298, 340, 5, 18, "oil", 3, (1,), "OIL-003"),
    ProductSpec("Turmeric Powder 100 g", "Spices", "pack", 24, 32, 8, 30, "sai", 3, (1, 2), "SPC-001"),
    ProductSpec("Red Chilli Powder 100 g", "Spices", "pack", 34, 45, 8, 30, "sai", 3, (1, 2), "SPC-002"),
    ProductSpec("Garam Masala 50 g", "Spices", "pack", 46, 60, 5, 20, "sai", 2, (1,), "SPC-003"),
    ProductSpec("Jeera 100 g", "Spices", "pack", 54, 70, 5, 20, "sai", 2, (1,), "SPC-004"),
    ProductSpec("Mustard Seeds 100 g", "Spices", "pack", 14, 20, 5, 20, "sai", 2, (1,), "SPC-005"),
    ProductSpec("Tea Powder 250 g", "Beverages", "pack", 118, 140, 8, 36, "sai", 5, (1, 2), "BEV-001"),
    ProductSpec("Filter Coffee 200 g", "Beverages", "pack", 150, 180, 4, 15, "sai", 2, (1,), "BEV-002"),
    ProductSpec("Glucose Biscuits", "Snacks", "pcs", 8, 10, 24, 120, "sai", 6, (2, 4, 6), "SNK-001"),
    ProductSpec("Cream Biscuits", "Snacks", "pcs", 24, 30, 12, 48, "sai", 3, (1, 2), "SNK-002"),
    ProductSpec("Instant Noodles 70 g", "Snacks", "pcs", 11.5, 14, 24, 120, "sai", 5, (2, 4, 6), "SNK-003"),
    ProductSpec("Aloo Bhujia 200 g", "Snacks", "pack", 44, 55, 6, 24, "sai", 3, (1, 2), "SNK-004"),
    ProductSpec("Toned Milk 500 ml", "Dairy", "pcs", 25, 28, 20, 90, "dairy", 8, (1, 2, 4), "DRY-001"),
    ProductSpec("Curd 400 g", "Dairy", "pcs", 33, 40, 8, 36, "dairy", 4, (1, 2), "DRY-002"),
    ProductSpec("Paneer 200 g", "Dairy", "pcs", 80, 95, 6, 20, "dairy", 3, (1, 2), "DRY-003"),
    ProductSpec("Butter 100 g", "Dairy", "pcs", 52, 58, 6, 24, "dairy", 3, (1,), "DRY-004"),
    ProductSpec("Bath Soap 100 g", "Personal Care", "pcs", 30, 38, 12, 48, "sai", 4, (1, 2, 4), "PRC-001"),
    ProductSpec("Toothpaste 150 g", "Personal Care", "pcs", 82, 99, 6, 24, "sai", 3, (1,), "PRC-002"),
    ProductSpec("Detergent Powder 1 kg", "Household", "pcs", 98, 120, 6, 24, "sai", 3, (1,), "HSH-001"),
    ProductSpec("Dishwash Bar", "Household", "pcs", 17, 22, 10, 40, "sai", 3, (1, 2), "HSH-002"),
    ProductSpec("Matchbox (10 pack)", "Household", "pack", 15, 20, 6, 24, "sai", 2, (1,), "HSH-003"),
)  # fmt: skip

# Shelf level after the last stock count (the shop is short on these today).
LOW_STOCK_LEVELS: dict[str, float] = {
    "Cow Ghee 500 ml": 3,
    "Paneer 200 g": 2,
    "Toothpaste 150 g": 4,
    "Filter Coffee 200 g": 2,
    "Groundnut Oil 1 L": 5,
    "Mustard Seeds 100 g": 0,
}

CUSTOM_ITEMS: tuple[tuple[str, float], ...] = (
    ("Coriander bunch", 10),
    ("Green chillies 100 g", 10),
    ("Lemons (4 pcs)", 20),
    ("Curry leaves", 5),
)


@dataclass(frozen=True)
class CustomerSpec:
    name: str
    phone: str
    address: str
    weight: int
    khata: bool = False  # buys on credit and settles every week or two
    notes: str = ""
    preferred: tuple[str, ...] = ()
    joined_days_ago: int | None = None  # None: since the shop started using ShopOS


CUSTOMERS: tuple[CustomerSpec, ...] = (
    CustomerSpec("Rahul Sharma", "98220 41573", "Flat 12, Shubham Apartments, Model Colony", 9, True,
                 "Monthly khata, settles around the 5th.", ("Basmati Rice", "Toor Dal")),
    CustomerSpec("Priya Nair", "98230 66120", "B-4, Silver Oak Society, Shivajinagar", 7,
                 notes="Prefers WhatsApp updates.", preferred=("Filter Coffee 200 g", "Curd 400 g")),
    CustomerSpec("Amit Verma", "99220 17845", "21, Bhandarkar Road, Deccan Gymkhana", 6),
    CustomerSpec("Neha Kulkarni", "97650 32981", "Flat 7, Mayur Colony, Kothrud", 7,
                 preferred=("Toned Milk 500 ml", "Wheat Atta")),
    CustomerSpec("Sanjay Patil", "98810 54276", "C-203, Sai Heights, Aundh", 8, True,
                 "Pays in cash. Call before delivery.", ("Sunflower Oil 1 L", "Sugar")),
    CustomerSpec("Kavita Deshpande", "90110 28734", "14, Gulmohar Path, Erandwane", 5),
    CustomerSpec("Vikram Joshi", "88050 61392", "A-502, Pristine Greens, Baner", 5,
                 notes="Deliver after 6 pm."),
    CustomerSpec("Anjali Gokhale", "70200 47718", "9, Prabhat Road Lane 4, Erandwane", 4),
    CustomerSpec("Suresh Iyer", "98221 90364", "Flat 3, Ganga Kaveri, Model Colony", 6,
                 preferred=("Filter Coffee 200 g", "Sona Masoori Rice")),
    CustomerSpec("Pooja Bhosale", "97300 15527", "B-11, Swapnashilp Society, Karve Nagar", 5),
    CustomerSpec("Rohan Kale", "98500 73648", "542, Sadashiv Peth", 4),
    CustomerSpec("Sneha Jadhav", "99700 26893", "D-8, Anand Park, Warje", 4),
    CustomerSpec("Manoj Gupta", "98903 41256", "Lane 6, Koregaon Park", 4),
    CustomerSpec("Asha Pawar", "77090 58312", "318, Narayan Peth", 6, True,
                 "Khata customer for 6 years.", ("Wheat Atta", "Tea Powder 250 g")),
    CustomerSpec("Nitin Shinde", "98600 92147", "Flat 15, Amanora Park, Hadapsar", 5, True),
    CustomerSpec("Deepa Menon", "96650 37480", "C-1, Kumar Pebble Park, Kalyani Nagar", 4),
    CustomerSpec("Ganesh More", "98224 16739", "11, Model Colony Lane 3", 6, True,
                 "Settles khata on Sundays.", ("Toor Dal", "Jaggery")),
    CustomerSpec("Swati Mane", "94220 85316", "A-9, Chandrangan Society, Bavdhan", 3),
    CustomerSpec("Lata Apte", "98507 29641", "7, Apte Road, Shivajinagar", 5, True,
                 preferred=("Curd 400 g", "Poha")),
    CustomerSpec("Kiran Chavan", "99601 47382", "B-702, Rose Icon, Pimple Saudagar", 3),
    CustomerSpec("Meghana Rao", "80070 63925", "Flat 21, Clover Park, Viman Nagar", 3),
    CustomerSpec("Prakash Wagh", "97661 20584", "33, Karishma Society, Kothrud", 4, True),
    CustomerSpec("Ritu Agarwal", "98337 71460", "D-5, Westend Towers, Aundh", 4),
    CustomerSpec("Harish Bhat", "90281 56037", "6, Fergusson College Road, Deccan Gymkhana", 3),
    CustomerSpec("Shweta Ranade", "98605 38219", "Flat 2, Rambaug Colony, Erandwane", 3),
    CustomerSpec("Yogesh Salunkhe", "72760 94153", "C-4, Atul Nagar, Warje", 3, joined_days_ago=27),
    CustomerSpec("Farah Shaikh", "98902 67314", "12, East Street, Camp", 3, joined_days_ago=19),
    CustomerSpec("Joseph D'Souza", "98815 42690", "Flat 9, Model Colony Lane 2", 3,
                 notes="New in the area.", joined_days_ago=12),
    CustomerSpec("Gurpreet Kaur", "99229 18573", "B-14, Balewadi High Street, Baner", 2,
                 joined_days_ago=6),
    CustomerSpec("Ajay Thakur", "95520 83746", "17, Karve Nagar Lane 5", 2, joined_days_ago=3),
)  # fmt: skip


@dataclass(frozen=True)
class SupplierSpec:
    key: str
    name: str
    phone: str
    contact: str
    address: str
    supplies: str
    opening_balance: float
    every_days: int  # delivery cadence
    first_day: int  # offset of the first delivery
    pay_share: float  # share of each bill paid on delivery
    method: str


SUPPLIERS: tuple[SupplierSpec, ...] = (
    SupplierSpec("ganesh", "Shree Ganesh Traders", "98220 55410", "Mahesh Agarwal",
                 "Gala 18, Market Yard, Gultekdi, Pune", "Rice, atta, sugar, dal, poha",
                 4500, 6, 1, 0.7, "bank_transfer"),
    SupplierSpec("oil", "Pune Oil Depot", "98901 22874", "Iqbal Sayyed",
                 "Shop 5, Bhavani Peth, Pune", "Edible oils and ghee", 0, 10, 2, 0.6, "upi"),
    SupplierSpec("dairy", "Shivneri Dairy Supply", "97632 41185", "Santosh Kadam",
                 "Plot 9, Hadapsar Industrial Estate, Pune", "Milk, curd, paneer, butter",
                 0, 3, 0, 1.0, "upi"),
    SupplierSpec("sai", "Sai Wholesale Bazaar", "99701 36622", "Ramesh Bhandari",
                 "Lane 2, Raviwar Peth, Pune", "Spices, tea, biscuits, soaps, household",
                 0, 7, 3, 1.0, "cash"),
)  # fmt: skip

HOUR_WEIGHTS: dict[int, int] = {
    8: 3, 9: 5, 10: 5, 11: 4, 12: 2, 13: 1, 14: 1, 15: 1, 16: 2, 17: 4, 18: 6, 19: 6, 20: 4, 21: 2,
}  # fmt: skip
CHANNEL_WEIGHTS = {"walk_in": 58, "phone": 24, "whatsapp": 18}
METHOD_WEIGHTS = {"upi": 55, "cash": 35, "card": 6, "bank_transfer": 4}
SETTLEMENT_METHOD_WEIGHTS = {"upi": 50, "cash": 40, "bank_transfer": 10}
ORDER_NOTES = (
    "Call before delivery.",
    "Loose sugar in two bags.",
    "Keep ready by 7 pm.",
    "Customer will send someone to collect.",
    "Ring the bell twice.",
)

# Today's orders: (final status, channel, fulfillment, customer kind, payment).
TODAY_PLAN: tuple[tuple[str, str, str, str, str], ...] = (
    *(("collected", "walk_in", "pickup", "anonymous", "full"),) * 9,
    *(("collected", "walk_in", "pickup", "regular", "full"),) * 4,
    ("collected", "walk_in", "pickup", "khata", "none"),
    ("collected", "walk_in", "pickup", "khata", "partial"),
    *(("collected", "phone", "pickup", "regular", "full"),) * 2,
    ("delivered", "whatsapp", "delivery", "regular", "full"),
    ("delivered", "phone", "delivery", "khata", "partial"),
    ("cancelled", "phone", "pickup", "regular", "none"),
    ("new", "whatsapp", "pickup", "regular", "full"),
    ("new", "whatsapp", "pickup", "khata", "none"),
    ("preparing", "phone", "pickup", "khata", "none"),
    ("preparing", "whatsapp", "pickup", "khata", "partial"),
    ("ready", "phone", "pickup", "regular", "none"),
    ("ready", "whatsapp", "pickup", "khata", "none"),
    ("ready", "walk_in", "pickup", "regular", "full"),
    ("new", "whatsapp", "delivery", "regular", "full"),
    ("preparing", "phone", "delivery", "khata", "none"),
    ("ready", "whatsapp", "delivery", "regular", "full"),
)

# (customer, promise recorded N days ago, due date relative to today,
#  share of the dues promised (None = everything), note)
PROMISES: tuple[tuple[str, int, int, float | None, str], ...] = (
    ("Sanjay Patil", 6, -2, 0.6, "Will pay after salary."),
    ("Ganesh More", 2, 2, None, "Sunday, as usual."),
    ("Lata Apte", 1, 5, 0.5, "Part payment promised."),
)
PROMISE_CUSTOMERS = frozenset(name for name, *_ in PROMISES)

STATUS_STEPS = {
    "new": (),
    "preparing": ("preparing",),
    "ready": ("preparing", "ready"),
}


@dataclass
class _OrderHolder:
    order: Order | None = None


@dataclass(order=True)
class _Event:
    at: datetime
    sequence: int
    action: Callable[[], None] = field(compare=False)


class DemoSeeder:
    shop: Shop
    owner: User
    manager: User
    employee: User
    accountant: User

    def __init__(self, db: Session, now: datetime | None = None) -> None:
        self.db = db
        self.now = now or now_utc()
        self.today = today_ist(self.now)
        self.yesterday = self.today - timedelta(days=1)
        self.first_day = self.today - timedelta(days=HISTORY_DAYS - 1)
        self.rng = random.Random(SEED)
        self._events: list[_Event] = []
        self._sequence = 0
        self.products: dict[str, Product] = {}
        self.customers: list[tuple[Customer, CustomerSpec]] = []
        self.suppliers: dict[str, tuple[Supplier, SupplierSpec]] = {}
        self.next_settlement: dict[int, date] = {}

    # -- event queue ---------------------------------------------------------

    def schedule(self, at: datetime, action: Callable[[], None]) -> None:
        self._sequence += 1
        heapq.heappush(self._events, _Event(at, self._sequence, action))

    def run_events(self) -> None:
        while self._events:
            heapq.heappop(self._events).action()

    def latest(self, at: datetime) -> datetime:
        """Clamp a timestamp so nothing is recorded in the future."""
        return min(at, self.now - timedelta(seconds=2))

    # -- helpers -------------------------------------------------------------

    def pick(self, weights: dict[str, int]) -> str:
        return self.rng.choices(list(weights), weights=list(weights.values()))[0]

    def staff(self) -> User:
        return self.rng.choices(
            [self.owner, self.manager, self.employee], weights=[35, 30, 35]
        )[0]

    def random_time(self, day: date) -> datetime:
        hour = self.rng.choices(list(HOUR_WEIGHTS), weights=list(HOUR_WEIGHTS.values()))[0]
        return ist_at(day, hour, self.rng.randrange(60)) + timedelta(seconds=self.rng.randrange(60))

    def pick_items(self, lines: int, exclude: set[str]) -> list[schemas.OrderItemInput]:
        pool = [spec for spec in PRODUCTS if spec.name not in exclude]
        items: list[schemas.OrderItemInput] = []
        for _ in range(min(lines, len(pool))):
            spec = self.rng.choices(pool, weights=[candidate.weight for candidate in pool])[0]
            pool.remove(spec)
            items.append(
                schemas.OrderItemInput(
                    product_id=self.products[spec.name].id,
                    quantity=self.rng.choice(spec.quantities),
                )
            )
        if self.rng.random() < 0.06:
            name, price = self.rng.choice(CUSTOM_ITEMS)
            items.append(schemas.OrderItemInput(name=name, quantity=1, unit_price=price))
        return items

    def expected_total(self, items: list[schemas.OrderItemInput], discount: float) -> int:
        subtotal = 0
        for item in items:
            if item.product_id is None:
                subtotal += multiply_paise(item.quantity, to_paise(item.unit_price or 0))
            else:
                product = self.db.get(Product, item.product_id)
                assert product is not None
                subtotal += multiply_paise(item.quantity, product.selling_price_paise)
        return subtotal - to_paise(discount)

    def round_off(self, items: list[schemas.OrderItemInput]) -> float:
        """Occasional round-off discount down to the nearest ₹10 on bigger bills."""
        subtotal = self.expected_total(items, 0)
        if subtotal > 30_000 and self.rng.random() < 0.12:
            return to_rupees(subtotal % 1000)
        return 0.0

    def partial_amount(self, total_paise: int) -> int:
        share = self.rng.uniform(0.4, 0.8)
        amount = int(total_paise * share) // 1000 * 1000  # round down to ₹10
        return min(max(amount, 1000), total_paise - 100) if total_paise > 1100 else 0

    def eligible_customers(self, at: datetime, kind: str) -> list[tuple[Customer, CustomerSpec]]:
        pool = [(customer, spec) for customer, spec in self.customers if customer.created_at <= at]
        if kind == "khata":
            pool = [row for row in pool if row[1].khata]
        elif kind == "regular":
            pool = [row for row in pool if not row[1].khata]
        return pool

    def choose_customer(self, at: datetime, kind: str) -> tuple[Customer, CustomerSpec] | None:
        pool = self.eligible_customers(at, kind)
        if not pool:
            return None
        return self.rng.choices(pool, weights=[spec.weight for _, spec in pool])[0]

    # -- setup ---------------------------------------------------------------

    def create_shop_and_staff(self) -> None:
        opened = ist_at(self.first_day - timedelta(days=1), 18, 30)
        self.owner = auth_service.signup(
            self.db,
            schemas.SignupRequest(
                shop_name="Raj Local Mart",
                owner_name="Raj Deshmukh",
                phone="9876500001",
                email=DEMO_OWNER_EMAIL,
                password=DEMO_PASSWORD,
                city="Pune",
                segment="Grocery",
            ),
            at=opened,
        )
        shop = self.db.get(Shop, self.owner.shop_id)
        assert shop is not None
        self.shop = shop
        shop_service.update_shop(
            shop,
            schemas.ShopUpdate(
                address="Shop 4, Lane 3, Model Colony, Pune 411016",
                upi_id="rajlocalmart@upi",
            ),
        )
        shop.plan = "basic"
        shop.is_demo = True

        staff_joined = ist_at(self.first_day, 10, 0)
        self.manager, self.employee, self.accountant = (
            users_service.create_staff(
                self.db,
                shop.id,
                schemas.StaffCreate(name=name, email=email, role=role, password=DEMO_PASSWORD),  # type: ignore[arg-type]
                at=staff_joined,
            )
            for name, email, role in (
                ("Sunita Joshi", "sunita@shopos.app", "manager"),
                ("Arjun Pawar", "arjun@shopos.app", "employee"),
                ("Meera Iyer", "meera@shopos.app", "accountant"),
            )
        )
        self.owner.last_login_at = self.latest(self.now - timedelta(minutes=8))
        self.manager.last_login_at = self.latest(self.now - timedelta(hours=2, minutes=15))
        self.employee.last_login_at = self.latest(self.now - timedelta(hours=1, minutes=5))
        self.accountant.last_login_at = ist_at(self.yesterday, 17, 40)

    def create_suppliers(self) -> None:
        created = ist_at(self.first_day, 9, 0)
        for spec in SUPPLIERS:
            supplier = suppliers_service.create_supplier(
                self.db,
                self.shop.id,
                schemas.SupplierInput(
                    name=spec.name,
                    phone=spec.phone,
                    contact_person=spec.contact,
                    address=spec.address,
                    supplies=spec.supplies,
                    opening_balance=spec.opening_balance,
                ),
                at=created,
            )
            self.suppliers[spec.key] = (supplier, spec)

    def create_products(self) -> None:
        created = ist_at(self.first_day, 9, 15)
        for spec in PRODUCTS:
            self.products[spec.name] = inventory_service.create_product(
                self.db,
                self.shop.id,
                self.owner,
                schemas.ProductInput(
                    name=spec.name,
                    category=spec.category,
                    unit=spec.unit,  # type: ignore[arg-type]
                    sku=spec.sku,
                    stock_quantity=spec.target,
                    min_stock_level=spec.min_level,
                    purchase_price=spec.cost,
                    selling_price=spec.price,
                ),
                at=created,
            )

    def create_customers(self) -> None:
        for index, spec in enumerate(CUSTOMERS):
            if spec.joined_days_ago is None:
                joined = ist_at(self.first_day, 9, 30) + timedelta(minutes=7 * index)
            else:
                joined = ist_at(self.today - timedelta(days=spec.joined_days_ago), 11, 0)
            customer = customers_service.create_customer(
                self.db,
                self.shop.id,
                schemas.CustomerInput(
                    name=spec.name,
                    phone=spec.phone,
                    address=spec.address,
                    notes=spec.notes,
                    preferred_products=list(spec.preferred),
                ),
                at=joined,
            )
            self.customers.append((customer, spec))
            if spec.khata:
                self.next_settlement[customer.id] = self.first_day + timedelta(
                    days=self.rng.randint(7, 12)
                )

    # -- daily activity ------------------------------------------------------

    def orders_on(self, day: date) -> int:
        days_ago = (self.today - day).days
        base = 6 if days_ago <= 7 else 1 + round(2.5 * (1 - days_ago / HISTORY_DAYS))
        weekend_bonus = 2 if day.weekday() >= 5 else 0
        return max(1, base + weekend_bonus + self.rng.choice((-1, 0, 0, 1)))

    def payment_plan(self, spec: CustomerSpec | None) -> str:
        if spec is None:
            return "full"
        roll = self.rng.random()
        if spec.khata:
            return "full" if roll < 0.35 else "partial" if roll < 0.65 else "none"
        return "full"

    def payment_for(self, plan: str, total_paise: int) -> int:
        if plan == "full":
            return total_paise
        if plan == "partial":
            return self.partial_amount(total_paise)
        return 0

    def create(
        self,
        holder: _OrderHolder,
        *,
        at: datetime,
        customer: Customer | None,
        channel: str,
        fulfillment: str,
        items: list[schemas.OrderItemInput],
        status: str = "new",
        due_at: datetime | None = None,
        discount: float = 0.0,
        paid_paise: int = 0,
        notes: str = "",
        user: User | None = None,
    ) -> None:
        payment = (
            schemas.PaymentNow(amount=to_rupees(paid_paise), method=self.pick(METHOD_WEIGHTS))  # type: ignore[arg-type]
            if paid_paise > 0
            else None
        )
        holder.order = orders_service.create_order(
            self.db,
            self.shop.id,
            user or self.staff(),
            schemas.OrderCreate(
                customer_id=customer.id if customer else None,
                items=items,
                fulfillment=fulfillment,  # type: ignore[arg-type]
                channel=channel,  # type: ignore[arg-type]
                status=status,  # type: ignore[arg-type]
                due_at=due_at,
                notes=notes,
                discount=discount,
                payment=payment,
            ),
            at=at,
        )

    def move(self, holder: _OrderHolder, status: str, at: datetime, user: User | None = None) -> None:
        assert holder.order is not None
        orders_service.change_status(self.db, user or self.staff(), holder.order, status, at=at)

    def collect(self, holder: _OrderHolder, plan: str, at: datetime, user: User) -> None:
        order = holder.order
        assert order is not None
        amount = self.payment_for(plan, order.total_paise - order.paid_paise)
        if amount > 0:
            payments_service.record_order_payment(
                self.db, user, order, amount, self.pick(METHOD_WEIGHTS), at=at
            )

    def after(self, start: datetime, minutes: int) -> datetime:
        return self.latest(start + timedelta(minutes=minutes))

    def plan_history_order(self, day: date, exclude: set[str]) -> None:
        at = self.random_time(day)
        channel = self.pick(CHANNEL_WEIGHTS)
        chosen: tuple[Customer, CustomerSpec] | None
        if channel == "walk_in":
            chosen = self.choose_customer(at, "any") if self.rng.random() < 0.45 else None
        else:
            chosen = self.choose_customer(at, "any")
        customer, spec = chosen if chosen else (None, None)
        fulfillment = "delivery" if channel != "walk_in" and self.rng.random() < 0.45 else "pickup"
        if customer is None:
            channel, fulfillment = "walk_in", "pickup"
        lines = self.rng.choices([1, 2, 3, 4, 5, 6], weights=[18, 24, 22, 16, 12, 8])[0]
        items = self.pick_items(lines + (1 if fulfillment == "delivery" else 0), exclude)
        discount = self.round_off(items)
        wants_note = channel != "walk_in" and self.rng.random() < 0.15
        notes = self.rng.choice(ORDER_NOTES) if wants_note else ""
        plan = self.payment_plan(spec)
        holder = _OrderHolder()
        staff = self.staff()
        create = partial(self.create, holder, at=at, customer=customer, channel=channel, user=staff)

        if self.rng.random() < 0.03 and customer is not None:
            self.schedule(at, partial(create, fulfillment=fulfillment, items=items))
            cancelled_at = at + timedelta(minutes=self.rng.randint(10, 50))
            self.schedule(cancelled_at, partial(self.move, holder, "cancelled", cancelled_at, staff))
            return

        if channel == "walk_in":  # counter sale: completed and paid on the spot
            paid = self.payment_for(plan, self.expected_total(items, discount))
            self.schedule(
                at,
                partial(
                    create,
                    fulfillment="pickup",
                    items=items,
                    status="collected",
                    discount=discount,
                    paid_paise=paid,
                ),
            )
            return

        due_at = at + timedelta(minutes=self.rng.randint(60, 240))
        preparing_at = self.after(at, self.rng.randint(10, 40))
        ready_at = self.after(preparing_at, self.rng.randint(15, 60))
        done_at = self.after(ready_at, self.rng.randint(20, 180))
        done = "delivered" if fulfillment == "delivery" else "collected"
        self.schedule(
            at,
            partial(
                create,
                fulfillment=fulfillment,
                items=items,
                due_at=due_at,
                discount=discount,
                notes=notes,
            ),
        )
        self.schedule(preparing_at, partial(self.move, holder, "preparing", preparing_at))
        self.schedule(ready_at, partial(self.move, holder, "ready", ready_at))
        self.schedule(done_at, partial(self.collect, holder, plan, done_at, staff))
        self.schedule(done_at, partial(self.move, holder, done, done_at, staff))

    def plan_purchases(self, day: date) -> None:
        offset = (day - self.first_day).days
        final_top_up = day == self.yesterday
        for supplier, spec in self.suppliers.values():
            due = offset >= spec.first_day and (offset - spec.first_day) % spec.every_days == 0
            if not (due or final_top_up):
                continue
            at = ist_at(day, 9, 30) + timedelta(minutes=self.rng.randint(0, 60))
            self.schedule(at, partial(self.purchase, supplier, spec, at, day, final_top_up))

    def purchase(
        self, supplier: Supplier, spec: SupplierSpec, at: datetime, day: date, top_up: bool
    ) -> None:
        holding_back = (self.today - day).days <= 14
        items: list[schemas.PurchaseItemInput] = []
        for product_spec in PRODUCTS:
            if product_spec.supplier != spec.key:
                continue
            if holding_back and product_spec.name in LOW_STOCK_LEVELS:
                continue
            product = self.products[product_spec.name]
            reorder_point = product_spec.target * (0.8 if top_up else 0.5)
            if product.stock_quantity > reorder_point:
                continue
            step = 5 if product_spec.unit == "kg" else 6
            quantity = -(-(product_spec.target - product.stock_quantity) // step) * step
            if quantity > 0:
                items.append(
                    schemas.PurchaseItemInput(
                        product_id=product.id, quantity=quantity, unit_cost=product_spec.cost
                    )
                )
        if not items:
            return
        total = sum(multiply_paise(item.quantity, to_paise(item.unit_cost)) for item in items)
        paid = total if spec.pay_share >= 1 else int(total * spec.pay_share) // 10_000 * 10_000
        suppliers_service.create_purchase(
            self.db,
            self.shop.id,
            self.rng.choice([self.owner, self.manager]),
            supplier,
            schemas.PurchaseCreate(
                items=items,
                paid_amount=to_rupees(paid),
                method=spec.method,  # type: ignore[arg-type]
                note=f"Bill {spec.key.upper()}-{day.strftime('%d%m')}",
            ),
            at=at,
        )

    def plan_supplier_payments(self, day: date) -> None:
        """Part-pay the credit suppliers every couple of weeks."""
        offset = (day - self.first_day).days
        if offset % 14 != 9:
            return
        for key, share in (("ganesh", 0.6), ("oil", 0.5)):
            supplier, spec = self.suppliers[key]
            at = ist_at(day, 16, 0)
            self.schedule(at, partial(self.pay_supplier_share, supplier, spec, share, at))

    def pay_supplier_share(
        self, supplier: Supplier, spec: SupplierSpec, share: float, at: datetime
    ) -> None:
        due = suppliers_service.outstanding_for(self.db, supplier)
        amount = int(due * share) // 10_000 * 10_000  # round down to ₹100
        if amount > 0:
            suppliers_service.record_supplier_payment(
                self.db,
                self.shop.id,
                self.owner,
                supplier,
                amount,
                spec.method,
                note="Part payment against bills",
                at=at,
            )

    def record_expense(
        self, category: str, amount: float, note: str, at: datetime, user: User
    ) -> None:
        expenses_service.create_expense(
            self.db,
            self.shop.id,
            user,
            schemas.ExpenseInput(
                category=category,  # type: ignore[arg-type]
                amount=amount,
                note=note,
                spent_at=at,
            ),
            at=at,
        )

    def plan_expenses(self, day: date) -> None:
        def add(
            category: str, amount: float, note: str, at: datetime, user: User | None = None
        ) -> None:
            author = user or self.accountant
            self.schedule(at, partial(self.record_expense, category, amount, note, at, author))

        offset = (day - self.first_day).days
        if day.day == 1:
            add("rent", 22000, "Shop rent", ist_at(day, 10, 30), self.owner)
            salaries_note = "Staff salaries: Sunita, Arjun, Meera"
            add("salaries", 34000, salaries_note, ist_at(day, 11, 0), self.owner)
        if day.day == 7:
            bill = self.rng.choice((2640, 2810, 2955, 3180))
            add("electricity", bill, "MSEDCL electricity bill", ist_at(day, 12, 0))
        if day.weekday() == 0:
            fare = self.rng.choice((450, 520, 600, 680, 750))
            add("transportation", fare, "Tempo charges, Market Yard", ist_at(day, 8, 40), self.manager)
        one_offs = {
            12: ("miscellaneous", 280, "Shop cleaning supplies"),
            18: ("repairs", 650, "Shutter lock replaced"),
            25: ("miscellaneous", 350, "Puja flowers and sweets"),
            30: ("miscellaneous", 600, "Carry bags (500 pcs)"),
            33: ("supplier", 200, "Loading charges at Market Yard"),
            41: ("repairs", 2350, "Refrigerator compressor repair"),
        }
        if offset in one_offs:
            category, amount, note = one_offs[offset]
            add(category, amount, note, ist_at(day, 13, 15))

    def plan_settlements(self, day: date) -> None:
        for customer, spec in self.customers:
            if not spec.khata or self.next_settlement.get(customer.id) != day:
                continue
            gap = self.rng.randint(9, 16)
            self.next_settlement[customer.id] = day + timedelta(days=gap)
            # Customers with a promise on record keep (some) dues until the promise date.
            if spec.name in PROMISE_CUSTOMERS and (self.today - day).days < 20:
                continue
            at = ist_at(day, 19, 0) + timedelta(minutes=self.rng.randint(0, 100))
            share = self.rng.uniform(0.5, 1.0)
            self.schedule(at, partial(self.settle_khata, customer, share, at))

    def settle_khata(self, customer: Customer, share: float, at: datetime) -> None:
        due = customers_service.outstanding_paise(self.db, customer.id)
        amount = min(due, max(int(due * share) // 5000 * 5000, 5000))  # ₹50 steps
        if due > 0 and amount > 0:
            payments_service.record_customer_payment(
                self.db,
                self.owner,
                customer,
                amount,
                self.pick(SETTLEMENT_METHOD_WEIGHTS),
                "Khata settlement",
                at=at,
            )

    def plan_promises(self, day: date) -> None:
        for name, recorded_days_ago, due_offset, share, note in PROMISES:
            if day != self.today - timedelta(days=recorded_days_ago):
                continue
            customer = next(customer for customer, spec in self.customers if spec.name == name)
            promise_date = self.today + timedelta(days=due_offset)
            at = ist_at(day, 20, 50)
            self.schedule(at, partial(self.record_promise, customer, promise_date, share, note, at))

    def record_promise(
        self,
        customer: Customer,
        promise_date: date,
        share: float | None,
        note: str,
        at: datetime,
    ) -> None:
        due = customers_service.outstanding_paise(self.db, customer.id)
        if due <= 0:
            # A promise needs dues behind it: the customer picks up groceries on khata first.
            items = self.pick_items(2, set(LOW_STOCK_LEVELS))
            self.create(_OrderHolder(), at=at, customer=customer, channel="walk_in",
                        fulfillment="pickup", items=items, status="collected", user=self.staff())
            due = customers_service.outstanding_paise(self.db, customer.id)
        promised = int(due * share) // 5000 * 5000 if share is not None else 0  # ₹50 steps
        customers_service.set_promise(
            self.db,
            customer,
            schemas.PromiseInput(
                date=promise_date,
                amount=to_rupees(promised) if promised > 0 else None,
                note=note,
            ),
            today=today_ist(at),
            at=at,
        )

    def count_stock(self, at: datetime) -> None:
        """Evening stock count: a few shelves turn out to be short."""
        for name, level in LOW_STOCK_LEVELS.items():
            product = self.products[name]
            if product.stock_quantity <= level:
                continue
            inventory_service.adjust_stock(
                self.db,
                product,
                self.manager,
                schemas.StockAdjustmentRequest(
                    mode="set",
                    quantity=level,
                    reason="damage" if level == 0 else "correction",
                    note="Packets damaged in storage" if level == 0 else "Evening stock count",
                ),
                at=at,
            )

    # -- today ---------------------------------------------------------------

    def plan_today(self) -> None:
        day_start = ist_at(self.today, 7, 30)
        window_end = self.now - timedelta(minutes=3)
        if window_end <= day_start:
            # Seeding before opening time: spread today's orders over what has passed of today.
            midnight = ist_day_start(self.today)
            elapsed = self.now - midnight
            day_start, window_end = midnight + elapsed * 0.05, midnight + elapsed * 0.95
        span = (window_end - day_start).total_seconds()
        exclude = set(LOW_STOCK_LEVELS)
        offsets = sorted(self.rng.random() for _ in TODAY_PLAN)
        plan = list(TODAY_PLAN)
        self.rng.shuffle(plan)

        for fraction, (status, channel, fulfillment, kind, payment) in zip(offsets, plan):
            at = self.latest(day_start + timedelta(seconds=span * fraction))
            self.plan_today_order(at, status, channel, fulfillment, kind, payment, exclude)

        # Yesterday evening's phone order that is still waiting: ready but overdue.
        self.plan_today_order(
            self.now - timedelta(hours=3),
            "ready",
            "phone",
            "pickup",
            "khata",
            "none",
            exclude,
            due_at=self.now - timedelta(minutes=40),
        )

        transport_at = day_start + timedelta(minutes=20)
        if transport_at < self.now:
            self.schedule(
                transport_at,
                partial(
                    self.record_expense,
                    "transportation",
                    350,
                    "Tempo charges, Market Yard",
                    transport_at,
                    self.manager,
                ),
            )

    def plan_today_order(
        self,
        at: datetime,
        status: str,
        channel: str,
        fulfillment: str,
        kind: str,
        payment: str,
        exclude: set[str],
        *,
        due_at: datetime | None = None,
    ) -> None:
        chosen = None if kind == "anonymous" else self.choose_customer(at, kind)
        customer = chosen[0] if chosen else None
        if customer is None and kind != "anonymous":
            chosen = self.choose_customer(at, "any")
            customer = chosen[0] if chosen else None
        lines = self.rng.choices([1, 2, 3, 4, 5], weights=[20, 28, 24, 16, 12])[0]
        items = self.pick_items(lines, exclude)
        staff = self.staff()
        holder = _OrderHolder()
        total = self.expected_total(items, 0)
        if customer is None:
            payment = "full"
        create = partial(self.create, holder, at=at, customer=customer, channel=channel, user=staff)

        if status == "collected" and channel == "walk_in":
            paid = self.payment_for(payment, total)
            self.schedule(
                at,
                partial(
                    create, fulfillment="pickup", items=items, status="collected", paid_paise=paid
                ),
            )
            return

        if status in ("collected", "delivered", "cancelled"):
            due = at + timedelta(minutes=60 if fulfillment == "pickup" else 120)
            self.schedule(at, partial(create, fulfillment=fulfillment, items=items, due_at=due))
            if status == "cancelled":
                cancelled_at = self.after(at, 15)
                self.schedule(
                    cancelled_at, partial(self.move, holder, "cancelled", cancelled_at, staff)
                )
                return
            preparing_at, ready_at, done_at = (self.after(at, minutes) for minutes in (10, 30, 55))
            self.schedule(preparing_at, partial(self.move, holder, "preparing", preparing_at))
            self.schedule(ready_at, partial(self.move, holder, "ready", ready_at))
            self.schedule(done_at, partial(self.collect, holder, payment, done_at, staff))
            self.schedule(done_at, partial(self.move, holder, status, done_at, staff))
            return

        # Still open: paid in advance (full/partial) or nothing yet.
        due = due_at or self.now + timedelta(minutes=self.rng.randint(30, 200))
        paid = self.payment_for(payment, total)
        self.schedule(
            at,
            partial(create, fulfillment=fulfillment, items=items, due_at=due, paid_paise=paid),
        )
        for minutes, next_status in zip((12, 28), STATUS_STEPS[status]):
            moment = self.after(at, minutes)
            self.schedule(moment, partial(self.move, holder, next_status, moment))

    # -- run -----------------------------------------------------------------

    def run(self) -> Shop:
        self.create_shop_and_staff()
        self.create_suppliers()
        self.create_products()
        self.create_customers()
        self.db.flush()
        for offset in range(HISTORY_DAYS - 1):
            day = self.first_day + timedelta(days=offset)
            exclude = set(LOW_STOCK_LEVELS) if (self.today - day).days <= 2 else set()
            self.plan_purchases(day)
            self.plan_supplier_payments(day)
            self.plan_expenses(day)
            for _ in range(self.orders_on(day)):
                self.plan_history_order(day, exclude)
            self.plan_settlements(day)
            self.plan_promises(day)
            if day == self.yesterday:
                stock_count_at = ist_at(day, 21, 45)
                self.schedule(stock_count_at, partial(self.count_stock, stock_count_at))
            self.run_events()
        self.plan_today()
        self.run_events()
        self.db.flush()
        return self.shop


def seed_demo_shop(db: Session, *, now: datetime | None = None) -> Shop:
    """Create the demo shop with ~2 months of history. The caller commits."""
    return DemoSeeder(db, now).run()


def _summary(db: Session, shop: Shop) -> str:
    def count(model: type[Order] | type[Customer] | type[Product]) -> int:
        return int(db.scalar(select(func.count()).select_from(model).where(model.shop_id == shop.id)) or 0)

    return (
        f"Seeded {shop.name}: {count(Product)} products, {count(Customer)} customers, "
        f"{count(Order)} orders. Sign in with {DEMO_OWNER_EMAIL} / {DEMO_PASSWORD}."
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Seed the ShopOS demo shop.")
    parser.add_argument("--reset", action="store_true", help="drop all data and seed again")
    args = parser.parse_args(argv)
    if args.reset:
        reset_database()
    else:
        init_database()
    with SessionLocal() as db:
        existing = db.scalar(select(Shop).where(Shop.is_demo.is_(True)).limit(1))
        if existing is not None:
            print("The demo shop already exists. Use --reset to recreate it.")
            return
        shop = seed_demo_shop(db)
        db.commit()
        print(_summary(db, shop))


if __name__ == "__main__":
    main()
