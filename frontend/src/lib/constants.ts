// UI labels for every API enum, plus small domain helpers. API values stay lowercase codes;
// these maps are the only place their human wording lives.

import type {
  Channel,
  ExpenseCategory,
  Fulfillment,
  InventoryTxType,
  OrderCreateStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Permission,
  Plan,
  ProductUnit,
  ReportRange,
  Role,
  Severity,
  StaffRole,
  StockReason,
} from "./types";

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** Turns a label map into `{ value, label }[]` for Select / SegmentedControl, in key order. */
export function toOptions<T extends string>(labels: Readonly<Record<T, string>>, only?: readonly T[]): Option<T>[] {
  const keys = only ?? (Object.keys(labels) as T[]);
  return keys.map((value) => ({ value, label: labels[value] }));
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  collected: "Collected",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Button text for moving an order forward to a status. */
export const ORDER_STATUS_ACTION: Readonly<Record<OrderStatus, string>> = {
  new: "Reopen order",
  preparing: "Start preparing",
  ready: "Mark ready",
  collected: "Mark collected",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
};

/** Toast text after moving an order to a status. */
export const ORDER_STATUS_DONE: Readonly<Record<OrderStatus, string>> = {
  new: "Order reopened",
  preparing: "Marked preparing",
  ready: "Marked ready",
  collected: "Marked collected",
  delivered: "Marked delivered",
  cancelled: "Order cancelled",
};

export const OPEN_STATUSES: readonly OrderStatus[] = ["new", "preparing", "ready"];
export const COMPLETED_STATUSES: readonly OrderStatus[] = ["collected", "delivered"];

export function isOpenStatus(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isCompletedStatus(status: OrderStatus): boolean {
  return COMPLETED_STATUSES.includes(status);
}

/** The finishing status for a fulfillment type: pickup → collected, delivery → delivered. */
export function completedStatusFor(fulfillment: Fulfillment): Extract<OrderCreateStatus, "collected" | "delivered"> {
  return fulfillment === "delivery" ? "delivered" : "collected";
}

/** Status steps shown in a status track for a fulfillment type. */
export function statusStepsFor(fulfillment: Fulfillment): OrderStatus[] {
  return ["new", "preparing", "ready", completedStatusFor(fulfillment)];
}

export const PAYMENT_STATUS_LABEL: Readonly<Record<PaymentStatus, string>> = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
};

export const CHANNEL_LABEL: Readonly<Record<Channel, string>> = {
  walk_in: "Walk-in",
  phone: "Phone",
  whatsapp: "WhatsApp",
};

export const FULFILLMENT_LABEL: Readonly<Record<Fulfillment, string>> = {
  pickup: "Pickup",
  delivery: "Delivery",
};

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
};

/** Short labels for tight segmented controls ("Cash · UPI · Card · Bank"). */
export const METHOD_SHORT_LABEL: Readonly<Record<PaymentMethod, string>> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank",
};

// ---------------------------------------------------------------------------
// Products and inventory
// ---------------------------------------------------------------------------

/** Unit as printed after a number ("2.5 kg", "1 L"). */
export const UNIT_LABEL: Readonly<Record<ProductUnit, string>> = {
  pcs: "pcs",
  kg: "kg",
  g: "g",
  l: "L",
  ml: "ml",
  pack: "pack",
  dozen: "dozen",
  box: "box",
};

/** Unit names for a unit picker. */
export const UNIT_NAME: Readonly<Record<ProductUnit, string>> = {
  pcs: "Pieces (pcs)",
  kg: "Kilogram (kg)",
  g: "Gram (g)",
  l: "Litre (L)",
  ml: "Millilitre (ml)",
  pack: "Pack",
  dozen: "Dozen",
  box: "Box",
};

/** Sensible quantity stepper increments per unit. */
export const UNIT_STEP: Readonly<Record<ProductUnit, number>> = {
  pcs: 1,
  pack: 1,
  dozen: 1,
  box: 1,
  kg: 0.25,
  l: 0.25,
  g: 50,
  ml: 50,
};

/** Stepper increment for any unit string (order items carry the unit as text). */
export function unitStep(unit: string): number {
  return unit in UNIT_STEP ? UNIT_STEP[unit as ProductUnit] : 1;
}

export const STOCK_REASON_LABEL: Readonly<Record<StockReason, string>> = {
  restock: "Restock",
  damage: "Damaged or expired",
  correction: "Count correction",
  return: "Customer return",
  other: "Other",
};

export const INVENTORY_TX_LABEL: Readonly<Record<InventoryTxType, string>> = {
  opening: "Opening stock",
  sale: "Sale",
  sale_reversal: "Sale reversed",
  purchase: "Purchase",
  adjustment: "Adjustment",
};

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORY_LABEL: Readonly<Record<ExpenseCategory, string>> = {
  rent: "Rent",
  electricity: "Electricity",
  salaries: "Salaries",
  transportation: "Transport",
  repairs: "Repairs",
  supplier: "Supplier",
  miscellaneous: "Miscellaneous",
};

// ---------------------------------------------------------------------------
// Staff and permissions
// ---------------------------------------------------------------------------

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  owner: "Owner",
  manager: "Manager",
  employee: "Employee",
  accountant: "Accountant",
};

export const ROLE_DESCRIPTION: Readonly<Record<Role, string>> = {
  owner: "Everything, always. Only the owner can change roles and staff.",
  manager: "Runs the counter: orders, customers, payments, stock, suppliers and reports.",
  employee: "Takes orders and looks after customers and pickups.",
  accountant: "Payments, expenses and reports.",
};

export const STAFF_ROLES: readonly StaffRole[] = ["manager", "employee", "accountant"];

export const ALL_PERMISSIONS: readonly Permission[] = [
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
];

export const PERMISSION_LABEL: Readonly<Record<Permission, string>> = {
  dashboard: "Today",
  orders: "Orders & pickups",
  customers: "Customers & khata",
  payments: "Payments",
  inventory: "Products & stock",
  suppliers: "Suppliers",
  expenses: "Expenses",
  reports: "Reports",
  staff: "Staff",
  settings: "Settings",
};

export const PERMISSION_DESCRIPTION: Readonly<Record<Permission, string>> = {
  dashboard: "See today's sales, dues and what needs attention.",
  orders: "Create orders, update their status, collect payment on them, handle pickups and deliveries.",
  customers: "Open the customer list and khata, record dues payments and payment promises.",
  payments: "See every payment received and void wrong entries.",
  inventory: "Add products, change prices and adjust stock.",
  suppliers: "Record purchases from suppliers and payments to them.",
  expenses: "Record rent, bills, salaries and other running costs.",
  reports: "See sales, profit and customer reports; export orders and payments.",
  staff: "Add staff, turn logins off and choose what each role can do.",
  settings: "Edit the shop profile, import and export data.",
};

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export const SEGMENTS: readonly string[] = [
  "Grocery",
  "Kirana",
  "Supermarket",
  "Pharmacy",
  "Hardware",
  "Stationery",
  "Bakery",
  "Dairy",
  "Fruits & vegetables",
  "Electronics",
  "Mobile & accessories",
  "Clothing",
  "Cosmetics",
  "Other",
];

export const PLAN_LABEL: Readonly<Record<Plan, string>> = {
  free: "Free",
  basic: "Basic",
  pro: "Pro",
  business: "Business",
};

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = {
  high: "Needs action now",
  medium: "Needs attention",
  low: "When you have time",
};

export const REPORT_RANGE_LABEL: Readonly<Record<ReportRange, string>> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
};
