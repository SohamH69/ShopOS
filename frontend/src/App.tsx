import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { firstPermittedPath } from "./components/layout/nav";
import { FullPageLoader } from "./components/layout/PageLoader";
import { RequireAuth } from "./components/layout/RequireAuth";
import { RequirePermission } from "./components/layout/RequirePermission";
import { RouteErrorBoundary } from "./components/layout/RouteErrorBoundary";
import { ToastProvider } from "./components/ui";
import { RequireShopSetup } from "./features/shop-setup/ShopSetupGate";
import { AuthProvider, safeNextPath, useAuth } from "./lib/auth";
import { onIdle } from "./lib/hooks";
import { createQueryClient } from "./lib/queries";
import type { Permission } from "./lib/types";

// ---------------------------------------------------------------------------
// Pages (each one is its own chunk)
// ---------------------------------------------------------------------------

const LandingPage = lazy(() => import("./pages/landing/LandingPage"));
const DownloadPage = lazy(() => import("./pages/download/DownloadPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const SignupPage = lazy(() => import("./pages/auth/SignupPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const ReceiptPage = lazy(() => import("./pages/app/orders/ReceiptPage"));
// The customer side: a customer's khata link, opened from WhatsApp. No sign-in.
const PortalPage = lazy(() => import("./pages/portal/PortalPage"));
// ShopOS admin (developers and operators): its own sign-in, apart from every shop.
const AdminLoginPage = lazy(() => import("./pages/admin/AdminLoginPage"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage"));
const AdminShopPage = lazy(() => import("./pages/admin/AdminShopPage"));

// App pages: the same loaders feed lazy() and the idle prefetch, keyed by the permission they need.
const appPages = {
  dashboard: { permission: "dashboard", load: () => import("./pages/app/dashboard/DashboardPage") },
  orders: { permission: "orders", load: () => import("./pages/app/orders/OrdersPage") },
  pickups: { permission: "orders", load: () => import("./pages/app/pickups/PickupsPage") },
  customers: { permission: "customers", load: () => import("./pages/app/customers/CustomersPage") },
  customerDetail: { permission: "customers", load: () => import("./pages/app/customers/CustomerDetailPage") },
  payments: { permission: "payments", load: () => import("./pages/app/payments/PaymentsPage") },
  products: { permission: "inventory", load: () => import("./pages/app/products/ProductsPage") },
  suppliers: { permission: "suppliers", load: () => import("./pages/app/suppliers/SuppliersPage") },
  supplierDetail: { permission: "suppliers", load: () => import("./pages/app/suppliers/SupplierDetailPage") },
  expenses: { permission: "expenses", load: () => import("./pages/app/expenses/ExpensesPage") },
  reports: { permission: "reports", load: () => import("./pages/app/reports/ReportsPage") },
  staff: { permission: "staff", load: () => import("./pages/app/staff/StaffPage") },
  settings: { permission: null, load: () => import("./pages/app/settings/SettingsPage") },
} satisfies Record<string, { permission: Permission | null; load: () => Promise<unknown> }>;

const DashboardPage = lazy(appPages.dashboard.load);
const OrdersPage = lazy(appPages.orders.load);
const PickupsPage = lazy(appPages.pickups.load);
const CustomersPage = lazy(appPages.customers.load);
const CustomerDetailPage = lazy(appPages.customerDetail.load);
const PaymentsPage = lazy(appPages.payments.load);
const ProductsPage = lazy(appPages.products.load);
const SuppliersPage = lazy(appPages.suppliers.load);
const SupplierDetailPage = lazy(appPages.supplierDetail.load);
const ExpensesPage = lazy(appPages.expenses.load);
const ReportsPage = lazy(appPages.reports.load);
const StaffPage = lazy(appPages.staff.load);
const SettingsPage = lazy(appPages.settings.load);

// The design QA gallery exists only in development builds.
const KitPage = import.meta.env.DEV ? lazy(() => import("./pages/dev/KitPage")) : null;

const queryClient = createQueryClient();

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/** Login and signup are for signed-out visitors; signed-in users continue to ?next= (or /app). */
function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageLoader />;
  if (status === "signedIn") {
    return <Navigate to={safeNextPath(new URLSearchParams(location.search).get("next"))} replace />;
  }
  return <>{children}</>;
}

/** /app shows Today, or the first page the user's role allows (keeping ?new=1 and friends). */
function DashboardIndex() {
  const { can, permissions } = useAuth();
  const location = useLocation();
  if (!can("dashboard")) {
    return <Navigate to={{ pathname: firstPermittedPath(permissions), search: location.search }} replace />;
  }
  return <DashboardPage />;
}

/** Downloads the code of every permitted app page once the browser is idle, so navigation is instant. */
function PrefetchAppPages() {
  const { permissions } = useAuth();
  useEffect(
    () =>
      onIdle(() => {
        for (const page of Object.values(appPages)) {
          if (page.permission === null || permissions.includes(page.permission)) void page.load();
        }
      }, 4000),
    [permissions],
  );
  return null;
}

/** New page → top of the page; a #hash → that section once it has rendered. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return undefined;
    }
    const id = decodeURIComponent(hash.slice(1));
    let frame = 0;
    let attempts = 0;
    const tryScroll = () => {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ block: "start" });
      else if (attempts++ < 60) frame = window.requestAnimationFrame(tryScroll);
    };
    tryScroll();
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, hash]);
  return null;
}

function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary resetKey={pathname} fullPage>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route
            path="/login"
            element={
              <GuestOnly>
                <LoginPage />
              </GuestOnly>
            }
          />
          <Route
            path="/signup"
            element={
              <GuestOnly>
                <SignupPage />
              </GuestOnly>
            }
          />

          {/* Printable receipt: signed in, but outside the app shell. */}
          <Route
            path="/app/orders/:id/receipt"
            element={
              <RequireAuth>
                <RequirePermission permission="orders">
                  <ReceiptPage />
                </RequirePermission>
              </RequireAuth>
            }
          />

          <Route
            path="/app"
            element={
              <RequireAuth>
                <RequireShopSetup>
                  <PrefetchAppPages />
                  <AppShell />
                </RequireShopSetup>
              </RequireAuth>
            }
          >
            <Route index element={<DashboardIndex />} />
            <Route path="orders" element={<RequirePermission permission="orders"><OrdersPage /></RequirePermission>} />
            <Route path="pickups" element={<RequirePermission permission="orders"><PickupsPage /></RequirePermission>} />
            <Route path="customers" element={<RequirePermission permission="customers"><CustomersPage /></RequirePermission>} />
            <Route path="customers/:id" element={<RequirePermission permission="customers"><CustomerDetailPage /></RequirePermission>} />
            <Route path="payments" element={<RequirePermission permission="payments"><PaymentsPage /></RequirePermission>} />
            <Route path="products" element={<RequirePermission permission="inventory"><ProductsPage /></RequirePermission>} />
            <Route path="suppliers" element={<RequirePermission permission="suppliers"><SuppliersPage /></RequirePermission>} />
            <Route path="suppliers/:id" element={<RequirePermission permission="suppliers"><SupplierDetailPage /></RequirePermission>} />
            <Route path="expenses" element={<RequirePermission permission="expenses"><ExpensesPage /></RequirePermission>} />
            <Route path="reports" element={<RequirePermission permission="reports"><ReportsPage /></RequirePermission>} />
            <Route path="staff" element={<RequirePermission permission="staff"><StaffPage /></RequirePermission>} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="/c/:token" element={<PortalPage />} />

          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="shops/:id" element={<AdminShopPage />} />
          </Route>

          {KitPage && <Route path="/kit" element={<KitPage />} />}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

export default function App() {
  return (
    <BrowserRouter useTransitions={false}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <ScrollManager />
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export { App };
