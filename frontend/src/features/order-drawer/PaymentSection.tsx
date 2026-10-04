import { useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { useId, useState, type RefObject } from "react";
import {
  Button,
  ConfirmDialog,
  Field,
  Menu,
  Money,
  MoneyInput,
  PaymentStatusBadge,
  SegmentedControl,
  Skeleton,
  Stamp,
  Switch,
  useToast,
} from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { completedStatusFor, METHOD_LABEL, METHOD_SHORT_LABEL, ORDER_STATUS_ACTION, toOptions } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatDateTime, formatMoney, formatRelative } from "../../lib/format";
import { toPaise } from "../../lib/money";
import { useAddOrderPayment, useUpdateOrderStatus, useVoidPayment } from "../../lib/queries";
import type { Order, OrderDetail, Payment, PaymentMethod, PaymentStatus } from "../../lib/types";
import { syncOpenOrderLists } from "./orderCache";
import styles from "./OrderDrawer.module.css";
import { lastPaymentMethod, rememberPaymentMethod } from "./orderFlow";

const METHOD_OPTIONS = toOptions(METHOD_SHORT_LABEL);

interface StampMoment {
  show: boolean;
  /** True only when the order became fully paid while the drawer was open. */
  animate: boolean;
  /** Changes each time the order becomes fully paid, so the stamp lands again. */
  key: number;
}

/**
 * When to show the PAID stamp: statically if the order was already paid when it was opened, and
 * with the stamp-in animation at the moment it becomes fully paid (the drawer's signature moment).
 * `confirmed` is the server's full record (undefined while it loads); `fallback` the list copy.
 */
function useStampMoment(confirmed: PaymentStatus | undefined, fallback: PaymentStatus): StampMoment {
  const [seen, setSeen] = useState(confirmed);
  const [animate, setAnimate] = useState(false);
  const [key, setKey] = useState(0);
  if (confirmed !== seen) {
    setSeen(confirmed);
    const becamePaid = seen !== undefined && seen !== "paid" && confirmed === "paid";
    setAnimate(becamePaid);
    if (becamePaid) setKey((value) => value + 1);
  }
  return { show: (confirmed ?? fallback) === "paid", animate, key };
}

export interface PaymentSectionProps {
  order: Order;
  detail: OrderDetail | undefined;
  /** The "Collect payment" amount field, focused by "Collect ₹X". */
  amountRef: RefObject<HTMLInputElement | null>;
  sectionRef: RefObject<HTMLElement | null>;
}

