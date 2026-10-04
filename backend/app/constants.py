"""Enum values and human labels used in messages, CSV exports and ledger descriptions."""

from __future__ import annotations

ROLES: tuple[str, ...] = ("owner", "manager", "employee", "accountant")
STAFF_ROLES: tuple[str, ...] = ("manager", "employee", "accountant")

PERMISSIONS: tuple[str, ...] = (
    "dashboard",
    "orders",
    "customers",
    "payments",
    "inventory",
    "suppliers",
    "expenses",
    "reports",
    "staff",
    "settings",
)

OPEN_STATUSES: tuple[str, ...] = ("new", "preparing", "ready")
COMPLETED_STATUSES: tuple[str, ...] = ("collected", "delivered")

ORDER_STATUS_LABEL = {
    "new": "New",
    "preparing": "Preparing",
    "ready": "Ready",
    "collected": "Collected",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
}

PAYMENT_STATUS_LABEL = {"unpaid": "Unpaid", "partial": "Partial", "paid": "Paid"}
CHANNEL_LABEL = {"walk_in": "Walk-in", "phone": "Phone", "whatsapp": "WhatsApp"}
FULFILLMENT_LABEL = {"pickup": "Pickup", "delivery": "Delivery"}
METHOD_LABEL = {"cash": "Cash", "upi": "UPI", "card": "Card", "bank_transfer": "Bank transfer"}
PAYMENT_METHODS: tuple[str, ...] = ("cash", "upi", "card", "bank_transfer")

PRODUCT_UNITS: tuple[str, ...] = ("pcs", "kg", "g", "l", "ml", "pack", "dozen", "box")

EXPENSE_CATEGORY_LABEL = {
    "rent": "Rent",
    "electricity": "Electricity",
    "salaries": "Salaries",
    "transportation": "Transportation",
    "repairs": "Repairs",
    "supplier": "Supplier",
    "miscellaneous": "Miscellaneous",
}

# Category used for custom (non-inventory) order lines in reports.
CUSTOM_ITEM_CATEGORY = "Other"
DEFAULT_PRODUCT_CATEGORY = "Other"
DEFAULT_SEGMENT = "Grocery"
