import { useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "../../../components/ui";
import { INVENTORY_TX_LABEL, STOCK_REASON_LABEL } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { formatDate, formatDateTime, formatQty, formatTime, orderNo } from "../../../lib/format";
import type { InventoryTransaction } from "../../../lib/types";
import { signedQty } from "./stock";
import styles from "./StockLedger.module.css";

const FIRST_PAGE = 20;
/** GET /products/{id}/transactions returns at most this many rows. */
const API_LIMIT = 100;

export interface StockLedgerProps {
  productName: string;
  unit: string;
  /** Newest first; undefined while loading. */
  transactions: readonly InventoryTransaction[] | undefined;
  error: unknown;
  onRetry: () => void;
  /** Opens the order behind a sale; leave out when the user can't open orders. */
  onOpenOrder?: (orderId: number) => void;
}

/** Every stock movement of one product as a ruled ledger: date, what happened, change, stock after. */
export function StockLedger({ productName, unit, transactions, error, onRetry, onOpenOrder }: StockLedgerProps) {
  const [showAll, setShowAll] = useState(false);

  if (!transactions) {
    if (error) return <ErrorState compact error={error} onRetry={onRetry} />;
    return <LedgerSkeleton />;
  }
  if (transactions.length === 0) {
    return <EmptyState compact title="No stock changes yet." description="Purchases, sales and adjustments show up here." />;
  }

  const rows = showAll ? transactions : transactions.slice(0, FIRST_PAGE);
  const hidden = transactions.length - rows.length;

  return (
    <div className={styles.ledger}>
      <table className={styles.table}>
        <caption className="visually-hidden">Stock history for {productName}, newest first</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.dateCol}>
              Date
            </th>
            <th scope="col" className={styles.activityCol}>
              Activity
            </th>
            <th scope="col" className={styles.num}>
              Change
            </th>
            <th scope="col" className={styles.num}>
              Stock
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((transaction) => (
            <LedgerRow key={transaction.id} transaction={transaction} unit={unit} onOpenOrder={onOpenOrder} />
          ))}
        </tbody>
      </table>
      {(hidden > 0 || transactions.length >= API_LIMIT) && (
        <div className={styles.footer}>
          <span>
            {hidden > 0
              ? `Showing the latest ${rows.length} of ${transactions.length} changes`
              : `Showing the latest ${transactions.length} changes`}
          </span>
          {hidden > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
              Show all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface LedgerRowProps {
  transaction: InventoryTransaction;
  unit: string;
  onOpenOrder?: (orderId: number) => void;
}

function LedgerRow({ transaction, unit, onOpenOrder }: LedgerRowProps) {
  const { created_at: at, quantity_change: change, stock_after: after } = transaction;
  const extra = [
    transaction.type === "adjustment" && transaction.note ? `“${transaction.note}”` : null,
    transaction.created_by_name,
  ].filter((part): part is string => Boolean(part));

  return (
    <tr>
      <td className={styles.dateCol}>
        <span className={styles.date}>{formatDate(at)}</span>
        <span className={styles.time}>{formatTime(at)}</span>
      </td>
      <td className={styles.activityCol}>
        <span className={styles.activity}>
          <Activity transaction={transaction} onOpenOrder={onOpenOrder} />
        </span>
        <span className={styles.meta}>
          <span className={styles.inlineDate}>
            {formatDateTime(at)}
            {extra.length > 0 ? " · " : ""}
          </span>
          {extra.join(" · ")}
        </span>
      </td>
      <td className={cx(styles.num, styles.figure, change > 0 ? styles.up : styles.down)}>{signedQty(change, unit)}</td>
      <td className={cx(styles.num, styles.figure, styles.after, after <= 0 && styles.out)}>{formatQty(after, unit)}</td>
    </tr>
  );
}

function Activity({ transaction, onOpenOrder }: { transaction: InventoryTransaction; onOpenOrder?: (orderId: number) => void }) {
  const label = INVENTORY_TX_LABEL[transaction.type];
  switch (transaction.type) {
    case "sale":
    case "sale_reversal":
      return (
        <>
          {label}
          {transaction.order_number !== null && (
            <>
              {" · "}
              <OrderReference orderId={transaction.order_id} orderNumber={transaction.order_number} onOpenOrder={onOpenOrder} />
            </>
          )}
        </>
      );
    case "purchase":
      return (
        <>
          {label}
          {transaction.note ? ` · ${transaction.note}` : ""}
        </>
      );
    case "adjustment":
      return (
        <>
          {label}
          {transaction.reason ? ` · ${STOCK_REASON_LABEL[transaction.reason]}` : ""}
        </>
      );
    case "opening":
      return <>{label}</>;
  }
}

interface OrderReferenceProps {
  orderId: number | null;
  orderNumber: number;
  onOpenOrder?: (orderId: number) => void;
}

function OrderReference({ orderId, orderNumber, onOpenOrder }: OrderReferenceProps) {
  const text = (
    <>
      Order <span className="mono">{orderNo(orderNumber)}</span>
    </>
  );
  if (orderId === null || !onOpenOrder) return <span>{text}</span>;
  return (
    <button type="button" className={styles.link} onClick={() => onOpenOrder(orderId)}>
      {text}
    </button>
  );
}

function LedgerSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Loading stock history">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className={styles.skeletonRow}>
          <Skeleton width={44} height={12} />
          <Skeleton width="55%" height={12} />
          <Skeleton width={40} height={12} />
        </div>
      ))}
    </div>
  );
}
