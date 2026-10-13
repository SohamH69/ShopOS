"""Pydantic request/response models.

Response models mirror ``frontend/src/lib/types.ts`` key for key; request models accept
the matching ``*Input`` / ``*Request`` shapes. Business validation that needs a friendly
sentence (amount > 0, password length, ...) happens in the services and returns 400;
structural problems (wrong types, unknown enum values, missing fields) are FastAPI's 422.
"""

import datetime as dt
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, PlainSerializer

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

Role = Literal["owner", "manager", "employee", "accountant"]
StaffRole = Literal["manager", "employee", "accountant"]
Permission = Literal[
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
]
OrderStatus = Literal["new", "preparing", "ready", "collected", "delivered", "cancelled"]
OrderCreateStatus = Literal["new", "preparing", "ready", "collected", "delivered"]
OrderStatusFilter = Literal[
    "new", "preparing", "ready", "collected", "delivered", "cancelled", "open", "completed"
]
PaymentStatus = Literal["unpaid", "partial", "paid"]
Fulfillment = Literal["pickup", "delivery"]
Channel = Literal["walk_in", "phone", "whatsapp", "online"]
PaymentMethod = Literal["cash", "upi", "card", "bank_transfer"]
ProductUnit = Literal["pcs", "kg", "g", "l", "ml", "pack", "dozen", "box"]
ExpenseCategory = Literal[
    "rent", "electricity", "salaries", "transportation", "repairs", "supplier", "miscellaneous"
]
StockReason = Literal["restock", "damage", "correction", "return", "other"]
StockMode = Literal["add", "remove", "set"]
InventoryTxType = Literal["opening", "sale", "sale_reversal", "purchase", "adjustment"]
Plan = Literal["free", "basic", "pro", "business"]
Severity = Literal["high", "medium", "low"]
ReportRange = Literal["7d", "30d", "90d", "12m"]
ReportBucket = Literal["day", "week", "month"]
CustomerFilter = Literal["all", "dues", "promises"]
CustomerSort = Literal["name", "outstanding", "recent"]
AttentionKey = Literal[
    "online_orders",
    "pickups",
    "ready_unpaid",
    "customer_dues",
    "promises",
    "low_stock",
    "deliveries",
    "supplier_dues",
]
LedgerEntryType = Literal["purchase", "payment"]
ImportKind = Literal["customers", "products"]
ExportKind = Literal["orders", "customers", "products", "payments", "expenses"]
SupplierFilter = Literal["due"]


def _iso_utc(value: dt.datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc).isoformat()


# Datetimes always leave the API as ISO 8601 with an explicit offset ("...+00:00").
DateTimeOut = Annotated[dt.datetime, PlainSerializer(_iso_utc, return_type=str, when_used="json")]

# Inputs: finite numbers within sane bounds. Sign/limit rules live in the services.
# Ids must fit SQLite's signed 64-bit INTEGER: a larger Python int can't even be bound as a
# query parameter (the driver raises OverflowError), so such ids are rejected up front (422).
DB_INT_MAX = 2**63 - 1
IdIn = Annotated[int, Field(ge=-DB_INT_MAX, le=DB_INT_MAX)]
MoneyIn = Annotated[float, Field(allow_inf_nan=False, ge=-1_000_000_000, le=1_000_000_000)]
QuantityIn = Annotated[float, Field(allow_inf_nan=False, ge=-10_000_000, le=10_000_000)]
NameText = Annotated[str, Field(max_length=160)]
ShortText = Annotated[str, Field(max_length=500)]
LongText = Annotated[str, Field(max_length=2000)]
Secret = Annotated[str, Field(max_length=128)]

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Shared wrappers
# ---------------------------------------------------------------------------


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class OkResponse(BaseModel):
    ok: bool = True


class TokenRefreshResponse(BaseModel):
    ok: bool = True
    token: str


# ---------------------------------------------------------------------------
# Shop, users, auth
# ---------------------------------------------------------------------------


class Shop(BaseModel):
    id: int
    code: str
    name: str
    owner_name: str
    phone: str
    email: str | None
    address: str
    city: str
    segment: str
    plan: Plan
    upi_id: str | None
    photo_url: str | None
    latitude: float | None
    longitude: float | None
    setup_complete: bool
    portal_catalog: bool
    portal_orders: bool
    created_at: DateTimeOut


Latitude = Annotated[float, Field(allow_inf_nan=False, ge=-90, le=90)]
Longitude = Annotated[float, Field(allow_inf_nan=False, ge=-180, le=180)]


