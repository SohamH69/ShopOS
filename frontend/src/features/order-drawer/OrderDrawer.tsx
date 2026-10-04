import { CircleCheck, IndianRupee, Phone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, Badge, Button, Drawer, ErrorState, OrderStatusBadge, Skeleton } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { CHANNEL_LABEL, completedStatusFor, FULFILLMENT_LABEL, ORDER_STATUS_ACTION, ORDER_STATUS_LABEL } from "../../lib/constants";
import { firstName, formatDateTime, formatMoney, formatPhone, formatRelative, orderNo, telHref } from "../../lib/format";
import { usePrefersReducedMotion } from "../../lib/hooks";
import { useCustomer, useOrder } from "../../lib/queries";
import type { Customer, Order, OrderDetail } from "../../lib/types";
import { DetailsSection } from "./DetailsSection";
import { ItemsSection } from "./ItemsSection";
import { OrderActionsMenu } from "./OrderActionsMenu";
import { useCachedOrder } from "./orderCache";
import styles from "./OrderDrawer.module.css";
import { nextActionFor, takePaymentFocusRequest, useChangeOrderStatus } from "./orderFlow";
import { PaymentSection } from "./PaymentSection";
import { StatusTrack } from "./StatusTrack";

export interface OrderDrawerProps {
  orderId: number | null;
  onClose: () => void;
}

/**
 * The order drawer: status and next step, payment (the PAID stamp lands here), items, details.
 * Opened from anywhere with useOrderDrawer().openOrder(id); stays mounted so it can animate out.
 */
export default function OrderDrawer({ orderId, onClose }: OrderDrawerProps) {
  const { can } = useAuth();
  const canOrders = can("orders");
  // Keep showing the last order while the drawer slides away.
  const [shownId, setShownId] = useState<number | null>(orderId);
  if (orderId !== null && orderId !== shownId) setShownId(orderId);
  const open = orderId !== null;

  const query = useOrder(shownId, { enabled: open });
  // A copy from a list already on screen lets the drawer draw at once; the full record follows.
  const cached = useCachedOrder(shownId, canOrders && !query.data);
  const order: Order | undefined = query.data ?? (query.isError ? undefined : cached);
  const failed = query.isError && !query.data;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={order ? <span className={styles.number}>{orderNo(order.number)}</span> : "Order"}
      description={order ? <HeaderMeta order={order} /> : undefined}
      headerActions={order && !failed ? <OrderActionsMenu order={order} detail={query.data} onClose={onClose} /> : undefined}
    >
      {failed ? (
        <ErrorState
          title="This order didn't load"
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : order ? (
        <OrderDrawerBody key={order.id} order={order} detail={query.data} />
      ) : (
        <DrawerSkeleton />
      )}
    </Drawer>
  );
}

function HeaderMeta({ order }: { order: Order }) {
  return (
    <span className={styles.headerMeta}>
      <span title={formatDateTime(order.created_at)}>Created {formatRelative(order.created_at)}</span>
      <span className={styles.tag}>{CHANNEL_LABEL[order.channel]}</span>
      <span className={styles.tag}>{FULFILLMENT_LABEL[order.fulfillment]}</span>
      {order.is_overdue && (
        <Badge tone="margin" size="sm">
          Overdue
        </Badge>
      )}
    </span>
  );
}

