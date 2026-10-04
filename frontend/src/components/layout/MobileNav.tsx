import { Menu as MenuIcon, Plus } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useNewOrder } from "../../features/new-order/NewOrderProvider";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import styles from "./MobileNav.module.css";
import { isNavItemActive, useNavItems } from "./nav";
import { useOpenOrdersCount } from "./useOpenOrdersCount";

export interface MobileNavProps {
  onOpenMore: () => void;
  moreOpen: boolean;
}

/** Bottom tab bar below 1024px: Today, Orders, Pickups, Customers (as permitted) and More. */
export function MobileNav({ onOpenMore, moreOpen }: MobileNavProps) {
  const { pathname } = useLocation();
  const items = useNavItems();
  const openCount = useOpenOrdersCount();
  const tabs = items.filter((item) => item.tab);
  const moreActive = items.some((item) => !item.tab && isNavItemActive(item, pathname));

  return (
    <nav className={styles.tabbar} aria-label="Main" data-tabbar="">
      <ul className={styles.tabs}>
        {tabs.map((item) => {
          const Icon = item.icon;
          const showCount = item.id === "pickups" && openCount !== undefined && openCount > 0;
          return (
            <li key={item.id}>
              <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(styles.tab, isActive && styles.active)}>
                <span className={styles.iconWrap}>
                  <Icon aria-hidden="true" />
                  {showCount && (
                    <span className={styles.badge}>
                      {openCount > 99 ? "99+" : openCount}
                      <span className="visually-hidden"> open</span>
                    </span>
                  )}
                </span>
                <span className={styles.label}>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className={cx(styles.tab, (moreActive || moreOpen) && styles.active)}
            onClick={onOpenMore}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <span className={styles.iconWrap}>
              <MenuIcon aria-hidden="true" />
            </span>
            <span className={styles.label}>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Floating "New order" button above the tab bar (hidden on desktop, where the top bar has one). */
export function NewOrderFab() {
  const { can } = useAuth();
  const { openNewOrder } = useNewOrder();
  if (!can("orders")) return null;
  return (
    <button type="button" className={styles.fab} aria-label="New order" title="New order" onClick={() => openNewOrder()}>
      <Plus aria-hidden="true" />
    </button>
  );
}
