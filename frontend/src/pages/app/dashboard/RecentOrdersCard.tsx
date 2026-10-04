import { ChevronRight, Plus } from "lucide-react";
import { useMemo } from "react";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  Money,
  OrderStatusBadge,
  PaymentStatusBadge,
  type DataColumn,
} from "../../../components/ui";
import { useNewOrder } from "../../../features/new-order/NewOrderProvider";
import { useOrderDrawer } from "../../../features/order-drawer/OrderDrawerProvider";
import { useAuth } from "../../../lib/auth";
import { formatItemsSummary, formatRelative, orderNo } from "../../../lib/format";
import type { Order } from "../../../lib/types";
import styles from "./RecentOrdersCard.module.css";

export interface RecentOrdersCardProps {
  /** Up to 8 orders, newest first; undefined while loading. */
  orders: readonly Order[] | undefined;
  now: number;
  className?: string;
}

/** The latest orders at a glance; a row opens the order drawer. */
export function RecentOrdersCard({ orders, now, className }: RecentOrdersCardProps) {
  const { can } = useAuth();
  const { openOrder } = useOrderDrawer();
  const { openNewOrder } = useNewOrder();
  const canOrder = can("orders");

  const columns = useMemo<DataColumn<Order>[]>(
    () => [
      {
        key: "order",
        header: "Order",
        mobile: "title",
        cell: (order) => (
          <span className={styles.order}>
            <span className="mono">{orderNo(order.number)}</span>
            <span className={styles.time}>{formatRelative(order.created_at, now)}</span>
          </span>
        ),
      },
      {
        key: "customer",
        header: "Customer",
        cell: (order) => order.customer_name ?? <span className="muted">Walk-in</span>,
      },
      {
        key: "items",
        header: "Items",
        mobile: "hidden",
        cell: (order) => <span className={styles.items}>{formatItemsSummary(order.items)}</span>,
      },
      { key: "status", header: "Status", cell: (order) => <OrderStatusBadge status={order.status} /> },
      { key: "payment", header: "Payment", cell: (order) => <PaymentStatusBadge status={order.payment_status} /> },
      { key: "total", header: "Total", align: "right", mobile: "aside", cell: (order) => <Money value={order.total} /> },
    ],
    [now],
  );

  return (
    <Card
      className={className}
      title="Recent orders"
      padding="none"
      actions={
        canOrder && orders && orders.length > 0 ? (
          <ButtonLink to="/app/orders" variant="ghost" size="sm" iconRight={<ChevronRight aria-hidden="true" />}>
            View all
          </ButtonLink>
        ) : undefined
      }
    >
      <DataTable
        caption="Recent orders"
        framed={false}
        density="compact"
        columns={columns}
        rows={orders}
        rowKey={(order) => order.id}
        loading={!orders}
        skeletonRows={5}
        onRowClick={canOrder ? (order) => openOrder(order.id) : undefined}
        isRowMuted={(order) => order.status === "cancelled"}
        empty={
          <EmptyState
            compact
            title="No orders yet."
            description="Create your first order. It takes a few seconds."
            action={
              canOrder ? (
                <Button variant="primary" size="sm" icon={<Plus aria-hidden="true" />} onClick={() => openNewOrder()}>
                  New order
                </Button>
              ) : undefined
            }
          />
        }
      />
    </Card>
  );
}