class ShopUpdate(BaseModel):
    name: NameText | None = None
    owner_name: NameText | None = None
    phone: NameText | None = None
    email: NameText | None = None
    address: ShortText | None = None
    city: NameText | None = None
    segment: NameText | None = None
    upi_id: NameText | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    portal_catalog: bool | None = None
    portal_orders: bool | None = None


class User(BaseModel):
    id: int
    name: str
    email: str | None
    phone: str | None
    role: Role
    is_active: bool
    last_login_at: DateTimeOut | None
    created_at: DateTimeOut


class Session(BaseModel):
    user: User
    shop: Shop
    permissions: list[Permission]


class AuthResponse(Session):
    token: str


class LoginRequest(BaseModel):
    identifier: Annotated[str, Field(max_length=254)]
    password: Secret


class SignupRequest(BaseModel):
    shop_name: NameText
    owner_name: NameText
    phone: NameText
    email: Annotated[str, Field(max_length=254)] | None = None
    password: Secret
    city: NameText | None = None
    segment: NameText | None = None


class ChangePasswordRequest(BaseModel):
    current_password: Secret
    new_password: Secret


class StaffCreate(BaseModel):
    name: NameText
    email: Annotated[str, Field(max_length=254)] | None = None
    phone: NameText | None = None
    role: StaffRole
    password: Secret


class StaffUpdate(BaseModel):
    name: NameText | None = None
    role: StaffRole | None = None
    is_active: bool | None = None
    password: Secret | None = None


class RolePermissions(BaseModel):
    role: Role
    permissions: list[Permission]
    editable: bool


class RolePermissionsUpdate(BaseModel):
    permissions: Annotated[list[Permission], Field(max_length=50)]


# ---------------------------------------------------------------------------
# Customers and khata
# ---------------------------------------------------------------------------


class Customer(BaseModel):
    id: int
    name: str
    phone: str
    address: str
    notes: str
    preferred_products: list[str]
    total_purchases: float
    total_paid: float
    outstanding: float
    orders_count: int
    last_order_at: DateTimeOut | None
    last_order_total: float | None
    promise_date: dt.date | None
    promise_amount: float | None
    promise_note: str
    promise_overdue: bool
    created_at: DateTimeOut


class CustomerInput(BaseModel):
    name: NameText
    phone: NameText
    address: ShortText | None = None
    notes: LongText | None = None
    preferred_products: Annotated[list[NameText], Field(max_length=50)] | None = None


class CustomerUpdate(BaseModel):
    name: NameText | None = None
    phone: NameText | None = None
    address: ShortText | None = None
    notes: LongText | None = None
    preferred_products: Annotated[list[NameText], Field(max_length=50)] | None = None


class PromiseInput(BaseModel):
    date: dt.date
    amount: MoneyIn | None = None
    note: ShortText | None = None


class LedgerEntry(BaseModel):
    id: str
    date: DateTimeOut
    type: LedgerEntryType
    description: str
    amount: float
    balance: float
    order_id: int | None
    order_number: int | None
    payment_id: int | None
    method: PaymentMethod | None


class Ledger(BaseModel):
    customer_id: int
    entries: list[LedgerEntry]
    outstanding: float


class CustomerPaymentRequest(BaseModel):
    amount: MoneyIn
    method: PaymentMethod
    note: ShortText | None = None


class PaymentAllocation(BaseModel):
    order_id: int
    order_number: int
    amount: float


class Payment(BaseModel):
    id: int
    order_id: int | None
    order_number: int | None
    customer_id: int | None
    customer_name: str | None
    amount: float
    method: PaymentMethod
    note: str
    paid_at: DateTimeOut
    received_by_name: str | None
    batch_id: str | None


class CustomerPaymentResult(BaseModel):
    batch_id: str
    total: float
    allocations: list[PaymentAllocation]
    payments: list[Payment]
    outstanding: float


# ---------------------------------------------------------------------------
# Products and inventory
# ---------------------------------------------------------------------------


class Product(BaseModel):
    id: int
    name: str
    category: str
    unit: ProductUnit
    sku: str | None
    stock_quantity: float
    min_stock_level: float
    reserved_quantity: float
    purchase_price: float
    selling_price: float
    low_stock: bool
    stock_value: float
    margin_percent: float | None
    is_archived: bool
    created_at: DateTimeOut
    updated_at: DateTimeOut


