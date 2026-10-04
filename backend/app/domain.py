"""Pure business rules and value objects shared by services and serializers (no I/O)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from app.constants import COMPLETED_STATUSES, OPEN_STATUSES

SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


def payment_status(total_paise: int, paid_paise: int) -> str:
    """paid >= total → paid (so a ₹0 order is paid); nothing paid → unpaid; else partial."""
    if paid_paise >= total_paise:
        return "paid"
    if paid_paise <= 0:
        return "unpaid"
    return "partial"


def completed_status(fulfillment: str) -> str:
    return "collected" if fulfillment == "pickup" else "delivered"


def next_statuses(status: str, fulfillment: str) -> list[str]:
    done = completed_status(fulfillment)
    if status == "new":
        return ["preparing", "ready", done, "cancelled"]
    if status == "preparing":
        return ["new", "ready", done, "cancelled"]
    if status == "ready":
        return ["preparing", done, "cancelled"]
    if status in COMPLETED_STATUSES:
        return ["ready"]
    if status == "cancelled":
        return ["new"]
    return []


def is_overdue(due_at: datetime | None, status: str, now: datetime) -> bool:
    return due_at is not None and status in OPEN_STATUSES and due_at < now


def is_low_stock(stock_quantity: float, min_stock_level: float, is_archived: bool) -> bool:
    return not is_archived and stock_quantity <= min_stock_level


def stock_ratio(stock_quantity: float, min_stock_level: float) -> float:
    """How full the shelf is relative to its low-stock level (lower = more urgent)."""
    if min_stock_level > 0:
        return stock_quantity / min_stock_level
    return stock_quantity if stock_quantity < 0 else 0.0


def margin_percent(selling_paise: int, purchase_paise: int) -> float | None:
    if selling_paise == 0:
        return None
    return round((selling_paise - purchase_paise) / selling_paise * 100, 1)


def promise_overdue(promise_date: date | None, outstanding_paise: int, today: date) -> bool:
    return promise_date is not None and promise_date < today and outstanding_paise > 0


def pluralize(count: int, singular: str, plural: str) -> str:
    return singular if count == 1 else plural


@dataclass(frozen=True)
class CustomerStats:
    purchases_paise: int = 0  # non-cancelled order totals
    paid_paise: int = 0  # non-voided payments on those orders
    orders_count: int = 0
    last_order_at: datetime | None = None
    last_order_total_paise: int | None = None
    last_order_id: int | None = None  # breaks ties when two orders share a timestamp

    @property
    def outstanding_paise(self) -> int:
        return max(self.purchases_paise - self.paid_paise, 0)


@dataclass(frozen=True)
class SupplierStats:
    purchased_paise: int = 0
    paid_paise: int = 0
    last_purchase_at: datetime | None = None


EMPTY_CUSTOMER_STATS = CustomerStats()
EMPTY_SUPPLIER_STATS = SupplierStats()


def supplier_outstanding(opening_balance_paise: int, stats: SupplierStats) -> int:
    return max(opening_balance_paise + stats.purchased_paise - stats.paid_paise, 0)
