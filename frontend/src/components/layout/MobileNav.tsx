import { Plus } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useNewOrder } from "../../features/new-order/NewOrderProvider";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import styles from "./MobileNav.module.css";
import { useNavItems, type NavItem } from "./nav";
import { useOpenOrdersCount } from "./useOpenOrdersCount";

function Tab({ item, count }: { item: NavItem; count?: number }) {
  const Icon = item.icon;
  const showCount = count !== undefined && count > 0;
  return (
    <li>
      <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(styles.tab, isActive && styles.active)}>
        <span className={styles.iconWrap}>
          <Icon aria-hidden="true" />
          {showCount && (
            <span className={styles.badge}>
              {count > 99 ? "99+" : count}
              <span className="visually-hidden"> open</span>
            </span>
          )}
        </span>
        <span className={styles.label}>{item.label}</span>
      </NavLink>
    </li>
  );
}

/**
 * Bottom tab bar below 1024px: the permitted tabs (Today, Orders, Pickups, Customers) split around a
 * raised marigold New order button, so the main action never floats over the page. The other pages
 * live in the More sheet, opened from the top bar.
 */
export function MobileNav() {
  const { can } = useAuth();
  const { openNewOrder } = useNewOrder();
  const items = useNavItems();
  const openCount = useOpenOrdersCount();
  const tabs = items.filter((item) => item.tab);
  const middle = Math.ceil(tabs.length / 2);
  const tabFor = (item: NavItem) => (
    <Tab key={item.id} item={item} count={item.id === "pickups" ? openCount : undefined} />
  );

  return (
    <nav className={styles.tabbar} aria-label="Main" data-tabbar="">
      <ul className={styles.tabs}>
        {tabs.slice(0, middle).map(tabFor)}
        {can("orders") && (
          <li className={styles.centerSlot}>
            <button type="button" className={styles.center} onClick={() => openNewOrder()}>
              <span className={styles.centerIcon}>
                <Plus aria-hidden="true" />
              </span>
              <span className={styles.label}>New order</span>
            </button>
          </li>
        )}
        {tabs.slice(middle).map(tabFor)}
      </ul>
    </nav>
  );
}
