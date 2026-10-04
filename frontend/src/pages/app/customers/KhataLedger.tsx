import { useMemo, useState, type ReactNode } from "react";
import { Button, EmptyState, ErrorState, Money, Skeleton } from "../../../components/ui";
import { METHOD_LABEL } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { firstName, formatCount, formatDateTime, orderNo, toISODate, todayISO } from "../../../lib/format";
import { fromPaise, toPaise } from "../../../lib/money";
import type { Ledger, LedgerEntry } from "../../../lib/types";
import styles from "./KhataLedger.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Entries shown at first, and how many more each "Show older entries" reveals. */
const FIRST_PAGE = 50;
const NEXT_PAGE = 100;

interface DayLabel {
  day: string;
  month: string;
}

/** The IST calendar day of an entry, split for the stacked date in the margin: "20" over "Aug". */
function dayLabel(isoDateTime: string, currentYear: string): DayLabel {
  const [year = "", month = "1", day = ""] = toISODate(isoDateTime).split("-");
  const monthName = MONTHS[Number(month) - 1] ?? "";
  return { day: String(Number(day)), month: year === currentYear ? monthName : `${monthName} ’${year.slice(2)}` };
}

function OrderRef({ entry, onOpenOrder }: { entry: LedgerEntry; onOpenOrder?: (orderId: number) => void }) {
  const label = orderNo(entry.order_number);
  if (onOpenOrder && entry.order_id !== null) {
    const orderId = entry.order_id;
    return (
      <button type="button" className={styles.orderLink} onClick={() => onOpenOrder(orderId)}>
        {label}
      </button>
    );
  }
  return <span className="mono">{label}</span>;
}

function Activity({ entry, onOpenOrder }: { entry: LedgerEntry; onOpenOrder?: (orderId: number) => void }) {
  if (entry.type === "purchase") {
    return (
      <span className={styles.what}>
        <span>
          Order <OrderRef entry={entry} onOpenOrder={onOpenOrder} />
        </span>
      </span>
    );
  }
  return (
    <span className={styles.what}>
      <span>Payment{entry.method ? ` · ${METHOD_LABEL[entry.method]}` : ""}</span>
      {entry.order_number !== null && (
        <span className={styles.ref}>
          for <OrderRef entry={entry} onOpenOrder={onOpenOrder} />
        </span>
      )}
    </span>
  );
}

export interface KhataLedgerProps {
  /** Undefined while loading. Entries arrive oldest first; the khata shows the newest at the top. */
  ledger: Ledger | undefined;
  error?: unknown;
  onRetry: () => void;
  customerName: string;
  /** Opens an order in the drawer; without it order numbers are plain text. */
  onOpenOrder?: (orderId: number) => void;
  /** Next step offered when there is nothing in the khata yet (e.g. a New order button). */
  emptyAction?: ReactNode;
}

/**
 * The digital khata: ruled rows, the red margin line with the date in the margin, purchases (+) in ink,
 * payments (−) in leaf, and the running balance — newest first, with the outstanding amount at the foot.
 */
export function KhataLedger({ ledger, error, onRetry, customerName, onOpenOrder, emptyAction }: KhataLedgerProps) {
  const [limit, setLimit] = useState(FIRST_PAGE);
  const entries = useMemo(() => (ledger ? [...ledger.entries].reverse() : []), [ledger]);

  if (!ledger && error) {
    return (
      <div className={styles.frame}>
        <ErrorState title="The khata didn't load" error={error} onRetry={onRetry} />
      </div>
    );
  }

  if (ledger && entries.length === 0) {
    return (
      <div className={styles.frame}>
        <EmptyState
          title="No purchases yet."
          description={`Orders for ${firstName(customerName) || "this customer"} show up here with a running balance.`}
          action={emptyAction}
        />
      </div>
    );
  }

  const currentYear = todayISO().slice(0, 4);
  const visible = entries.slice(0, limit);
  const hiddenCount = entries.length - visible.length;
  const oldestShown = visible[visible.length - 1];
  // The balance before the oldest row shown, carried down like "b/f" on a notebook page.
  const broughtForward =
    hiddenCount > 0 && oldestShown ? fromPaise(toPaise(oldestShown.balance) - toPaise(oldestShown.amount)) : null;

  return (
    <div className={cx(styles.frame, hiddenCount > 0 && styles.hasMore)}>
      <table className={styles.table} aria-busy={!ledger || undefined}>
        <caption className="visually-hidden">Khata for {customerName}, newest entries first</caption>
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
            <th scope="col">Activity</th>
            <th scope="col" className={styles.num}>
              Amount
            </th>
            <th scope="col" className={styles.num}>
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {!ledger
            ? [0, 1, 2, 3, 4].map((index) => (
                <tr key={`skeleton-${index}`} aria-hidden="true">
                  <td className={styles.dateCell}>
                    <Skeleton width={22} height={22} />
                  </td>
                  <td>
                    <Skeleton width="60%" height={12} />
                  </td>
                  <td className={styles.num}>
                    <Skeleton width={64} height={12} style={{ marginLeft: "auto" }} />
                  </td>
                  <td className={styles.num}>
                    <Skeleton width={64} height={12} style={{ marginLeft: "auto" }} />
                  </td>
                </tr>
              ))
            : visible.map((entry, index) => {
                const label = dayLabel(entry.date, currentYear);
                const previous = visible[index - 1];
                // Like a paper khata, the date is written once per day.
                const firstOfDay = !previous || toISODate(previous.date) !== toISODate(entry.date);
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
                    <td className={styles.activity}>
                      <Activity entry={entry} onOpenOrder={onOpenOrder} />
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
              <td className={styles.activity}>
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
        {ledger && (
          <tfoot>
            <tr>
              <td className={styles.dateCell} />
              <th scope="row" colSpan={2}>
                Outstanding
              </th>
              <td className={styles.num}>
                <Money value={ledger.outstanding} tone={ledger.outstanding > 0 ? "margin" : "default"} />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      {hiddenCount > 0 && (
        <div className={styles.more}>
          <Button size="sm" onClick={() => setLimit(limit + NEXT_PAGE)}>
            Show {formatCount(Math.min(hiddenCount, NEXT_PAGE))} older {Math.min(hiddenCount, NEXT_PAGE) === 1 ? "entry" : "entries"}
          </Button>
        </div>
      )}
    </div>
  );
}
