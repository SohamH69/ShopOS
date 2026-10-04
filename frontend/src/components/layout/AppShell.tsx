import { Suspense, useState, type MouseEvent } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { NewOrderHost, NewOrderProvider } from "../../features/new-order/NewOrderProvider";
import { OrderDrawerHost, OrderDrawerProvider } from "../../features/order-drawer/OrderDrawerProvider";
import { useHotkey } from "../../lib/hooks";
import styles from "./AppShell.module.css";
import { CommandPalette } from "./CommandPalette";
import { MobileNav, NewOrderFab } from "./MobileNav";
import { MoreSheet } from "./MoreSheet";
import { OfflineBanner } from "./OfflineBanner";
import { PageSkeleton } from "./PageLoader";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * The signed-in app frame: sidebar on desktop; top bar, bottom tabs, floating New order and the
 * More sheet below 1024px. Hosts the global overlays: order drawer, new order sheet, command palette.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useHotkey("mod+k", () => setSearchOpen((open) => !open), { allowInInputs: true });

  // Moving to another page closes the More sheet.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMoreOpen(false);
  }

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("main")?.focus();
  };

  return (
    <OrderDrawerProvider>
      <NewOrderProvider>
        <a href="#main" className={styles.skip} onClick={skipToContent}>
          Skip to content
        </a>
        <div className={styles.shell}>
          <Sidebar className={styles.sidebar} />
          <div className={styles.main}>
            <Topbar onOpenSearch={() => setSearchOpen(true)} />
            <OfflineBanner />
            <main id="main" className={styles.content} tabIndex={-1}>
              <div className={styles.inner}>
                <RouteErrorBoundary resetKey={pathname}>
                  <Suspense fallback={<PageSkeleton />}>
                    <Outlet />
                  </Suspense>
                </RouteErrorBoundary>
              </div>
            </main>
          </div>
          <MobileNav onOpenMore={() => setMoreOpen(true)} moreOpen={moreOpen} />
          <NewOrderFab />
        </div>
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
        <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
        <OrderDrawerHost />
        <NewOrderHost />
      </NewOrderProvider>
    </OrderDrawerProvider>
  );
}