/** Total · Paid · Due, the payments taken, and the inline "Collect payment" form. */
export function PaymentSection({ order, detail, amountRef, sectionRef }: PaymentSectionProps) {
  const headingId = useId();
  const stamp = useStampMoment(detail?.payment_status, order.payment_status);
  const cancelled = order.status === "cancelled";
  const due = cancelled ? 0 : order.outstanding;

  return (
    <section ref={sectionRef} tabIndex={-1} className={cx(styles.section, styles.paymentSection)} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h3 id={headingId} className={styles.sectionTitle}>
          Payment
        </h3>
        <PaymentStatusBadge status={order.payment_status} />
      </div>

      <div className={styles.paymentBlock}>
        <dl className={styles.strip}>
          <div className={styles.stripCell}>
            <dt>Total</dt>
            <dd>
              <Money value={order.total} size="lg" />
            </dd>
          </div>
          <div className={styles.stripCell}>
            <dt>Paid</dt>
            <dd>
              <Money value={order.paid} size="lg" tone={order.paid > 0 ? "leaf" : "default"} />
            </dd>
          </div>
          <div className={styles.stripCell}>
            <dt>Due</dt>
            <dd>
              <Money value={due} size="lg" tone={due > 0 ? "margin" : "muted"} />
            </dd>
          </div>
        </dl>
        {stamp.show && !cancelled && (
          <span className={cx(styles.stampSlot, stamp.animate && styles.stampSlotLanding)}>
            <Stamp key={stamp.key} label="Paid" size={stamp.animate ? "md" : "sm"} animate={stamp.animate} />
          </span>
        )}
      </div>

      <PaymentList order={order} payments={detail?.payments} />

      {!cancelled && order.outstanding > 0 && <CollectForm order={order} amountRef={amountRef} sectionRef={sectionRef} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Payments taken
// ---------------------------------------------------------------------------

function PaymentList({ order, payments }: { order: Order; payments: Payment[] | undefined }) {
  const { can } = useAuth();
  const canVoid = can("payments");
  const [voiding, setVoiding] = useState<Payment | null>(null);

  if (!payments) {
    return order.paid > 0 ? (
      <div className={styles.listLoading} aria-busy="true">
        <Skeleton width="62%" height={14} />
        <Skeleton width="48%" height={14} />
      </div>
    ) : null;
  }
  if (payments.length === 0) {
    return order.status === "cancelled" ? null : <p className={styles.quiet}>No payments yet.</p>;
  }

  return (
    <>
      <ul className={styles.payments} aria-label="Payments taken">
        {payments.map((payment) => (
          <li key={payment.id} className={styles.payment}>
            <Money value={payment.amount} tone="leaf" />
            <span className={styles.paymentMeta}>
              {METHOD_LABEL[payment.method]}
              {payment.batch_id && " · khata payment"}
              {" · "}
              <time dateTime={payment.paid_at} title={formatDateTime(payment.paid_at)}>
                {formatRelative(payment.paid_at)}
              </time>
              {payment.received_by_name && ` · ${payment.received_by_name}`}
            </span>
            {canVoid ? (
              <Menu
                label={`Actions for the ${formatMoney(payment.amount)} payment`}
                size="sm"
                items={[
                  {
                    label: "Void payment",
                    tone: "danger",
                    icon: <Undo2 aria-hidden="true" />,
                    hint: "For a payment entered by mistake",
                    onSelect: () => setVoiding(payment),
                  },
                ]}
              />
            ) : (
              <span />
            )}
            {payment.note && <span className={styles.paymentNote}>{payment.note}</span>}
          </li>
        ))}
      </ul>
      <VoidPaymentDialog payment={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}

function VoidPaymentDialog({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const voidPayment = useVoidPayment();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  // Keep the last payment on screen while the dialog animates out.
  const [shown, setShown] = useState(payment);
  if (payment && payment !== shown) {
    setShown(payment);
    setError(null);
  }

  const confirm = async () => {
    if (!shown) return;
    try {
      await voidPayment.mutateAsync(shown.id);
      toast.success("Payment voided", { description: `${formatMoney(shown.amount)} is due on the order again.` });
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <ConfirmDialog
      open={payment !== null}
      onClose={onClose}
      onConfirm={() => void confirm()}
      title={shown ? `Void ${formatMoney(shown.amount)} from ${shown.customer_name ?? "this order"}?` : "Void this payment?"}
      description="The order's due amount goes back up."
      confirmLabel="Void payment"
      loading={voidPayment.isPending}
      error={error}
    />
  );
}

// ---------------------------------------------------------------------------
// Collect payment
// ---------------------------------------------------------------------------

interface CollectFormProps {
  order: Order;
  amountRef: RefObject<HTMLInputElement | null>;
  sectionRef: RefObject<HTMLElement | null>;
}

/**
 * Amount (prefilled with what's due) + method + Record payment. For a ready order the same click can
 * also hand it over, so the pickup flow is: Collect ₹X → Record payment & mark collected.
 */
function CollectForm({ order, amountRef, sectionRef }: CollectFormProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const addPayment = useAddOrderPayment();
  const updateStatus = useUpdateOrderStatus();
  const titleId = useId();

  const [amount, setAmount] = useState<number | null>(order.outstanding);
  const [lastOutstanding, setLastOutstanding] = useState(order.outstanding);
  if (order.outstanding !== lastOutstanding) {
    setLastOutstanding(order.outstanding);
    setAmount(order.outstanding);
  }
  const [method, setMethod] = useState<PaymentMethod>(lastPaymentMethod);
  const [handOver, setHandOver] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const done = completedStatusFor(order.fulfillment);
  const offerHandOver = order.status === "ready";
  const finishing = offerHandOver && handOver;
  const busy = addPayment.isPending || updateStatus.isPending;
  const doneVerb = ORDER_STATUS_ACTION[done].toLowerCase();

  const submit = async () => {
    if (busy) return;
    const value = amount ?? 0;
    if (toPaise(value) <= 0) {
      setError("Enter an amount more than ₹0.");
      amountRef.current?.focus();
      return;
    }
    if (toPaise(value) > toPaise(order.outstanding)) {
      setError(`That's more than the ${formatMoney(order.outstanding)} due on this order.`);
      amountRef.current?.focus();
      return;
    }
    setError(null);

    let paid: OrderDetail;
    try {
      paid = await addPayment.mutateAsync({ orderId: order.id, amount: value, method });
    } catch (caught) {
      setError(errorMessage(caught));
      return;
    }
    rememberPaymentMethod(method);
    syncOpenOrderLists(queryClient, paid);
    // This form disappears once nothing is due; keep keyboard focus inside the payment section.
    if (paid.outstanding <= 0) sectionRef.current?.focus({ preventScroll: true });

    const received = `${formatMoney(value)} by ${METHOD_LABEL[method]}`;
    const stillDue = paid.outstanding > 0 ? `${formatMoney(paid.outstanding)} still due` : null;
    if (!finishing) {
      toast.success("Payment recorded", { description: [received, stillDue].filter(Boolean).join(" · ") });
      return;
    }
    const doneText = done === "delivered" ? "marked delivered" : "marked collected";
    try {
      const completed = await updateStatus.mutateAsync({ orderId: order.id, status: done });
      syncOpenOrderLists(queryClient, completed);
      const khata = completed.outstanding > 0 ? `${formatMoney(completed.outstanding)} to khata` : null;
      toast.success(`Payment recorded and ${doneText}`, {
        description: [received, khata].filter(Boolean).join(" · "),
      });
    } catch (caught) {
      toast.error(`Payment recorded, but the order wasn't ${doneText}.`, { description: errorMessage(caught) });
    }
  };

  return (
    <form
      className={styles.collect}
      aria-labelledby={titleId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h4 id={titleId} className={styles.collectTitle}>
        Collect payment
      </h4>
      <div className={styles.collectRow}>
        <Field label="Amount" error={error}>
          <MoneyInput ref={amountRef} value={amount} onChange={setAmount} />
        </Field>
        <Field label="Paid by">
          <SegmentedControl options={METHOD_OPTIONS} value={method} onChange={setMethod} size="sm" block />
        </Field>
      </div>
      {offerHandOver && (
        <Switch
          checked={handOver}
          onCheckedChange={setHandOver}
          label={order.fulfillment === "delivery" ? "Mark delivered now" : "Hand over now (mark collected)"}
        />
      )}
      <Button type="submit" variant="primary" loading={busy} className={styles.collectButton}>
        {finishing ? `Record payment & ${doneVerb}` : "Record payment"}
      </Button>
    </form>
  );
}
