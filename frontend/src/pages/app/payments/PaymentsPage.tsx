import { Ban } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BarList,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadMore,
  Menu,
  Money,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  StatStrip,
  useToast,
  type DataColumn,
  type SegmentedOption,
} from "../../../components/ui";
import { useOrderDrawer } from "../../../features/order-drawer/OrderDrawerProvider";
import { errorMessage } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { METHOD_LABEL, toOptions } from "../../../lib/constants";
import { dateRange, formatDate, formatDateTime, formatMoney, formatPercent, orderNo, pluralize, todayISO } from "../../../lib/format";
import { useDocumentTitle } from "../../../lib/hooks";
import { sumMoney } from "../../../lib/money";
import { useInfinitePayments, usePaymentSummary, useVoidPayment } from "../../../lib/queries";
import type { Payment, PaymentMethod, PaymentSummary } from "../../../lib/types";
import styles from "./PaymentsPage.module.css";

type RangeKey = "today" | "7d" | "30d" | "all";

const RANGE_OPTIONS: readonly SegmentedOption<RangeKey>[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

const METHOD_OPTIONS = toOptions(METHOD_LABEL);
const DEFAULT_RANGE: RangeKey = "all";

function parseRange(value: string | null): RangeKey {
  return value === "today" || value === "7d" || value === "30d" ? value : DEFAULT_RANGE;
}

function parseMethod(value: string | null): PaymentMethod | null {
  return value !== null && value in METHOD_LABEL ? (value as PaymentMethod) : null;
}

function summaryItems(summary: PaymentSummary | undefined) {
  const today = todayISO();
  const week = dateRange("7d");
  const month = dateRange("this_month");
  return [
    { key: "today", label: "Today", value: summary ? formatMoney(summary.today) : "", hint: formatDate(today) },
    {
      key: "week",
      label: "Last 7 days",
      value: summary ? formatMoney(summary.week) : "",
      hint: `${formatDate(week.date_from)} – ${formatDate(week.date_to)}`,
    },
    {
      key: "month",
      label: "This month",
      value: summary ? formatMoney(summary.month) : "",
      hint: `Since ${formatDate(month.date_from)}`,
    },
  ];
}

function MethodBreakdown({ summary, error, onRetry }: { summary: PaymentSummary | undefined; error: unknown; onRetry: () => void }) {
  let body: ReactNode;
  if (!summary && error) {
    body = <ErrorState compact error={error} onRetry={onRetry} />;
  } else if (!summary) {
    body = (
      <div className={styles.methodSkeleton} aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} height={30} />
        ))}
      </div>
    );
  } else {
    const total = sumMoney(summary.by_method.map((entry) => entry.amount));
    body = (
      <BarList
        className={styles.methodList}
        label="Payments by method this month"
        empty="No payments yet this month."
        items={summary.by_method.map((entry) => ({
          key: entry.method,
          label: METHOD_LABEL[entry.method],
          value: entry.amount,
          hint: `${pluralize(entry.count, "payment")}${total > 0 ? ` · ${formatPercent((entry.amount / total) * 100)}` : ""}`,
        }))}
      />
    );
  }
  return (
    <Card title="By method" description="This month" className={styles.methodCard}>
      <div className={styles.methodWrap}>{body}</div>
    </Card>
  );
}