class ProductInput(BaseModel):
    name: NameText
    category: NameText
    unit: ProductUnit = "pcs"
    sku: Annotated[str, Field(max_length=64)] | None = None
    stock_quantity: QuantityIn = 0
    min_stock_level: QuantityIn = 0
    purchase_price: MoneyIn = 0
    selling_price: MoneyIn


class ProductUpdate(BaseModel):
    name: NameText | None = None
    category: NameText | None = None
    unit: ProductUnit | None = None
    sku: Annotated[str, Field(max_length=64)] | None = None
    min_stock_level: QuantityIn | None = None
    purchase_price: MoneyIn | None = None
    selling_price: MoneyIn | None = None


class StockAdjustmentRequest(BaseModel):
    mode: StockMode
    quantity: QuantityIn
    reason: StockReason
    note: ShortText | None = None


class InventoryTransaction(BaseModel):
    id: int
    product_id: int
    product_name: str
    type: InventoryTxType
    quantity_change: float
    stock_after: float
    reason: StockReason | None
    note: str
    order_id: int | None
    order_number: int | None
    purchase_id: int | None
    created_by_name: str | None
    created_at: DateTimeOut


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


class OrderItem(BaseModel):
    id: int
    product_id: int | None
    name: str
    unit: str
    quantity: float
    unit_price: float
    discount: float
    line_total: float


class Order(BaseModel):
    id: int
    number: int
    customer_id: int | None
    customer_name: str | None
    customer_phone: str | None
    status: OrderStatus
    payment_status: PaymentStatus
    fulfillment: Fulfillment
    channel: Channel
    due_at: DateTimeOut | None
    is_overdue: bool
    delivery_address: str
    notes: str
    items: list[OrderItem]
    item_count: int
    subtotal: float
    discount: float
    total: float
    paid: float
    outstanding: float
    created_at: DateTimeOut
    updated_at: DateTimeOut
    completed_at: DateTimeOut | None
    created_by_name: str | None


class OrderDetail(Order):
    payments: list[Payment]
    next_statuses: list[OrderStatus]
    stock_deducted: bool


class OrderItemInput(BaseModel):
    product_id: IdIn | None = None
    name: NameText | None = None
    quantity: QuantityIn
    unit_price: MoneyIn | None = None
    discount: MoneyIn | None = None


class PaymentNow(BaseModel):
    amount: MoneyIn
    method: PaymentMethod


class OrderCreate(BaseModel):
    customer_id: IdIn | None = None
    items: Annotated[list[OrderItemInput], Field(max_length=200)]
    fulfillment: Fulfillment = "pickup"
    channel: Channel = "walk_in"
    status: OrderCreateStatus = "new"
    due_at: dt.datetime | None = None
    delivery_address: ShortText | None = None
    notes: LongText | None = None
    discount: MoneyIn | None = None
    payment: PaymentNow | None = None


class OrderUpdate(BaseModel):
    customer_id: IdIn | None = None
    items: Annotated[list[OrderItemInput], Field(max_length=200)] | None = None
    fulfillment: Fulfillment | None = None
    channel: Channel | None = None
    due_at: dt.datetime | None = None
    delivery_address: ShortText | None = None
    notes: LongText | None = None
    discount: MoneyIn | None = None


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderPaymentRequest(BaseModel):
    amount: MoneyIn
    method: PaymentMethod
    note: ShortText | None = None


# ---------------------------------------------------------------------------
# Payments
# ---------------------------------------------------------------------------


class MethodTotal(BaseModel):
    method: PaymentMethod
    amount: float
    count: int


class PaymentSummary(BaseModel):
    today: float
    week: float
    month: float
    by_method: list[MethodTotal]


# ---------------------------------------------------------------------------
# Suppliers and purchases
# ---------------------------------------------------------------------------


class Supplier(BaseModel):
    id: int
    name: str
    phone: str
    contact_person: str | None
    address: str
    notes: str
    supplies: str
    outstanding: float
    total_purchased: float
    total_paid: float
    last_purchase_at: DateTimeOut | None
    created_at: DateTimeOut


class SupplierInput(BaseModel):
    name: NameText
    phone: NameText
    contact_person: NameText | None = None
    address: ShortText | None = None
    notes: LongText | None = None
    supplies: ShortText | None = None
    opening_balance: MoneyIn | None = None


class SupplierUpdate(BaseModel):
    name: NameText | None = None
    phone: NameText | None = None
    contact_person: NameText | None = None
    address: ShortText | None = None
    notes: LongText | None = None
    supplies: ShortText | None = None


class PurchaseItem(BaseModel):
    product_id: int
    name: str
    quantity: float
    unit_cost: float
    line_total: float


