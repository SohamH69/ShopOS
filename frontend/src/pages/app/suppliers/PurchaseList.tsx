import { PackagePlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, LoadMore, Money } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { formatDate, formatMoney, formatQty, formatTime, pluralize } from "../../../lib/format";
import { useProducts } from "../../../lib/queries";
import type { ProductUnit, Purchase } from "../../../lib/types";
import styles from "./PurchaseList.module.css";

const PAGE_SIZE = 10;

export interface PurchaseListProps {
  /** Newest first. */
  purchases: readonly Purchase[];
  supplierName: string;
  onRecordPurchase: () => void;
}

/** Purchases from one supplier, newest first: date, each line (quantity × cost) and the total. */
export function PurchaseList({ purchases, supplierName, onRecordPurchase }: PurchaseListProps) {
  const { can } = useAuth();
  const [shown, setShown] = useState(PAGE_SIZE);
  // Purchase lines don't carry a unit; take it from the product (archived ones included).
  const productsQuery = useProducts({ include_archived: true });
  const units = useMemo(
    () => new Map<number, ProductUnit>((productsQuery.data ?? []).map((product) => [product.id, product.unit])),
    [productsQuery.data],
  );

  if (purchases.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={<PackagePlus />}
          title="No purchases yet."
          description={`Record what you buy from ${supplierName}. Stock goes up and what you owe stays up to date.`}
          action={
            <Button variant="primary" icon={<PackagePlus aria-hidden="true" />} onClick={onRecordPurchase}>
              Record purchase
            </Button>
          }
        />
      </Card>
    );
  }

  const visible = purchases.slice(0, shown);
  const linkProducts = can("inventory");

  return (
    <div className={styles.wrap}>
      <Card padding="none">
        <ol className={styles.list} aria-label={`Purchases from ${supplierName}, newest first`}>
          {visible.map((purchase) => (
            <PurchaseEntry key={purchase.id} purchase={purchase} units={units} linkProducts={linkProducts} />
          ))}
        </ol>
      </Card>
      <LoadMore
        shown={visible.length}
        total={purchases.length}
        hasMore={visible.length < purchases.length}
        loading={false}
        onLoadMore={() => setShown((count) => count + PAGE_SIZE)}
        noun="purchases"
      />
    </div>
  );
}

interface PurchaseEntryProps {
  purchase: Purchase;
  units: ReadonlyMap<number, ProductUnit>;
  linkProducts: boolean;
}

function PurchaseEntry({ purchase, units, linkProducts }: PurchaseEntryProps) {
  const by = purchase.created_by_name ? ` · ${purchase.created_by_name}` : "";
  return (
    <li className={styles.entry}>
      <div className={styles.head}>
        <div className={styles.when}>
          <span className={styles.date}>{formatDate(purchase.purchased_at)}</span>
          <span className={styles.subtle}>
            {formatTime(purchase.purchased_at)}
            {by}
          </span>
        </div>
        <div className={styles.total}>
          <Money value={purchase.total} size="lg" />
          <span className={styles.subtle}>{pluralize(purchase.items.length, "item")}</span>
        </div>
      </div>
      <ul className={styles.items}>
        {purchase.items.map((item, index) => (
          <li key={`${item.product_id}-${index}`} className={styles.item}>
            <span className={styles.itemName}>
              {linkProducts ? <Link to={`/app/products?product=${item.product_id}`}>{item.name}</Link> : item.name}
            </span>
            <span className={styles.itemQty}>
              {formatQty(item.quantity, units.get(item.product_id))} × {formatMoney(item.unit_cost)}
            </span>
            <Money value={item.line_total} className={styles.itemTotal} />
          </li>
        ))}
      </ul>
      {purchase.note && <p className={styles.note}>Note: {purchase.note}</p>}
    </li>
  );
}