/** Money received against orders and khata, with a way to void a wrong entry. */
export default function PaymentsPage() {
  useDocumentTitle("Payments");
  const { can } = useAuth();
  const { openOrder } = useOrderDrawer();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const method = parseMethod(params.get("method"));
  const range = parseRange(params.get("range"));

  const canOpenOrders = can("orders");
  const canOpenCustomers = can("customers");
  const canVoid = can("payments");

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const filters = useMemo(() => ({ ...(method ? { method } : {}), ...dateRange(range) }), [method, range]);
  const summary = usePaymentSummary();
  const payments = useInfinitePayments(filters);
  const voidPayment = useVoidPayment();

  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const askToVoid = (payment: Payment) => {
    setVoidTarget(payment);
    setVoidError(null);
    setVoidOpen(true);
  };

  const confirmVoid = () => {
    if (!voidTarget) return;
    voidPayment.mutate(voidTarget.id, {
      onSuccess: () => {
        toast.success("Payment voided", {
          description: `${formatMoney(voidTarget.amount)} is due again on order ${orderNo(voidTarget.order_number)}.`,
        });
        setVoidOpen(false);
      },
      onError: (error) => setVoidError(errorMessage(error)),
    });
  };

  const columns = useMemo<DataColumn<Payment>[]>(
    () => [
      {
        key: "date",
        header: "Date & time",
        mobile: "meta",
        mobileLabel: "Received",
        cell: (payment) => <span className={`${styles.when} mono`}>{formatDateTime(payment.paid_at)}</span>,
      },
      {
        key: "customer",
        header: "Customer",
        mobile: "title",
        cell: (payment) => {
          if (!payment.customer_name) return <span className="muted">Walk-in</span>;
          if (canOpenCustomers && payment.customer_id !== null) {
            return (
              <Link to={`/app/customers/${payment.customer_id}`} className={styles.customerLink}>
                {payment.customer_name}
              </Link>
            );
          }
          return payment.customer_name;
        },
      },
      {
        key: "order",
        header: "Order",
        cell: (payment) => {
          const orderId = payment.order_id;
          if (canOpenOrders && orderId !== null) {
            return (
              <button type="button" className={styles.orderLink} onClick={() => openOrder(orderId)}>
                {orderNo(payment.order_number)}
              </button>
            );
          }
          return <span className="mono">{orderNo(payment.order_number)}</span>;
        },
      },
      {
        key: "method",
        header: "Method",
        cell: (payment) => (
          <span className={styles.method}>
            <span>{METHOD_LABEL[payment.method]}</span>
            {payment.batch_id && <span className={styles.sub}>Khata payment</span>}
          </span>
        ),
      },
      {
        key: "by",
        header: "Received by",
        cell: (payment) => payment.received_by_name ?? <span className="muted">–</span>,
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        mobile: "aside",
        cell: (payment) => <Money value={payment.amount} tone="leaf" />,
      },
    ],
    [canOpenCustomers, canOpenOrders, openOrder],
  );

  const filtered = method !== null || range !== DEFAULT_RANGE;
  const empty = filtered ? (
    <EmptyState
      title="No payments match these filters."
      description={range === "today" ? "Nothing has been received yet today." : "Try another method or a longer period."}
      action={<Button onClick={() => updateParams({ method: null, range: null })}>Clear filters</Button>}
    />
  ) : (
    <EmptyState
      title="No payments yet."
      description="Payments you record on orders and against a customer's khata show up here."
    />
  );

  return (
    <>
      <PageHeader title="Payments" description="Money received against orders and khata." />

      <div className={styles.stack}>
        <StatStrip loading={summary.isPending} items={summaryItems(summary.data)} />

        <div className={styles.layoutWrap}>
          <div className={styles.layout}>
            <aside className={styles.side} aria-label="Payments by method">
              <MethodBreakdown summary={summary.data} error={summary.error} onRetry={() => void summary.refetch()} />
            </aside>

            <section className={styles.main} aria-label="Payment list">
              <div className={styles.filters}>
                <SegmentedControl<RangeKey>
                  label="Period"
                  value={range}
                  onChange={(next) => updateParams({ range: next === DEFAULT_RANGE ? null : next })}
                  options={RANGE_OPTIONS}
                />
                <Select<PaymentMethod>
                  aria-label="Payment method"
                  wrapperClassName={styles.methodSelect}
                  value={method ?? ""}
                  placeholder="Any method"
                  options={METHOD_OPTIONS}
                  onValueChange={(next) => updateParams({ method: next || null })}
                />
              </div>

              <DataTable
                caption="Payments, newest first"
                columns={columns}
                rows={payments.isPending ? undefined : payments.items}
                rowKey={(payment) => payment.id}
                loading={payments.isPending}
                refreshing={payments.isPlaceholderData}
                error={payments.isError ? payments.error : undefined}
                onRetry={payments.refetch}
                onRowClick={
                  canOpenOrders
                    ? (payment) => {
                        if (payment.order_id !== null) openOrder(payment.order_id);
                      }
                    : undefined
                }
                rowActions={
                  canVoid
                    ? (payment) => (
                        <Menu
                          label={`Actions for the ${formatMoney(payment.amount)} payment`}
                          items={[
                            {
                              label: "Void payment",
                              icon: <Ban />,
                              tone: "danger",
                              onSelect: () => askToVoid(payment),
                            },
                          ]}
                        />
                      )
                    : undefined
                }
                empty={empty}
                footer={
                  <LoadMore
                    shown={payments.items.length}
                    total={payments.total}
                    hasMore={payments.hasMore}
                    loading={payments.isLoadingMore}
                    onLoadMore={payments.loadMore}
                    noun="payments"
                  />
                }
              />
            </section>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={confirmVoid}
        title={
          voidTarget ? `Void ${formatMoney(voidTarget.amount)} from ${voidTarget.customer_name ?? "a walk-in customer"}?` : "Void payment?"
        }
        description={
          voidTarget
            ? `The due amount on order ${orderNo(voidTarget.order_number)} goes back up by ${formatMoney(voidTarget.amount)}.`
            : "The order's due amount goes back up."
        }
        confirmLabel="Void payment"
        loading={voidPayment.isPending}
        error={voidError}
      />
    </>
  );
}
