import { ChevronRight, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ButtonLink, Card, EmptyState, Money, OrderStatusBadge, PaymentStatusBadge, Skeleton } from "../../../components/ui";
import { useNewOrder } from "../../../features/new-order/NewOrderProvider";
import { useOrderDrawer } from "../../../features/order-drawer/OrderDrawerProvider";
import { useAuth } from "../../../lib/auth";
import { cx } from "../../../lib/cx";
import { formatCount, formatDue, formatRelative, orderNo } from "../../../lib/format";
import type { Order } from "../../../lib/types";
import styles from "./PickupsCard.module.css";

function PickupRow({ order, now, onOpen }: { order: Order; now: number; onOpen?: (id: number) => void }) {
  const due = formatDue(order.due_at, now);
  const content = (
    <>
      <span className={styles.who}>
        <span className={styles.name}>{order.customer_name ?? "Walk-in"}</span>
        <span className={cx(styles.number, "mono")}>{orderNo(order.number)}</span>
      </span>
      <Money className={styles.total} value={order.total} />
      <span className={styles.badges}>
        <OrderStatusBadge status={order.status} />
        <PaymentStatusBadge status={order.payment_status} />
      </span>
      <span className={cx(styles.when, due?.overdue && styles.overdue)}>
        {due ? due.text : `Ordered ${formatRelative(order.created_at, now)}`}
      </span>
    </>
  );
  return onOpen ? (
    <button type="button" className={cx(styles.row, styles.clickable)} onClick={() => onOpen(order.id)}>
      {content}
    </button>
  ) : (
    <div className={styles.row}>{content}</div>
  );
}

export interface PickupsCardProps {
  /** Up to 6 open pickup orders (ready first, then by due time); undefined while loading. */
  orders: readonly Order[] | undefined;
  /** How many pickups are open in all. */
  total: number | undefined;
  now: number;
  className?: string;
}

/** The orders customers will come to collect, most urgent first. */
export function PickupsCard({ orders, total, now, className }: PickupsCardProps) {
  const { can } = useAuth();
  const { openOrder } = useOrderDrawer();
  const { openNewOrder } = useNewOrder();
  const canOrder = can("orders");

  const title = (
    <>
      Pending pickups
      {total !== undefined && total > 0 && (
        <span className={styles.count}>
          <span className="visually-hidden">: </span>
          {formatCount(total)}
        </span>
      )}
    </>
  );

  let body: ReactNode;
  if (!orders) {
    body = (
      <ul className={styles.list} aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <li key={index} className={styles.item}>
            <div className={styles.row}>
              <span className={styles.who}>
                <Skeleton width="55%" height={14} />
              </span>
              <Skeleton width={56} height={14} />
              <span className={styles.badges}>
                <Skeleton width={120} height={12} />
              </span>
              <Skeleton width={72} height={12} />
            </div>
          </li>
        ))}
      </ul>
    );
  } else if (orders.length === 0) {
    body = (
      <EmptyState
        compact
        title="No pickups waiting."
        description="New orders marked for pickup show up here."
        action={
          canOrder ? (
            <Button size="sm" icon={<Plus aria-hidden="true" />} onClick={() => openNewOrder()}>
              New order
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <ul className={styles.list}>
        {orders.map((order) => (
          <li key={order.id} className={styles.item}>
            <PickupRow order={order} now={now} onOpen={canOrder ? openOrder : undefined} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card
      className={className}
      title={title}
      padding="none"
      actions={
        canOrder ? (
          <ButtonLink to="/app/pickups" variant="ghost" size="sm" iconRight={<ChevronRight aria-hidden="true" />}>
            View all
          </ButtonLink>
        ) : undefined
      }
    >
      <div aria-busy={!orders || undefined}>{body}</div>
    </Card>
  );
}