function OrderDrawerBody({ order, detail }: { order: Order; detail: OrderDetail | undefined }) {
  const reducedMotion = usePrefersReducedMotion();
  const amountRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLElement>(null);
  const customer = useCustomer(order.customer_id);

  const focusPayment = useCallback(() => {
    paymentRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    const input = amountRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, [reducedMotion]);

  // Opened with "Collect ₹X" from the pickups board: start in the payment form.
  useEffect(() => {
    if (takePaymentFocusRequest(order.id)) focusPayment();
  }, [order.id, focusPayment]);

  return (
    <div className={styles.body}>
      <CustomerBlock order={order} customer={customer.data} />
      <StatusSection order={order} onCollect={focusPayment} />
      <PaymentSection order={order} detail={detail} amountRef={amountRef} sectionRef={paymentRef} />
      <ItemsSection order={order} />
      <DetailsSection order={order} />
    </div>
  );
}

function CustomerBlock({ order, customer }: { order: Order; customer: Customer | undefined }) {
  const { can } = useAuth();
  if (order.customer_id === null) {
    return (
      <div className={styles.customer}>
        <Avatar name="Walk in" />
        <span className={styles.customerText}>
          <span className={styles.customerName}>Walk-in customer</span>
          <span className={styles.customerMeta}>No customer on this order, so it's paid in full.</span>
        </span>
      </div>
    );
  }
  const name = order.customer_name ?? "Customer";
  const dues = customer?.outstanding ?? 0;
  return (
    <div className={styles.customer}>
      <Avatar name={name} size="lg" />
      <span className={styles.customerText}>
        {can("customers") ? (
          <Link to={`/app/customers/${order.customer_id}`} className={styles.customerName}>
            {name}
          </Link>
        ) : (
          <span className={styles.customerName}>{name}</span>
        )}
        <span className={styles.customerMeta}>
          {order.customer_phone && (
            <a href={telHref(order.customer_phone)} className={styles.phone}>
              <Phone aria-hidden="true" />
              <span className="mono">{formatPhone(order.customer_phone)}</span>
            </a>
          )}
          {dues > 0 && <span className={styles.customerDue}>{formatMoney(dues)} due on khata</span>}
        </span>
      </span>
    </div>
  );
}

function StatusSection({ order, onCollect }: { order: Order; onCollect: () => void }) {
  const { change, pendingStatus } = useChangeOrderStatus();
  const pending = pendingStatus(order.id);
  const busy = pending !== undefined;
  const action = nextActionFor(order);
  const done = completedStatusFor(order.fulfillment);

  if (order.status === "cancelled") {
    return (
      <div className={styles.cancelled}>
        <span className={styles.cancelledText}>
          <OrderStatusBadge status="cancelled" />
          <span>Not counted in sales, dues or stock.</span>
        </span>
        <Button size="sm" loading={pending === "new"} onClick={() => void change(order, "new")}>
          {ORDER_STATUS_ACTION.new}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.statusBlock}>
      <StatusTrack status={order.status} fulfillment={order.fulfillment} />
      {action ? (
        <>
          <div className={styles.statusActions}>
            {action.kind === "collect" ? (
              <>
                <Button variant="primary" icon={<IndianRupee aria-hidden="true" />} onClick={onCollect} disabled={busy}>
                  {action.label}
                </Button>
                <Button loading={pending === done} disabled={busy} onClick={() => void change(order, done)}>
                  {ORDER_STATUS_ACTION[done]}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="primary"
                  loading={pending === action.status}
                  disabled={busy}
                  onClick={() => void change(order, action.status)}
                >
                  {action.label}
                </Button>
                {order.status === "new" && (
                  <Button loading={pending === "ready"} disabled={busy} onClick={() => void change(order, "ready")}>
                    {ORDER_STATUS_ACTION.ready}
                  </Button>
                )}
              </>
            )}
          </div>
          {action.kind === "collect" && order.customer_name && (
            <p className={styles.statusHint}>
              {ORDER_STATUS_ACTION[done]} without payment and {formatMoney(order.outstanding)} goes to{" "}
              {firstName(order.customer_name)}'s khata.
            </p>
          )}
        </>
      ) : (
        <p className={styles.doneNote}>
          <CircleCheck aria-hidden="true" />
          {ORDER_STATUS_LABEL[order.status]}
          {order.completed_at && <span className={styles.doneWhen}> {formatRelative(order.completed_at)}</span>}
        </p>
      )}
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Loading order">
      <div className={styles.skeletonRow}>
        <Skeleton width={40} height={40} radius="50%" />
        <div className={styles.skeletonText}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="35%" height={12} />
        </div>
      </div>
      <Skeleton height={44} radius={10} />
      <Skeleton height={40} width="60%" radius={10} />
      <Skeleton height={70} radius={10} />
      <Skeleton width="80%" />
      <Skeleton width="65%" />
      <Skeleton width="72%" />
    </div>
  );
}
