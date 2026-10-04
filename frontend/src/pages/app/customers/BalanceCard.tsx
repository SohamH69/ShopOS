import { CalendarClock, CalendarPlus } from "lucide-react";
import { useId } from "react";
import { Badge, Button, DescriptionList, Money, Stamp, useToast, type DescriptionItem } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { formatCount, formatDate, formatDateTime, formatRelative } from "../../../lib/format";
import { useClearCustomerPromise } from "../../../lib/queries";
import type { Customer } from "../../../lib/types";
import styles from "./BalanceCard.module.css";

function PromiseRow({ customer, onEditPromise }: { customer: Customer; onEditPromise: () => void }) {
  const toast = useToast();
  const clearPromise = useClearCustomerPromise();

  if (!customer.promise_date) {
    return (
      <div className={styles.promise}>
        <Button size="sm" variant="ghost" icon={<CalendarPlus aria-hidden="true" />} onClick={onEditPromise}>
          Add payment promise
        </Button>
      </div>
    );
  }

  const handleClear = () => {
    clearPromise.mutate(customer.id, {
      onSuccess: () => toast.success("Promise cleared"),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <div className={styles.promise}>
      <CalendarClock className={styles.promiseIcon} aria-hidden="true" />
      <div className={styles.promiseText}>
        <p className={styles.promiseLine}>
          {customer.promise_amount ? (
            <>
              Promised <Money value={customer.promise_amount} /> by {formatDate(customer.promise_date)}
            </>
          ) : (
            <>Promised to pay by {formatDate(customer.promise_date)}</>
          )}
          {customer.promise_overdue && (
            <Badge tone="margin" size="sm" className={styles.overdue}>
              Overdue
            </Badge>
          )}
        </p>
        {customer.promise_note && <p className={styles.promiseNote}>{customer.promise_note}</p>}
      </div>
      <div className={styles.promiseActions}>
        <Button size="sm" variant="ghost" onClick={onEditPromise} disabled={clearPromise.isPending}>
          Change
        </Button>
        <Button size="sm" variant="ghost" loading={clearPromise.isPending} onClick={handleClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

export interface BalanceCardProps {
  customer: Customer;
  /** Above 0 after a payment on this visit settled the khata: the Settled stamp lands (animated). */
  settleKey: number;
  /** Opens the add / change payment promise dialog. */
  onEditPromise: () => void;
}

/** What the customer owes right now, their totals, and any promise to pay. */
export function BalanceCard({ customer, settleKey, onEditPromise }: BalanceCardProps) {
  const headingId = useId();
  const hasDues = customer.outstanding > 0;
  const settled = !hasDues && customer.orders_count > 0;

  const about: DescriptionItem[] = [];
  if (customer.preferred_products.length > 0) {
    about.push({ key: "products", label: "Usually buys", value: customer.preferred_products.join(", ") });
  }
  if (customer.notes) about.push({ key: "notes", label: "Notes", value: customer.notes });

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.top}>
        <div className={styles.balance}>
          <h2 id={headingId} className={styles.label}>
            Outstanding
          </h2>
          <div className={styles.valueRow}>
            <Money className={styles.value} value={customer.outstanding} display tone={hasDues ? "margin" : "muted"} />
            {settled && <Stamp key={settleKey} label="Settled" size="sm" animate={settleKey > 0} />}
          </div>
          {!hasDues && customer.orders_count === 0 && <p className={styles.caption}>No purchases yet</p>}
        </div>

        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Total purchases</dt>
            <dd>
              <Money value={customer.total_purchases} size="lg" />
            </dd>
          </div>
          <div className={styles.stat}>
            <dt>Paid</dt>
            <dd>
              <Money value={customer.total_paid} size="lg" />
            </dd>
          </div>
          <div className={styles.stat}>
            <dt>Orders</dt>
            <dd className={styles.count}>{formatCount(customer.orders_count)}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Last purchase</dt>
            <dd>
              {customer.last_order_at ? (
                <span className={styles.last} title={formatDateTime(customer.last_order_at)}>
                  <span>{formatRelative(customer.last_order_at)}</span>
                  {customer.last_order_total !== null && <Money value={customer.last_order_total} size="sm" tone="muted" />}
                </span>
              ) : (
                <span className="muted">—</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {hasDues && <PromiseRow customer={customer} onEditPromise={onEditPromise} />}

      {about.length > 0 && (
        <div className={styles.about}>
          <DescriptionList items={about} />
        </div>
      )}
    </section>
  );
}