class Purchase(BaseModel):
    id: int
    supplier_id: int
    supplier_name: str
    items: list[PurchaseItem]
    total: float
    note: str
    purchased_at: DateTimeOut
    created_by_name: str | None


class PurchaseItemInput(BaseModel):
    product_id: IdIn
    quantity: QuantityIn
    unit_cost: MoneyIn


class PurchaseCreate(BaseModel):
    items: Annotated[list[PurchaseItemInput], Field(max_length=200)]
    paid_amount: MoneyIn | None = None
    method: PaymentMethod | None = None
    note: ShortText | None = None
    update_cost_price: bool = True


class SupplierPayment(BaseModel):
    id: int
    supplier_id: int
    amount: float
    method: PaymentMethod
    note: str
    paid_at: DateTimeOut


class SupplierPaymentRequest(BaseModel):
    amount: MoneyIn
    method: PaymentMethod
    note: ShortText | None = None


class SupplierDetail(Supplier):
    purchases: list[Purchase]
    payments: list[SupplierPayment]


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------


class Expense(BaseModel):
    id: int
    category: ExpenseCategory
    amount: float
    note: str
    spent_at: DateTimeOut
    created_by_name: str | None


class ExpenseInput(BaseModel):
    category: ExpenseCategory
    amount: MoneyIn
    note: ShortText | None = None
    spent_at: dt.datetime | None = None


class ExpenseUpdate(BaseModel):
    category: ExpenseCategory | None = None
    amount: MoneyIn | None = None
    note: ShortText | None = None
    spent_at: dt.datetime | None = None


class CategoryTotal(BaseModel):
    category: ExpenseCategory
    amount: float
    count: int


class ExpenseSummary(BaseModel):
    total: float
    by_category: list[CategoryTotal]


# ---------------------------------------------------------------------------
# Dashboard and attention
# ---------------------------------------------------------------------------


class AttentionItem(BaseModel):
    key: AttentionKey
    label: str
    count: int
    amount: float | None
    detail: str | None
    severity: Severity
    href: str


class DashboardMetrics(BaseModel):
    sales: float
    orders: int
    payments_received: float
    outstanding: float
    pending_pickups: int
    pending_deliveries: int
    low_stock: int
    expenses: float
    yesterday_sales: float
    yesterday_orders: int
    yesterday_payments: float


class DailyPoint(BaseModel):
    date: dt.date
    sales: float
    orders: int


class SetupProgress(BaseModel):
    has_products: bool
    has_customers: bool
    has_orders: bool
    has_staff: bool


class Dashboard(BaseModel):
    date: dt.date
    metrics: DashboardMetrics
    attention: list[AttentionItem]
    pickups: list[Order]
    recent_orders: list[Order]
    low_stock: list[Product]
    sales_7d: list[DailyPoint]
    setup: SetupProgress


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


class ReportTotals(BaseModel):
    sales: float
    orders: int
    avg_order_value: float
    gross_profit: float
    payments_received: float
    expenses: float
    net_profit: float


class SeriesPoint(BaseModel):
    label: str
    start: dt.date
    sales: float
    orders: int


class ProductSales(BaseModel):
    product_id: int | None
    name: str
    category: str
    quantity: float
    sales: float
    profit: float


class CategorySales(BaseModel):
    category: str
    quantity: float
    sales: float


class TopCustomer(BaseModel):
    id: int
    name: str
    phone: str
    total: float
    orders: int


class CustomerDue(BaseModel):
    id: int
    name: str
    phone: str
    outstanding: float


class ProductMovement(BaseModel):
    product_id: int
    name: str
    unit: ProductUnit
    quantity: float
    stock_quantity: float


class ReportPrevious(BaseModel):
    sales: float
    orders: int


class ReportCustomers(BaseModel):
    top: list[TopCustomer]
    new_count: int
    repeat_count: int
    active_count: int
    with_dues: list[CustomerDue]


class ReportPayments(BaseModel):
    received: float
    outstanding: float
    partial_orders: int
    by_method: list[MethodTotal]


class ReportInventory(BaseModel):
    fast_moving: list[ProductMovement]
    slow_moving: list[ProductMovement]
    low_stock: list[Product]


class Report(BaseModel):
    range: ReportRange
    date_from: dt.date
    date_to: dt.date
    bucket: ReportBucket
    totals: ReportTotals
    previous: ReportPrevious
    series: list[SeriesPoint]
    by_product: list[ProductSales]
    by_category: list[CategorySales]
    customers: ReportCustomers
    payments: ReportPayments
    inventory: ReportInventory
    expenses: ExpenseSummary


