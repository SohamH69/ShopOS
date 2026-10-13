import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Suspense, useCallback, useEffect, type MouseEvent } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { PageSkeleton } from "../../components/layout/PageLoader";
import { RouteErrorBoundary } from "../../components/layout/RouteErrorBoundary";
import { Avatar, Skeleton } from "../../components/ui";
import { adminTokenStore, onAdminUnauthorized } from "../../lib/api";
import { useAdminMe } from "../../lib/queries";
import styles from "./AdminLayout.module.css";

/** Where the admin sign-in page sends people back to, and why they were sent there. */
export interface AdminLoginState {
  from?: string;
  expired?: boolean;
}

/** The ShopOS admin console frame. Without an admin token, straight to /admin/login. */
export default function AdminLayout() {
  const location = useLocation();
  if (!adminTokenStore.get()) {
    const state: AdminLoginState = { from: location.pathname + location.search };
    return <Navigate to="/admin/login" replace state={state} />;
  }
  return <AdminShell />;
}

function AdminShell() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAdminMe();

  const leave = useCallback(
    (state: AdminLoginState) => {
      queryClient.removeQueries({ queryKey: ["admin"] });
      navigate("/admin/login", { replace: true, state });
    },
    [navigate, queryClient],
  );

  // A 401 on any admin request: the token is already gone; back to the sign-in, then back here.
  useEffect(
    () => onAdminUnauthorized(() => leave({ from: window.location.pathname + window.location.search, expired: true })),
    [leave],
  );

  const signOut = () => {
    adminTokenStore.clear();
    leave({});
  };

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("admin-main")?.focus();
  };

  return (
    <div className={styles.shell}>
      <a href="#admin-main" className={styles.skip} onClick={skipToContent}>
        Skip to content
      </a>
      <header className={styles.bar}>
        <span className={styles.awning} aria-hidden="true" />
        <div className={styles.barInner}>
          <Link to="/admin" className={styles.brand} aria-label="ShopOS admin home">
            <Logo tone="dark" size={24} />
            <span className={styles.tag}>Admin</span>
          </Link>
          <div className={styles.end}>
            <div className={styles.who}>
              {me.data ? (
                <>
                  <Avatar name={me.data.name} size="sm" />
                  <span className={styles.whoText}>
                    <span className={styles.whoName}>{me.data.name}</span>
                    <span className={styles.whoEmail}>{me.data.email}</span>
                  </span>
                </>
              ) : me.isPending ? (
                <Skeleton width={120} height={14} className={styles.whoSkeleton} />
              ) : null}
            </div>
            <button type="button" className={styles.signOut} onClick={signOut}>
              <LogOut aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main id="admin-main" className={styles.content} tabIndex={-1}>
        <div className={styles.inner}>
          <RouteErrorBoundary resetKey={pathname + search}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </div>
      </main>
    </div>
  );
}
