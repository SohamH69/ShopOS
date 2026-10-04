import { useMemo, type ReactNode } from "react";
import {
  DataTable,
  EmptyState,
  Money,
  OrderStatusBadge,
  PaymentStatusBadge,
  type DataColumn,
} from "../../../components/ui";
import { METHOD_LABEL } from "../../../lib/constants";
import { formatDate, formatDateTime, formatItemsSummary, formatTime, orderNo } from "../../../lib/format";
import type { Order, Payment } from "../../../lib/types";
import styles from "./CustomerRecords.module.css";

export interface CustomerOrdersTableProps {
  /** Newest first, cancelled included; undefined while loading. */
  orders: readonly Order[] | undefined;
  error?: unknown;
  onRetry: () => void;
  /** Opens an order in the drawer; without it rows are not clickable. */
  onOpenOrder?: (orderId: number) => void;
  emptyAction?: ReactNode;
}

/** Every order this customer has placed. */
export function CustomerOrdersTable({ orders, error, onRetry, onOpenOrder, emptyAction }: CustomerOrdersTableProps) {
  const columns = useMemo<DataColumn<Order>[]>(
    () => [
      {
        key: "order",
        header: "Order",
        mobile: "title",
        cell: (order) => (
          <span className={styles.stacked}>
            <span className="mono">{orderNo(order.number)}</span>
            <span className={styles.sub}>
              {formatDate(order.created_at)}, {formatTime(order.created_at)}
            </span>
          </span>
        ),
      },
      {
        key: "items",
        header: "Items",
        mobile: "hidden",
        cell: (order) => <span className={styles.items}>{formatItemsSummary(order.items)}</span>,
      },
      { key: "status", header: "Status", cell: (order) => <OrderStatusBadge status={order.status} /> },
      { key: "payment", header: "Payment", cell: (order) => <PaymentStatusBadge status={order.payment_status} /> },
      {
        key: "total",
        header: "Total",
        align: "right",
        mobile: "aside",
        cell: (order) => <Money value={order.total} />,
      },
      {
        key: "due",
        header: "Due",
        align: "right",
        cell: (order) =>
          order.status !== "cancelled" && order.outstanding > 0 ? (
            <Money value={order.outstanding} tone="margin" />
          ) : (
            <span className="muted">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <DataTable
      caption="Orders"
      columns={columns}
      rows={orders}
      rowKey={(order) => order.id}
      loading={!orders && !error}
      error={error}
      onRetry={onRetry}
      onRowClick={onOpenOrder ? (order) => onOpenOrder(order.id) : undefined}
      isRowMuted={(order) => order.status === "cancelled"}
      empty={<EmptyState title="No orders yet." description="Orders for this customer show up here." action={emptyAction} />}
    />
  );
}

export interface CustomerPaymentsTableProps {
  /** Newest first; undefined while loading. */
  payments: readonly Payment[] | undefined;
  error?: unknown;
  onRetry: () => void;
  onOpenOrder?: (orderId: number) => void;
}

/** Every payment this customer has made, on orders or against the khata. */
export function CustomerPaymentsTable({ payments, error, onRetry, onOpenOrder }: CustomerPaymentsTableProps) {
  const columns = useMemo<DataColumn<Payment>[]>(
    () => [
      {
        key: "date",
        header: "Date & time",
        mobile: "title",
        cell: (payment) => <span className="mono">{formatDateTime(payment.paid_at)}</span>,
      },
      {
        key: "method",
        header: "Method",
        cell: (payment) => (
          <span className={styles.stacked}>
            <span>{METHOD_LABEL[payment.method]}</span>
            {payment.batch_id && <span className={styles.sub}>Khata payment</span>}
          </span>
        ),
      },
      {
        key: "order",
        header: "Order",
        cell: (payment) => <span className="mono">{orderNo(payment.order_number)}</span>,
      },
      {
        key: "by",
        header: "Received by",
        cell: (payment) => payment.received_by_name ?? <span className="muted">—</span>,
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        mobile: "aside",
        cell: (payment) => <Money value={payment.amount} tone="leaf" />,
      },
    ],
    [],
  );

  return (
    <DataTable
      caption="Payments"
      columns={columns}
      rows={payments}
      rowKey={(payment) => payment.id}
      loading={!payments && !error}
      error={error}
      onRetry={onRetry}
      onRowClick={
        onOpenOrder
          ? (payment) => {
              if (payment.order_id !== null) onOpenOrder(payment.order_id);
            }
          : undefined
      }
      empty={
        <EmptyState
          title="No payments yet."
          description="Payments on this customer's orders, and khata payments you record here, show up in this list."
        />
      }
    />
  );
}
