// ShopOS API contract: the single source of truth for every JSON shape exchanged
// between the FastAPI backend and this frontend. The backend MUST produce exactly
// these shapes (snake_case keys, same nullability); the frontend MUST NOT invent others.
//
// Conventions
// - Money: rupees as JSON numbers with at most 2 decimals (backend stores integer paise).
// - Quantities: JSON numbers with at most 3 decimals (loose goods such as 2.5 kg are allowed).
// - Datetimes: ISO 8601 strings that include a UTC offset, e.g. "2026-10-04T09:30:00+00:00".
// - Dates: "YYYY-MM-DD". "Today" boundaries are computed by the backend in IST (UTC+05:30).
// - IDs: integers. Orders also carry a per-shop display `number` (starts at 1001).
// - Errors: 4xx bodies are `{ "detail": string }`; 422 validation bodies are FastAPI's
//   default `{ "detail": [{ "loc": [...], "msg": string, "type": string }] }`.

export type ID = number;
export type Money = number;
export type Quantity = number;
export type ISODateTime = string;
export type ISODate = string;

// ---------------------------------------------------------------------------
// Enums (API values are always these lowercase codes; UI labels live in lib/constants.ts)
// ---------------------------------------------------------------------------

export type Role = "owner" | "manager" | "employee" | "accountant";
export type StaffRole = Exclude<Role, "owner">;

export type Permission =
  | "dashboard"
  | "orders"
  | "customers"
  | "payments"
  | "inventory"
  | "suppliers"
  | "expenses"
  | "reports"
  | "staff"
  | "settings";

export type OrderStatus = "new" | "preparing" | "ready" | "collected" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid";
export type Fulfillment = "pickup" | "delivery";
export type Channel = "walk_in" | "phone" | "whatsapp" | "online"; // online: sent by the customer through their khata link
export type PaymentMethod = "cash" | "upi" | "card" | "bank_transfer";
export type ProductUnit = "pcs" | "kg" | "g" | "l" | "ml" | "pack" | "dozen" | "box";
export type ExpenseCategory =
  | "rent"
  | "electricity"
  | "salaries"
  | "transportation"
  | "repairs"
  | "supplier"
  | "miscellaneous";
export type StockReason = "restock" | "damage" | "correction" | "return" | "other";
export type InventoryTxType = "opening" | "sale" | "sale_reversal" | "purchase" | "adjustment";
export type Plan = "free" | "basic" | "pro" | "business";
export type Severity = "high" | "medium" | "low";
export type ReportRange = "7d" | "30d" | "90d" | "12m";
export type ReportBucket = "day" | "week" | "month";

// ---------------------------------------------------------------------------
// Shared wrappers
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  total: number; // total matching rows (ignoring limit/offset)
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Shop, users, auth
// ---------------------------------------------------------------------------

export interface Shop {
  id: ID;
  code: string; // public shop ID, e.g. "SO-7K2Q9M"
  name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  segment: string; // e.g. "Grocery", "Pharmacy", "Hardware" (free text, UI offers a list)
  plan: Plan;
  upi_id: string | null; // used to print a UPI QR on receipts with dues
  photo_url: string | null; // the shop front, "/api/media/shops/<file>.jpg"
  latitude: number | null;
  longitude: number | null;
  /** Photo, address and map pin are all in. Until then only the setup screen opens. */
  setup_complete: boolean;
  portal_catalog: boolean; // customers see products and prices on their khata link
  portal_orders: boolean; // customers can send orders through their khata link
  created_at: ISODateTime;
}

export interface ShopUpdate {
  name?: string;
  owner_name?: string;
  phone?: string;
  email?: string | null;
  address?: string;
  city?: string;
  segment?: string;
  upi_id?: string | null;
  latitude?: number | null; // set together with longitude
  longitude?: number | null;
  portal_catalog?: boolean;
  portal_orders?: boolean;
}