# ---------------------------------------------------------------------------
# Search, import, export
# ---------------------------------------------------------------------------


class SearchResults(BaseModel):
    customers: list[Customer]
    orders: list[Order]
    products: list[Product]


class ImportRequest(BaseModel):
    csv: Annotated[str, Field(max_length=5_000_000)]


class ImportRowError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[ImportRowError]


# ---------------------------------------------------------------------------
# Customer khata links (the customer side)
# ---------------------------------------------------------------------------


class PortalLink(BaseModel):
    """What a shopkeeper shares on WhatsApp: ``path`` is ``/c/<token>`` on the ShopOS site."""

    token: str
    path: str
    last_seen_at: DateTimeOut | None


class PortalShop(BaseModel):
    code: str
    name: str
    phone: str
    address: str
    city: str
    photo_url: str | None
    latitude: float | None
    longitude: float | None
    upi_id: str | None
    catalog_enabled: bool
    orders_enabled: bool


class PortalCustomer(BaseModel):
    name: str
    phone: str
    outstanding: float
    promise_date: dt.date | None
    promise_amount: float | None


class PortalOrderItem(BaseModel):
    name: str
    unit: str
    quantity: float
    unit_price: float
    line_total: float


class PortalOrder(BaseModel):
    id: int
    number: int
    status: OrderStatus
    payment_status: PaymentStatus
    fulfillment: Fulfillment
    channel: Channel
    total: float
    paid: float
    outstanding: float
    due_at: DateTimeOut | None
    created_at: DateTimeOut
    completed_at: DateTimeOut | None
    items: list[PortalOrderItem]


class PortalView(BaseModel):
    shop: PortalShop
    customer: PortalCustomer
    ledger: list[LedgerEntry]
    orders: list[PortalOrder]


class PortalProduct(BaseModel):
    id: int
    name: str
    category: str
    unit: str
    price: float
    in_stock: bool


class PortalOrderLine(BaseModel):
    product_id: IdIn
    quantity: QuantityIn


class PortalOrderCreate(BaseModel):
    items: Annotated[list[PortalOrderLine], Field(min_length=1, max_length=50)]
    fulfillment: Fulfillment = "pickup"
    delivery_address: ShortText | None = None
    notes: LongText | None = None


# ---------------------------------------------------------------------------
# ShopOS admin (developers and operators)
# ---------------------------------------------------------------------------


class AdminUser(BaseModel):
    id: int
    email: str
    name: str
    last_login_at: DateTimeOut | None


class AdminLoginRequest(BaseModel):
    email: Annotated[str, Field(max_length=254)]
    password: Secret


class AdminAuthResponse(BaseModel):
    token: str
    admin: AdminUser


AdminShopStatus = Literal["all", "active", "suspended", "setup_incomplete", "demo"]


class AdminShopRow(BaseModel):
    id: int
    code: str
    name: str
    owner_name: str
    phone: str
    email: str | None
    city: str
    plan: Plan
    photo_url: str | None
    latitude: float | None
    longitude: float | None
    setup_complete: bool
    is_suspended: bool
    is_demo: bool
    created_at: DateTimeOut
    last_active_at: DateTimeOut | None
    orders_count: int
    customers_count: int


class AdminAction(BaseModel):
    id: int
    action: str
    detail: str
    admin_name: str
    created_at: DateTimeOut


class AdminShopTotals(BaseModel):
    sales_30d: float
    orders_30d: int
    outstanding: float
    products: int
    staff: int


class AdminShopDetail(AdminShopRow):
    address: str
    segment: str
    upi_id: str | None
    suspended_reason: str
    suspended_at: DateTimeOut | None
    users: list[User]
    totals: AdminShopTotals
    actions: list[AdminAction]


class AdminSuspendRequest(BaseModel):
    reason: ShortText


class AdminShopUpdate(BaseModel):
    plan: Plan


class AdminDailyCount(BaseModel):
    date: dt.date
    count: int


class AdminPlanCount(BaseModel):
    plan: Plan
    count: int


class AdminStats(BaseModel):
    """Real shops only: the demo shop is left out of every number here."""

    shops_total: int
    shops_active_7d: int
    shops_new_30d: int
    shops_suspended: int
    shops_setup_incomplete: int
    customers_total: int
    orders_30d: int
    gmv_30d: float
    signups_30d: list[AdminDailyCount]
    by_plan: list[AdminPlanCount]
