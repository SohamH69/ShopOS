import { Menu as MenuIcon, Plus, Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useNewOrder } from "../../features/new-order/NewOrderProvider";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import { modifierKeyLabel } from "../../lib/hooks";
import { LogoMark } from "../brand/Logo";
import { Button, IconButton, Kbd } from "../ui";
import { isNavItemActive, useNavItems } from "./nav";
import styles from "./Topbar.module.css";

export interface TopbarProps {
  onOpenSearch: () => void;
  onOpenMore: () => void;
  moreOpen: boolean;
}

/**
 * Desktop: a frosted bar with search and New order. Phones and tablets: the shop's signboard
 * (mark + shop name) with search and More; New order lives in the middle of the tab bar.
 */
export function Topbar({ onOpenSearch, onOpenMore, moreOpen }: TopbarProps) {
  const { can, shop } = useAuth();
  const { openNewOrder } = useNewOrder();
  const { pathname } = useLocation();
  const items = useNavItems();
  const modifier = modifierKeyLabel();
  const moreActive = items.some((item) => !item.tab && isNavItemActive(item, pathname));

  return (
    <header className={styles.topbar}>
      <div className={styles.inner}>
        <Link to="/app" className={styles.brand}>
          <LogoMark />
          <span className={styles.shopName}>{shop?.name ?? "ShopOS"}</span>
        </Link>
        <button
          type="button"
          className={styles.search}
          onClick={onOpenSearch}
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search aria-hidden="true" />
          <span className={styles.searchText}>Search orders, customers, products</span>
          <span className={styles.keys} aria-hidden="true">
            <Kbd>{modifier}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <span className={styles.spacer} />
        <IconButton
          className={cx(styles.onBoard, styles.phoneOnly)}
          label="Search orders, customers, products"
          icon={<Search aria-hidden="true" />}
          onClick={onOpenSearch}
        />
        <IconButton
          className={cx(styles.onBoard, styles.phoneOnly, moreActive && styles.moreActive)}
          label="More pages"
          icon={<MenuIcon aria-hidden="true" />}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={onOpenMore}
        />
        {can("orders") && (
          <Button
            variant="primary"
            className={styles.newOrder}
            icon={<Plus aria-hidden="true" />}
            onClick={() => openNewOrder()}
            aria-keyshortcuts="N"
          >
            New order
          </Button>
        )}
      </div>
    </header>
  );
}
