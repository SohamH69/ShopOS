import { Plus } from "lucide-react";
import { Button, Card, ErrorState, PageHeader, StatStrip, Trend, type StatItem } from "../../../components/ui";
import { useNewOrder } from "../../../features/new-order/NewOrderProvider";
import { useAuth } from "../../../lib/auth";
import { formatCount, formatDateLong, formatMoney, pluralize, todayISO } from "../../../lib/format";
import { useDocumentTitle } from "../../../lib/hooks";
import { useDashboard } from "../../../lib/queries";
import type { Dashboard } from "../../../lib/types";
import { AttentionCard } from "./AttentionCard";
import styles from "./DashboardPage.module.css";
import { LowStockCard } from "./LowStockCard";
import { PickupsCard } from "./PickupsCard";
import { RecentOrdersCard } from "./RecentOrdersCard";
import { SetupChecklist } from "./SetupChecklist";
import { useNow } from "./useNow";
import { WeekCard } from "./WeekCard";

/** The Today screen stays open at the counter all day, so its numbers refresh on their own. */
const REFRESH_MS = 30_000;

const LOADING_STATS: StatItem[] = [
  { key: "sales", label: "Sales today", value: "" },
  { key: "orders", label: "Orders", value: "" },
  { key: "received", label: "Received", value: "" },
  { key: "owed", label: "Owed to you", value: "" },
];

function statItems(dashboard: Dashboard, canOpenCustomers: boolean): StatItem[] {
  const { metrics } = dashboard;
  const dues = dashboard.attention.find((item) => item.key === "customer_dues");
  let owedHint = "No dues right now";
  if (metrics.outstanding > 0) owedHint = dues ? `${pluralize(dues.count, "customer")} with dues` : "Customer dues";

  return [
    {
      key: "sales",
      label: "Sales today",
      value: formatMoney(metrics.sales),
      hint: <Trend current={metrics.sales} previous={metrics.yesterday_sales} comparison="yesterday" />,
    },
    {
      key: "orders",
      label: "Orders",
      value: formatCount(metrics.orders),
      hint: <Trend current={metrics.orders} previous={metrics.yesterday_orders} comparison="yesterday" />,
    },
    {
      key: "received",
      label: "Received",
      value: formatMoney(metrics.payments_received),
      hint: <Trend current={metrics.payments_received} previous={metrics.yesterday_payments} comparison="yesterday" />,
    },
    {
      key: "owed",
      label: "Owed to you",
      value: formatMoney(metrics.outstanding),
      tone: metrics.outstanding > 0 ? "margin" : "default",
      hint: owedHint,
      to: canOpenCustomers && metrics.outstanding > 0 ? "/app/customers?filter=dues" : undefined,
    },
  ];
}

/** "Today": what is happening in the shop right now, and what to handle first. */
export default function DashboardPage() {
  useDocumentTitle("Today");
  const { shop, can } = useAuth();
  const { openNewOrder } = useNewOrder();
  const query = useDashboard({ refetchInterval: REFRESH_MS });
  const now = useNow();
  const dashboard = query.data;

  const description = [formatDateLong(dashboard?.date ?? todayISO(now)), shop?.name].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title="Today"
        description={description}
        actions={
          can("orders") ? (
            <Button icon={<Plus aria-hidden="true" />} onClick={() => openNewOrder()} aria-keyshortcuts="N">
              New order
            </Button>
          ) : null
        }
      />

      {query.isError && !dashboard ? (
        <Card padding="none">
          <ErrorState
            title="Today's numbers didn't load"
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        </Card>
      ) : (
        <div className={styles.stack}>
          {dashboard && <SetupChecklist setup={dashboard.setup} shopId={shop?.id} />}

          <StatStrip loading={!dashboard} items={dashboard ? statItems(dashboard, can("customers")) : LOADING_STATS} />

          <div className={styles.gridWrap}>
            <div className={styles.grid}>
              <AttentionCard className={styles.attention} items={dashboard?.attention} />
              <PickupsCard
                className={styles.pickups}
                orders={dashboard?.pickups}
                total={dashboard?.metrics.pending_pickups}
                now={now}
              />
              <WeekCard className={styles.week} points={dashboard?.sales_7d} today={dashboard?.date} />
              <LowStockCard className={styles.lowStock} products={dashboard?.low_stock} total={dashboard?.metrics.low_stock} />
              <RecentOrdersCard className={styles.recent} orders={dashboard?.recent_orders} now={now} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
