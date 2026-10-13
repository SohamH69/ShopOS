import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { PLAN_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatCount } from "../../lib/format";
import { Logo } from "../brand/Logo";
import { useNavItems, type NavItem } from "./nav";
import styles from "./Sidebar.module.css";
import { useOpenOrdersCount } from "./useOpenOrdersCount";
import { UserMenu } from "./UserMenu";

function SidebarLink({ item, count }: { item: NavItem; count?: number }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(styles.link, isActive && styles.active)}>
      <Icon aria-hidden="true" />
      <span className={styles.linkLabel}>{item.label}</span>
      {count !== undefined && count > 0 && (
        <span className={styles.count}>
          {formatCount(count)}
          <span className="visually-hidden"> open</span>
        </span>
      )}
    </NavLink>
  );
}

/**
 * Desktop navigation (≥1024px), the shop's signboard: a marigold awning, the shop's own name painted
 * on the night board, the permitted pages, and the account menu.
 */
export function Sidebar({ className }: { className?: string }) {
  const { shop } = useAuth();
  const items = useNavItems();
  const openCount = useOpenOrdersCount();
  const main = items.filter((item) => item.section === "main");
  const shopItems = items.filter((item) => item.section === "shop");

  return (
    <aside className={cx(styles.sidebar, className)}>
      <span className={styles.awning} aria-hidden="true" />
      <div className={styles.board}>
        <Link to="/app" className={styles.brandLink} aria-label="ShopOS home">
          <Logo tone="dark" size={22} />
        </Link>
        {shop && (
          <div className={styles.shop}>
            <p className={styles.shopName} title={shop.name}>
              {shop.name}
            </p>
            <p className={styles.plan}>{PLAN_LABEL[shop.plan]} plan</p>
          </div>
        )}
      </div>
      <nav className={styles.nav} aria-label="Main">
        <ul className={styles.list}>
          {main.map((item) => (
            <li key={item.id}>
              <SidebarLink item={item} count={item.id === "pickups" ? openCount : undefined} />
            </li>
          ))}
        </ul>
        {shopItems.length > 0 && (
          <>
            <p className={styles.section}>Shop</p>
            <ul className={styles.list}>
              {shopItems.map((item) => (
                <li key={item.id}>
                  <SidebarLink item={item} />
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>
      <div className={styles.footer}>
        <UserMenu tone="dark" />
      </div>
    </aside>
  );
}
