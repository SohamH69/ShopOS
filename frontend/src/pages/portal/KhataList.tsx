import { BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, EmptyState, Money } from "../../components/ui";
import { METHOD_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatCount, formatDateTime, orderNo, toISODate, todayISO } from "../../lib/format";
import { fromPaise, toPaise } from "../../lib/money";
import type { LedgerEntry } from "../../lib/types";
import styles from "./KhataList.module.css";
import { newestEntriesFirst } from "./portalModel";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIRST_PAGE = 30;
const NEXT_PAGE = 50;

/** "13" over "Oct" in the margin, like a date written in a notebook (IST). */
function dayLabel(isoDateTime: string, currentYear: string): { day: string; month: string } {
  const [year = "", month = "1", day = ""] = toISODate(isoDateTime).split("-");
  const monthName = MONTHS[Number(month) - 1] ?? "";
  return { day: String(Number(day)), month: year === currentYear ? monthName : `${monthName} ’${year.slice(2)}` };
}

interface OrderRefProps {
  entry: LedgerEntry;
  onOpenOrder?: (orderId: number) => void;
  canOpen: boolean;
}

function OrderRef({ entry, onOpenOrder, canOpen }: OrderRefProps) {
  const label = orderNo(entry.order_number);
  if (onOpenOrder && canOpen && entry.order_id !== null) {
    const orderId = entry.order_id;
    return (
      <button
        type="button"
        className={styles.orderLink}
        onClick={() => onOpenOrder(orderId)}
        title="Show this order"
      >
        {label}
      </button>
    );
  }
  return <span className="mono">{label}</span>;
}

export interface KhataListProps {
  /** As the API sends them: oldest first. */
  entries: readonly LedgerEntry[];
  outstanding: number;
  shopName: string;
  /** Orders that are on the Orders tab (only those can be opened from the khata). */
  openableOrderIds: ReadonlySet<number>;
  onOpenOrder: (orderId: number) => void;
}

/**
 * The khata as a ruled notebook page, newest first: the date in the margin, purchases (+),
 * payments (−) in green, the running balance, and what is left to pay at the foot.
 */
export function KhataList({ entries, outstanding, shopName, openableOrderIds, onOpenOrder }: KhataListProps) {
  const [limit, setLimit] = useState(FIRST_PAGE);
  const rows = useMemo(() => newestEntriesFirst(entries), [entries]);

  if (rows.length === 0) {
    return (
      <div className={styles.frame}>
        <EmptyState
          icon={<BookOpen />}
          title="Nothing in your khata yet."
          description={`Your purchases and payments at ${shopName} will show up here.`}
        />
      </div>
    );
  }

  const currentYear = todayISO().slice(0, 4);
  const visible = rows.slice(0, limit);
  const hiddenCount = rows.length - visible.length;
  const oldestShown = visible[visible.length - 1];
  const broughtForward =
    hiddenCount > 0 && oldestShown ? fromPaise(toPaise(oldestShown.balance) - toPaise(oldestShown.amount)) : null;
  const nextCount = Math.min(hiddenCount, NEXT_PAGE);
  const owes = toPaise(outstanding) > 0;

  return (
    <div className={cx(styles.frame, hiddenCount > 0 && styles.hasMore)}>
      <table className={styles.table}>
        <caption className="visually-hidden">Your khata at {shopName}, newest entries first</caption>
        <colgroup>
          <col className={styles.colDate} />
          <col />
          <col className={styles.colMoney} />
          <col className={styles.colMoney} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={styles.dateCell}>
              Date
            </th>
            <th scope="col">Details</th>
            <th scope="col" className={styles.num}>
              Amount
            </th>
            <th scope="col" className={styles.num}>
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry, index) => {
            const label = dayLabel(entry.date, currentYear);
            const previous = visible[index - 1];
            // Like a paper khata, the date is written once per day.
            const firstOfDay = !previous || toISODate(previous.date) !== toISODate(entry.date);
            const canOpen = entry.order_id !== null && openableOrderIds.has(entry.order_id);
            return (
              <tr key={entry.id} className={cx(entry.type === "payment" && styles.paymentRow)}>
                <td className={styles.dateCell}>
                  {firstOfDay ? (
                    <time className={styles.date} dateTime={entry.date} title={formatDateTime(entry.date, { year: "always" })}>
                      <span className={styles.day}>{label.day}</span>
                      <span className={styles.month}>{label.month}</span>
                    </time>
                  ) : (
                    <span className="visually-hidden">
                      {label.day} {label.month}
                    </span>
                  )}
                </td>
                <td className={styles.details}>
                  {entry.type === "purchase" ? (
                    <span className={styles.what}>
                      <span>
                        {entry.order_number !== null ? (
                          <>
                            Order <OrderRef entry={entry} canOpen={canOpen} onOpenOrder={onOpenOrder} />
                          </>
                        ) : (
                          entry.description || "Purchase"
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className={styles.what}>
                      <span>Payment{entry.method ? ` · ${METHOD_LABEL[entry.method]}` : ""}</span>
                      {entry.order_number !== null && (
                        <span className={styles.ref}>
                          for <OrderRef entry={entry} canOpen={canOpen} onOpenOrder={onOpenOrder} />
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className={styles.num}>
                  <Money value={entry.amount} sign="always" tone={entry.type === "payment" ? "leaf" : "default"} />
                </td>
                <td className={styles.num}>
                  <Money value={entry.balance} tone={entry.balance > 0 ? "default" : "muted"} />
                </td>
              </tr>
            );
          })}
          {broughtForward !== null && (
            <tr className={styles.forward}>
              <td className={styles.dateCell} />
              <td className={styles.details}>
                <span className={styles.what}>
                  <span>Brought forward</span>
                  <span className={styles.ref}>
                    from {formatCount(hiddenCount)} older {hiddenCount === 1 ? "entry" : "entries"}
                  </span>
                </span>
              </td>
              <td />
              <td className={styles.num}>
                <Money value={broughtForward} tone={broughtForward > 0 ? "default" : "muted"} />
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className={styles.dateCell} />
            <th scope="row" colSpan={2}>
              {owes ? "Left to pay" : "Balance"}
            </th>
            <td className={styles.num}>
              <Money value={outstanding} tone={owes ? "margin" : "muted"} />
            </td>
          </tr>
        </tfoot>
      </table>
      {hiddenCount > 0 && (
        <div className={styles.more}>
          <Button size="sm" onClick={() => setLimit(limit + NEXT_PAGE)}>
            Show {formatCount(nextCount)} older {nextCount === 1 ? "entry" : "entries"}
          </Button>
        </div>
      )}
    </div>
  );
}
