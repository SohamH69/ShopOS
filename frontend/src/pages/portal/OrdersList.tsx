import { ChevronDown, IndianRupee, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ButtonLink, EmptyState, Money, OrderStatusBadge, PaymentStatusBadge } from "../../components/ui";
import { FULFILLMENT_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatDateTime, formatMoney, formatQty, formatTime, orderNo, pluralize, toISODate, todayISO } from "../../lib/format";
import { usePrefersReducedMotion } from "../../lib/hooks";
import { toPaise } from "../../lib/money";
import type { PortalOrder, PortalShop } from "../../lib/types";
import { upiPaymentUri } from "../../lib/upi";
import styles from "./OrdersList.module.css";
import { newestOrdersFirst } from "./portalModel";

/** "6:30 pm" today, "14 Oct, 6:30 pm" on another day. */
function shortWhen(value: string): string {
  return toISODate(value) === todayISO() ? formatTime(value) : formatDateTime(value);
}

/** Where the order is, in the customer's words. Only for orders that aren't finished. */
function progressText(order: PortalOrder): string | null {
  const expected = order.due_at && Date.parse(order.due_at) > Date.now() ? ` Expected by ${shortWhen(order.due_at)}.` : "";
  switch (order.status) {
    case "new":
      return `${order.channel === "online" ? "Sent. The shop will start on it soon." : "The shop has your order."}${expected}`;
    case "preparing":
      return `The shop is getting it ready.${expected}`;
    case "ready":
      return order.fulfillment === "delivery" ? "Ready. It will be delivered soon." : "Ready. You can pick it up from the shop.";
    default:
      return null;
  }
}

function finishedText(order: PortalOrder): string | null {
  if (!order.completed_at) return null;
  if (order.status === "delivered") return `Delivered ${formatDateTime(order.completed_at)}`;
  if (order.status === "collected") return `Picked up ${formatDateTime(order.completed_at)}`;
  return null;
}

interface OrderCardProps {
  order: PortalOrder;
  open: boolean;
  onToggle: () => void;
  shop: PortalShop;
}

function OrderCard({ order, open, onToggle, shop }: OrderCardProps) {
  const bodyId = `portal-order-${order.id}-items`;
  const cancelled = order.status === "cancelled";
  const due = !cancelled && toPaise(order.outstanding) > 0;
  const progress = progressText(order);
  const finished = finishedText(order);
  const upiId = shop.upi_id?.trim() || null;
  const payUri =
    due && upiId
      ? upiPaymentUri({ upiId, payeeName: shop.name, amount: order.outstanding, note: `Order ${order.number}` })
      : null;

  return (
    <article id={`portal-order-${order.id}`} className={cx(styles.card, open && styles.open, cancelled && styles.cancelled)}>
      <h3 className={styles.heading}>
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className={styles.row}>
            <span className={styles.number}>Order {orderNo(order.number)}</span>
            <Money value={order.total} className={styles.total} />
          </span>
          <span className={cx(styles.row, styles.meta)}>
            <span>
              {formatDateTime(order.created_at)} · {FULFILLMENT_LABEL[order.fulfillment]} · {pluralize(order.items.length, "item")}
            </span>
            {due && (
              <span className={styles.due}>
                <Money value={order.outstanding} tone="margin" size="sm" /> due
              </span>
            )}
          </span>
          <span className={styles.badges}>
            <OrderStatusBadge status={order.status} />
            {!cancelled && <PaymentStatusBadge status={order.payment_status} />}
            {order.channel === "online" && <span className={styles.source}>Sent from this page</span>}
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </span>
          {progress && <span className={styles.progress}>{progress}</span>}
        </button>
      </h3>

      <div id={bodyId} className={styles.body} hidden={!open}>
        <ul className={styles.items} aria-label={`Items in order ${orderNo(order.number)}`}>
          {order.items.map((item, index) => (
            <li key={`${item.name}-${index}`} className={styles.item}>
              <span className={styles.itemName}>{item.name}</span>
              <span className={styles.itemQty}>
                {formatQty(item.quantity, item.unit)} × {formatMoney(item.unit_price)}
              </span>
              <Money value={item.line_total} className={styles.itemTotal} />
            </li>
          ))}
        </ul>
        <dl className={styles.totals}>
          <div>
            <dt>Total</dt>
            <dd>
              <Money value={order.total} />
            </dd>
          </div>
          {toPaise(order.paid) > 0 && (
            <div>
              <dt>Paid</dt>
              <dd>
                <Money value={order.paid} tone="leaf" />
              </dd>
            </div>
          )}
          {due && (
            <div className={styles.dueRow}>
              <dt>Left to pay</dt>
              <dd>
                <Money value={order.outstanding} tone="margin" />
              </dd>
            </div>
          )}
        </dl>
        {finished && <p className={styles.finished}>{finished}</p>}
        {payUri && (
          <ButtonLink href={payUri} size="sm" className={styles.pay} icon={<IndianRupee aria-hidden="true" />}>
            Pay {formatMoney(order.outstanding)} for this order
          </ButtonLink>
        )}
      </div>
    </article>
  );
}

export interface OrdersListProps {
  orders: readonly PortalOrder[];
  shop: PortalShop;
  openIds: ReadonlySet<number>;
  onToggle: (orderId: number) => void;
  /** Scroll to this order (opened from the khata), then call onFocused. */
  focusOrderId: number | null;
  onFocused: () => void;
  /** Shown when the list is empty and the shop takes orders here. */
  emptyAction?: ReactNode;
}

export function OrdersList({ orders, shop, openIds, onToggle, focusOrderId, onFocused, emptyAction }: OrdersListProps) {
  const sorted = useMemo(() => newestOrdersFirst(orders), [orders]);
  const reducedMotion = usePrefersReducedMotion();
  const onFocusedRef = useRef(onFocused);
  onFocusedRef.current = onFocused;

  useEffect(() => {
    if (focusOrderId === null) return;
    const node = document.getElementById(`portal-order-${focusOrderId}`);
    if (node) {
      node.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
      node.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
    }
    onFocusedRef.current();
  }, [focusOrderId, reducedMotion]);

  if (sorted.length === 0) {
    return (
      <div className={styles.empty}>
        <EmptyState
          icon={<ReceiptText />}
          title="No orders yet."
          description={`Your orders at ${shop.name} will show up here.`}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <ol className={styles.list}>
      {sorted.map((order) => (
        <li key={order.id}>
          <OrderCard order={order} shop={shop} open={openIds.has(order.id)} onToggle={() => onToggle(order.id)} />
        </li>
      ))}
    </ol>
  );
}
