import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Logo } from "../brand/Logo";
import { Button, ErrorState } from "../ui";
import { FullPageLoader } from "./PageLoader";
import styles from "./PageLoader.module.css";

/**
 * Renders children only for a signed-in user. Signed-out visitors go to /login?next=<this page>
 * (or plain /login right after choosing Sign out).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signedOutBy, error, refresh, logout } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageLoader />;

  if (status === "error") {
    return (
      <div className={styles.screen}>
        <div className={styles.screenCard}>
          <Logo />
          <ErrorState
            title="Your shop didn't open"
            error={error}
            onRetry={() => {
              void refresh();
            }}
          />
          <Button variant="ghost" size="sm" icon={<LogOut aria-hidden="true" />} onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (status === "signedOut") {
    if (signedOutBy === "user") return <Navigate to="/login" replace />;
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}