export interface User {
  id: ID;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
  last_login_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface Session {
  user: User;
  shop: Shop;
  permissions: Permission[]; // effective permissions of the signed-in user
}

export interface AuthResponse extends Session {
  token: string; // send as `Authorization: Bearer <token>`
}

export interface LoginRequest {
  identifier: string; // email or phone number
  password: string;
}

export interface SignupRequest {
  shop_name: string;
  owner_name: string;
  phone: string;
  email?: string | null;
  password: string; // min 8 chars
  city?: string;
  segment?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string; // min 8 chars
}

export interface StaffCreate {
  name: string;
  email?: string | null;
  phone?: string | null; // at least one of email / phone is required
  role: StaffRole;
  password: string; // temporary password, min 8 chars
}

export interface StaffUpdate {
  name?: string;
  role?: StaffRole;
  is_active?: boolean;
  password?: string; // owner resets a staff password
}

export interface RolePermissions {
  role: Role;
  permissions: Permission[];
  editable: boolean; // false for "owner" (always has everything)
}

export interface RolePermissionsUpdate {
  permissions: Permission[];
}

// ---------------------------------------------------------------------------
// Customers and khata (credit ledger)
// ---------------------------------------------------------------------------

export interface Customer {
  id: ID;
  name: string;
  phone: string;
  address: string;
  notes: string;
  preferred_products: string[];
  total_purchases: Money; // sum of non-cancelled order totals
  total_paid: Money; // sum of non-voided payments
  outstanding: Money; // total_purchases - total_paid (never negative)
  orders_count: number; // non-cancelled orders
  last_order_at: ISODateTime | null;
  last_order_total: Money | null;
  promise_date: ISODate | null; // date the customer promised to pay by
  promise_amount: Money | null;
  promise_note: string;
  promise_overdue: boolean; // promise_date < today (IST) and outstanding > 0
  created_at: ISODateTime;
}

export interface CustomerInput {
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  preferred_products?: string[];
}

export type CustomerFilter = "all" | "dues" | "promises";
export type CustomerSort = "name" | "outstanding" | "recent";

export interface CustomerListParams {
  search?: string; // matches name or phone
  filter?: CustomerFilter; // dues = outstanding > 0, promises = has an active promise
  sort?: CustomerSort; // default "name"
}

export interface PromiseInput {
  date: ISODate;
  amount?: Money | null;
  note?: string;
}

export interface LedgerEntry {
  id: string; // "order-<id>" or "payment-<id>"
  date: ISODateTime;
  type: "purchase" | "payment";
  description: string; // e.g. "Order #1045" or "Payment · UPI · Order #1045"
  amount: Money; // positive for purchases, negative for payments
  balance: Money; // running balance after this entry
  order_id: ID | null;
  order_number: number | null;
  payment_id: ID | null;
  method: PaymentMethod | null;
}

export interface Ledger {
  customer_id: ID;
  entries: LedgerEntry[]; // chronological, oldest first
  outstanding: Money;
}

export interface CustomerPaymentRequest {
  amount: Money; // must be > 0 and <= customer outstanding
  method: PaymentMethod;
  note?: string;
}

export interface PaymentAllocation {
  order_id: ID;
  order_number: number;
  amount: Money;
}

export interface CustomerPaymentResult {
  batch_id: string;
  total: Money;
  allocations: PaymentAllocation[]; // oldest unpaid orders first (FIFO)
  payments: Payment[];
  outstanding: Money; // customer outstanding after the payment
}

// ---------------------------------------------------------------------------
// Products and inventory
// ---------------------------------------------------------------------------

export interface Product {
  id: ID;
  name: string;
  category: string;
  unit: ProductUnit;
  sku: string | null;
  stock_quantity: Quantity;
  min_stock_level: Quantity;
  reserved_quantity: Quantity; // quantity in open (new/preparing/ready) orders
  purchase_price: Money;
  selling_price: Money;
  low_stock: boolean; // stock_quantity <= min_stock_level
  stock_value: Money; // stock_quantity * purchase_price
  margin_percent: number | null; // (selling - purchase) / selling * 100, null if selling_price == 0
  is_archived: boolean;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ProductInput {
  name: string;
  category: string;
  unit?: ProductUnit; // default "pcs"
  sku?: string | null;
  stock_quantity?: Quantity; // create only: opening stock (recorded as an "opening" transaction)
  min_stock_level?: Quantity;
  purchase_price?: Money;
  selling_price: Money;
}

export interface ProductListParams {
  search?: string; // matches name, sku or category
  category?: string;
  low_stock?: boolean;
  include_archived?: boolean;
}

export interface StockAdjustmentRequest {
  mode: "add" | "remove" | "set"; // set = physical count
  quantity: Quantity; // > 0 for add/remove, >= 0 for set
  reason: StockReason;
  note?: string;
}

export interface InventoryTransaction {
  id: ID;
  product_id: ID;
  product_name: string;
  type: InventoryTxType;
  quantity_change: Quantity; // signed
  stock_after: Quantity;
  reason: StockReason | null; // only for "adjustment"
  note: string;
  order_id: ID | null;
  order_number: number | null;
  purchase_id: ID | null;
  created_by_name: string | null;
  created_at: ISODateTime;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderItem {
  id: ID;
  product_id: ID | null; // null for a custom (non-inventory) item
  name: string; // snapshot at order time
  unit: string;
  quantity: Quantity;
  unit_price: Money;
  discount: Money; // line discount
  line_total: Money; // quantity * unit_price - discount
}

export interface Order {
  id: ID;
  number: number; // display as "#1045"
  customer_id: ID | null; // null = anonymous walk-in (must be fully paid)
  customer_name: string | null;
  customer_phone: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment: Fulfillment;
  channel: Channel;
  due_at: ISODateTime | null; // promised pickup / delivery time
  is_overdue: boolean; // due_at < now and status in new/preparing/ready
  delivery_address: string;
  notes: string;
  items: OrderItem[];
  item_count: number; // number of lines
  subtotal: Money; // sum of line totals
  discount: Money; // order-level discount
  total: Money; // subtotal - discount
  paid: Money; // sum of non-voided payments
  outstanding: Money; // total - paid
  created_at: ISODateTime;
  updated_at: ISODateTime;
  completed_at: ISODateTime | null;
  created_by_name: string | null;
}

export interface OrderDetail extends Order {
  payments: Payment[]; // oldest first
  next_statuses: OrderStatus[]; // statuses the order may move to right now
  stock_deducted: boolean;
}

export interface OrderItemInput {
  product_id?: ID | null; // omit for a custom item (then `name` and `unit_price` are required)
  name?: string;
  quantity: Quantity; // > 0
  unit_price?: Money; // defaults to the product's selling_price
  discount?: Money; // line discount, <= quantity * unit_price
}

export type OrderCreateStatus = "new" | "preparing" | "ready" | "collected" | "delivered";

export interface OrderCreate {
  customer_id?: ID | null;
  items: OrderItemInput[]; // at least one
  fulfillment?: Fulfillment; // default "pickup"
  channel?: Channel; // default "walk_in"
  status?: OrderCreateStatus; // default "new"; "collected"/"delivered" = completed at the counter
  due_at?: ISODateTime | null;
  delivery_address?: string;
  notes?: string;
  discount?: Money; // order-level discount
  payment?: { amount: Money; method: PaymentMethod } | null; // paid now (<= total)
}

export interface OrderUpdate {
  // Items/discount may only change while the order is new/preparing/ready.
  customer_id?: ID | null;
  items?: OrderItemInput[];
  fulfillment?: Fulfillment;
  channel?: Channel;
  due_at?: ISODateTime | null;
  delivery_address?: string;
  notes?: string;
  discount?: Money;
}

export interface OrderStatusUpdate {
  status: OrderStatus;
}

export interface OrderPaymentRequest {
  amount: Money; // > 0 and <= order outstanding
  method: PaymentMethod;
  note?: string;
}

export type OrderStatusFilter = OrderStatus | "open" | "completed"; // open = new/preparing/ready

export interface OrderFilters {
  search?: string; // order number, customer name/phone, product name
  status?: OrderStatusFilter;
  payment_status?: PaymentStatus;
  fulfillment?: Fulfillment;
  channel?: Channel;
  customer_id?: ID;
  date_from?: ISODate; // inclusive, IST
  date_to?: ISODate; // inclusive, IST
  limit?: number; // default 50, max 200
  offset?: number;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface Payment {
  id: ID;
  order_id: ID | null;
  order_number: number | null;
  customer_id: ID | null;
  customer_name: string | null;
  amount: Money;
  method: PaymentMethod;
  note: string;
  paid_at: ISODateTime;
  received_by_name: string | null;
  batch_id: string | null; // groups payments created by one customer-level payment
}

export interface PaymentFilters {
  method?: PaymentMethod;
  customer_id?: ID;
  date_from?: ISODate;
  date_to?: ISODate;
  limit?: number;
  offset?: number;
}

export interface MethodTotal {
  method: PaymentMethod;
  amount: Money;
  count: number;
}

export interface PaymentSummary {
  today: Money;
  week: Money; // last 7 days including today
  month: Money; // current calendar month (IST)
  by_method: MethodTotal[]; // current calendar month
}

// ---------------------------------------------------------------------------
// Suppliers and purchases
// ---------------------------------------------------------------------------

export interface Supplier {
  id: ID;
  name: string;
  phone: string;
  contact_person: string | null;
  address: string;
  notes: string;
  supplies: string; // free text, e.g. "Rice, dal, flour"
  outstanding: Money; // opening_balance + purchases - payments
  total_purchased: Money;
  total_paid: Money;
  last_purchase_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface SupplierInput {
  name: string;
  phone: string;
  contact_person?: string | null;
  address?: string;
  notes?: string;
  supplies?: string;
  opening_balance?: Money; // create only: amount already owed to this supplier
}

export interface PurchaseItem {
  product_id: ID;
  name: string;
  quantity: Quantity;
  unit_cost: Money;
  line_total: Money;
}

export interface Purchase {
  id: ID;
  supplier_id: ID;
  supplier_name: string;
  items: PurchaseItem[];
  total: Money;
  note: string;
  purchased_at: ISODateTime;
  created_by_name: string | null;
}

export interface PurchaseCreate {
  items: { product_id: ID; quantity: Quantity; unit_cost: Money }[]; // stock goes up by quantity
  paid_amount?: Money; // paid to the supplier now (<= total)
  method?: PaymentMethod; // required when paid_amount > 0
  note?: string;
  update_cost_price?: boolean; // default true: product.purchase_price = unit_cost
}

export interface SupplierPayment {
  id: ID;
  supplier_id: ID;
  amount: Money;
  method: PaymentMethod;
  note: string;
  paid_at: ISODateTime;
}

export interface SupplierPaymentRequest {
  amount: Money; // > 0 and <= supplier outstanding
  method: PaymentMethod;
  note?: string;
}

export interface SupplierDetail extends Supplier {
  purchases: Purchase[]; // newest first
  payments: SupplierPayment[]; // newest first
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface Expense {
  id: ID;
  category: ExpenseCategory;
  amount: Money;
  note: string;
  spent_at: ISODateTime;
  created_by_name: string | null;
}

export interface ExpenseInput {
  category: ExpenseCategory;
  amount: Money; // > 0
  note?: string;
  spent_at?: ISODateTime; // default now
}

export interface ExpenseFilters {
  category?: ExpenseCategory;
  date_from?: ISODate;
  date_to?: ISODate;
  limit?: number;
  offset?: number;
}

export interface CategoryTotal {
  category: ExpenseCategory;
  amount: Money;
  count: number;
}

export interface ExpenseSummary {
  total: Money;
  by_category: CategoryTotal[]; // sorted by amount desc
}

// ---------------------------------------------------------------------------
// Dashboard ("Today") and attention queue
// ---------------------------------------------------------------------------

export type AttentionKey =
  | "online_orders"
  | "pickups"
  | "ready_unpaid"
  | "customer_dues"
  | "promises"
  | "low_stock"
  | "deliveries"
  | "supplier_dues";

export interface AttentionItem {
  key: AttentionKey;
  label: string; // sentence without the leading number, pluralised for `count`, e.g. "orders waiting for pickup"
  count: number;
  amount: Money | null; // set for money items (customer_dues, supplier_dues, ready_unpaid)
  detail: string | null; // secondary line, e.g. "2 overdue" or "across 6 customers"
  severity: Severity;
  href: string; // in-app route, e.g. "/app/pickups" or "/app/customers?filter=dues"
}

export interface DashboardMetrics {
  sales: Money; // non-cancelled orders created today
  orders: number;
  payments_received: Money; // payments received today
  outstanding: Money; // all customer dues right now
  pending_pickups: number;
  pending_deliveries: number;
  low_stock: number;
  expenses: Money; // expenses today
  yesterday_sales: Money;
  yesterday_orders: number;
  yesterday_payments: Money;
}

export interface DailyPoint {
  date: ISODate;
  sales: Money;
  orders: number;
}

export interface SetupProgress {
  has_products: boolean;
  has_customers: boolean;
  has_orders: boolean;
  has_staff: boolean; // at least one non-owner user
}

export interface Dashboard {
  date: ISODate; // today in IST
  metrics: DashboardMetrics;
  attention: AttentionItem[]; // only items with count > 0, most severe first
  pickups: Order[]; // up to 6 open pickup orders, ready first, then by due time
  recent_orders: Order[]; // up to 8, newest first
  low_stock: Product[]; // up to 5, lowest stock ratio first
  sales_7d: DailyPoint[]; // exactly 7 points, oldest first, ending today
  setup: SetupProgress;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportTotals {
  sales: Money;
  orders: number;
  avg_order_value: Money;
  gross_profit: Money; // sum(line_total - quantity * unit_cost) over non-cancelled orders
  payments_received: Money;
  expenses: Money;
  net_profit: Money; // gross_profit - expenses
}

export interface SeriesPoint {
  label: string; // "4 Oct", "Week of 29 Sep", "Oct 2026"
  start: ISODate;
  sales: Money;
  orders: number;
}

export interface ProductSales {
  product_id: ID | null;
  name: string;
  category: string;
  quantity: Quantity;
  sales: Money;
  profit: Money;
}

export interface CategorySales {
  category: string;
  quantity: Quantity;
  sales: Money;
}

export interface TopCustomer {
  id: ID;
  name: string;
  phone: string;
  total: Money; // purchases within the range
  orders: number;
}

export interface CustomerDue {
  id: ID;
  name: string;
  phone: string;
  outstanding: Money;
}

export interface ProductMovement {
  product_id: ID;
  name: string;
  unit: ProductUnit;
  quantity: Quantity; // sold within the range
  stock_quantity: Quantity;
}

export interface Report {
  range: ReportRange;
  date_from: ISODate;
  date_to: ISODate;
  bucket: ReportBucket; // day for 7d/30d, week for 90d, month for 12m
  totals: ReportTotals;
  previous: { sales: Money; orders: number }; // the equally long period before date_from
  series: SeriesPoint[]; // oldest first, one point per bucket (zero-filled)
  by_product: ProductSales[]; // sales desc, up to 15
  by_category: CategorySales[]; // sales desc
  customers: {
    top: TopCustomer[]; // up to 8
    new_count: number; // customers created within the range
    repeat_count: number; // customers with 2+ orders within the range
    active_count: number; // customers with 1+ order within the range
    with_dues: CustomerDue[]; // outstanding desc, up to 10 (current, not range-bound)
  };
  payments: {
    received: Money; // within the range
    outstanding: Money; // current total customer dues
    partial_orders: number; // current count of partially paid, non-cancelled orders
    by_method: MethodTotal[]; // within the range
  };
  inventory: {
    fast_moving: ProductMovement[]; // most quantity sold, up to 8
    slow_moving: ProductMovement[]; // least quantity sold (zero included), up to 8
    low_stock: Product[];
  };
  expenses: ExpenseSummary; // within the range
}

// ---------------------------------------------------------------------------
// Search, import, export
// ---------------------------------------------------------------------------

export interface SearchResults {
  customers: Customer[]; // up to 5
  orders: Order[]; // up to 5
  products: Product[]; // up to 5
}

export type ImportKind = "customers" | "products";
export type ExportKind = "orders" | "customers" | "products" | "payments" | "expenses";

export interface ImportRequest {
  csv: string; // raw CSV text with a header row
}

export interface ImportResult {
  created: number;
  updated: number; // rows matched to an existing record (by phone for customers, by name for products)
  skipped: number;
  errors: { row: number; message: string }[]; // row numbers are 1-based, header excluded
}

// ---------------------------------------------------------------------------
// Customer khata links (the customer side, /c/:token)
// ---------------------------------------------------------------------------

/** What a shopkeeper shares on WhatsApp. The same link every time until it is reset. */
export interface PortalLink {
  token: string;
  path: string; // "/c/<token>"
  last_seen_at: ISODateTime | null; // when the customer last opened it
}

export interface PortalShop {
  code: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  upi_id: string | null;
  catalog_enabled: boolean;
  orders_enabled: boolean;
}

export interface PortalCustomer {
  name: string;
  phone: string;
  outstanding: Money;
  promise_date: ISODate | null;
  promise_amount: Money | null;
}

export interface PortalOrderItem {
  name: string;
  unit: string;
  quantity: Quantity;
  unit_price: Money;
  line_total: Money;
}

export interface PortalOrder {
  id: ID;
  number: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment: Fulfillment;
  channel: Channel;
  total: Money;
  paid: Money;
  outstanding: Money;
  due_at: ISODateTime | null;
  created_at: ISODateTime;
  completed_at: ISODateTime | null;
  items: PortalOrderItem[];
}

export interface PortalView {
  shop: PortalShop;
  customer: PortalCustomer;
  ledger: LedgerEntry[]; // chronological, oldest first (the latest 100)
  orders: PortalOrder[]; // newest first (the latest 50)
}

export interface PortalProduct {
  id: ID;
  name: string;
  category: string;
  unit: ProductUnit;
  price: Money;
  in_stock: boolean;
}

export interface PortalOrderCreate {
  items: { product_id: ID; quantity: Quantity }[];
  fulfillment?: Fulfillment;
  delivery_address?: string; // defaults to the customer's saved address
  notes?: string;
}

// ---------------------------------------------------------------------------
// ShopOS admin (/admin): developers and operators, never shop staff
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: ID;
  email: string;
  name: string;
  last_login_at: ISODateTime | null;
}

export interface AdminAuthResponse {
  token: string;
  admin: AdminUser;
}

export type AdminShopStatus = "all" | "active" | "suspended" | "setup_incomplete" | "demo";

export interface AdminShopRow {
  id: ID;
  code: string;
  name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  city: string;
  plan: Plan;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  setup_complete: boolean;
  is_suspended: boolean;
  is_demo: boolean;
  created_at: ISODateTime;
  last_active_at: ISODateTime | null; // latest order or sign-in
  orders_count: number;
  customers_count: number;
}

export interface AdminActionEntry {
  id: ID;
  action: "suspend" | "reactivate" | "plan" | string;
  detail: string;
  admin_name: string;
  created_at: ISODateTime;
}

export interface AdminShopDetail extends AdminShopRow {
  address: string;
  segment: string;
  upi_id: string | null;
  suspended_reason: string;
  suspended_at: ISODateTime | null;
  users: User[];
  totals: { sales_30d: Money; orders_30d: number; outstanding: Money; products: number; staff: number };
  actions: AdminActionEntry[];
}

export interface AdminShopListParams {
  search?: string;
  status?: AdminShopStatus;
  plan?: Plan;
  offset?: number;
  limit?: number;
}

/** Real shops only: the demo shop is left out of every number. */
export interface AdminStats {
  shops_total: number;
  shops_active_7d: number;
  shops_new_30d: number;
  shops_suspended: number;
  shops_setup_incomplete: number;
  customers_total: number;
  orders_30d: number;
  gmv_30d: Money;
  signups_30d: { date: ISODate; count: number }[];
  by_plan: { plan: Plan; count: number }[];
}
