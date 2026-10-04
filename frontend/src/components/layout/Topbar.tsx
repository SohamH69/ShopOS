import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useNewOrder } from "../../features/new-order/NewOrderProvider";
import { useAuth } from "../../lib/auth";
import { modifierKeyLabel } from "../../lib/hooks";
import { Logo } from "../brand/Logo";
import { Button, IconButton, Kbd } from "../ui";
import styles from "./Topbar.module.css";

export interface TopbarProps {
  onOpenSearch: () => void;
}

/** Desktop: search trigger + New order. Phones and tablets: logo + search icon (New order is the floating button). */
export function Topbar({ onOpenSearch }: TopbarProps) {
  const { can } = useAuth();
  const { openNewOrder } = useNewOrder();
  const modifier = modifierKeyLabel();

  return (
    <header className={styles.topbar}>
      <div className={styles.inner}>
        <Link to="/app" className={styles.brand} aria-label="ShopOS home">
          <Logo size={26} />
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
          className={styles.searchIcon}
          label="Search orders, customers, products"
          icon={<Search aria-hidden="true" />}
          onClick={onOpenSearch}
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
