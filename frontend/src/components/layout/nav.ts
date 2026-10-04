import type { LucideIcon } from "lucide-react";
import {
  ChartColumn,
  ClipboardList,
  Download,
  House,
  IndianRupee,
  Package,
  PackageCheck,
  ReceiptIndianRupee,
  Settings,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import type { Permission } from "../../lib/types";

export type NavId =
  | "today"
  | "orders"
  | "pickups"
  | "customers"
  | "payments"
  | "products"
  | "suppliers"
  | "expenses"
  | "reports"
  | "staff"
  | "settings"
  | "get-app";

export interface NavItem {
  id: NavId;
  label: string;
  to: string;
  icon: LucideIcon;
  /** null = every signed-in user. */
  permission: Permission | null;
  section: "main" | "shop";
  /** Match the path exactly (for /app). */
  end?: boolean;
  /** Shown in the phone tab bar; the rest live in the More sheet. */
  tab?: boolean;
  /** Extra words the command palette matches on. */
  keywords?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: "today", label: "Today", to: "/app", icon: House, permission: "dashboard", section: "main", end: true, tab: true, keywords: "dashboard home attention" },
  { id: "orders", label: "Orders", to: "/app/orders", icon: ClipboardList, permission: "orders", section: "main", tab: true, keywords: "sales bills" },
  { id: "pickups", label: "Pickups", to: "/app/pickups", icon: PackageCheck, permission: "orders", section: "main", tab: true, keywords: "deliveries collect ready" },
  { id: "customers", label: "Customers", to: "/app/customers", icon: Users, permission: "customers", section: "main", tab: true, keywords: "khata dues credit udhaar" },
  { id: "payments", label: "Payments", to: "/app/payments", icon: IndianRupee, permission: "payments", section: "main", keywords: "money received upi cash" },
  { id: "products", label: "Products", to: "/app/products", icon: Package, permission: "inventory", section: "main", keywords: "stock inventory items prices" },
  { id: "suppliers", label: "Suppliers", to: "/app/suppliers", icon: Truck, permission: "suppliers", section: "main", keywords: "purchases wholesaler" },
  { id: "expenses", label: "Expenses", to: "/app/expenses", icon: ReceiptIndianRupee, permission: "expenses", section: "main", keywords: "rent electricity salaries bills" },
  { id: "reports", label: "Reports", to: "/app/reports", icon: ChartColumn, permission: "reports", section: "main", keywords: "sales profit analytics" },
  { id: "staff", label: "Staff", to: "/app/staff", icon: UserCog, permission: "staff", section: "shop", keywords: "roles permissions users team" },
  { id: "settings", label: "Settings", to: "/app/settings", icon: Settings, permission: null, section: "shop", keywords: "shop profile import export password upi" },
  { id: "get-app", label: "Get the app", to: "/download", icon: Download, permission: null, section: "shop", keywords: "install download phone pwa" },
];

/** Nav items the current user may open, in display order. */
export function useNavItems(): NavItem[] {
  const { can } = useAuth();
  return NAV_ITEMS.filter((item) => item.permission === null || can(item.permission));
}

/** Where to send a user who lacks `dashboard`: the first app page they can open. */
export function firstPermittedPath(permissions: readonly Permission[]): string {
  const item = NAV_ITEMS.find(
    (entry) => entry.to.startsWith("/app") && (entry.permission === null || permissions.includes(entry.permission)),
  );
  return item?.to ?? "/app/settings";
}

/** True when the current path belongs to the nav item (exact for /app). */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to || pathname === `${item.to}/`;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
