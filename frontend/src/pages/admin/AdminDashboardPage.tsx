import { useMemo } from "react";
import { BarList, Card, ColumnChart, ErrorState, PageHeader, Skeleton, StatStrip, type ColumnDatum } from "../../components/ui";
import { PLAN_LABEL } from "../../lib/constants";
import { formatCount, formatDate, formatMoney, formatPercent, pluralize } from "../../lib/format";
import { useDocumentTitle, useMediaQuery } from "../../lib/hooks";
import { useAdminStats } from "../../lib/queries";
import type { AdminStats } from "../../lib/types";
import styles from "./AdminDashboard.module.css";
import { ShopsSection } from "./ShopsSection";

const countAxis = (value: number) => (Number.isInteger(value) ? formatCount(value) : "");

function signupData(stats: AdminStats | undefined): ColumnDatum[] {
  if (!stats) return [];
  const last = stats.signups_30d.length - 1;
  return stats.signups_30d.map((day, index) => ({
    key: day.date,
    label: formatDate(day.date),
    value: day.count,
    highlight: index === last,
  }));
}

/** The admin home: platform numbers, sign-ups, plans, and every shop. */
export default function AdminDashboardPage() {
  useDocumentTitle("Admin");
  const stats = useAdminStats();
  const data = stats.data;
  const phone = useMediaQuery("(max-width: 639px)");
  const signups = useMemo(() => signupData(data), [data]);
  const signupsTotal = data ? data.signups_30d.reduce((sum, day) => sum + day.count, 0) : 0;
  const loading = stats.isPending;
  const refreshing = stats.isFetching && !stats.isPending;

  const activeShare =
    data && data.shops_total > 0 ? `${formatPercent((data.shops_active_7d / data.shops_total) * 100)} of shops` : undefined;

  return (
    <>
      <PageHeader title="Overview" description="Every shop on ShopOS. The numbers leave out the demo shop." />

      <div className={styles.stack}>
        {stats.isError && !data ? (
          <Card>
            <ErrorState error={stats.error} onRetry={() => void stats.refetch()} retrying={stats.isFetching} compact />
          </Card>
        ) : (
          <section className={styles.kpis} aria-label="Platform numbers">
            <StatStrip
              loading={loading}
              refreshing={refreshing}
              items={[
                { key: "shops", label: "Shops", value: formatCount(data?.shops_total ?? 0) },
                {
                  key: "active",
                  label: "Active, last 7 days",
                  value: formatCount(data?.shops_active_7d ?? 0),
                  hint: activeShare,
                },
                { key: "new", label: "New, last 30 days", value: formatCount(data?.shops_new_30d ?? 0), tone: "pen" },
                {
                  key: "setup",
                  label: "Setup incomplete",
                  value: formatCount(data?.shops_setup_incomplete ?? 0),
                  hint: "No photo, map pin or address",
                  tone: data && data.shops_setup_incomplete > 0 ? "haldi" : "default",
                  to: "/admin?status=setup_incomplete#shops",
                },
              ]}
            />
            <StatStrip
              loading={loading}
              refreshing={refreshing}
              items={[
                {
                  key: "suspended",
                  label: "Suspended",
                  value: formatCount(data?.shops_suspended ?? 0),
                  tone: data && data.shops_suspended > 0 ? "margin" : "default",
                  to: "/admin?status=suspended#shops",
                },
                { key: "customers", label: "Customers", value: formatCount(data?.customers_total ?? 0), hint: "Across all shops" },
                { key: "orders", label: "Orders, last 30 days", value: formatCount(data?.orders_30d ?? 0) },
                {
                  key: "gmv",
                  label: "GMV, last 30 days",
                  value: formatMoney(data?.gmv_30d ?? 0),
                  hint: "Order value, cancelled left out",
                },
              ]}
            />
          </section>
        )}

        <div className={styles.charts}>
          <Card
            title="Sign-ups"
            description="New shops per day, last 30 days"
            actions={
              data ? (
                <span className={styles.chartTotal}>
                  <span className={styles.chartTotalValue}>{formatCount(signupsTotal)}</span>
                  <span className={styles.chartTotalLabel}>in 30 days</span>
                </span>
              ) : undefined
            }
          >
            {loading ? (
              <Skeleton height={phone ? 166 : 186} radius={10} />
            ) : (
              <div className={styles.chartWrap}>
                <ColumnChart
                  data={signups}
                  label={`Sign-ups, last 30 days: ${pluralize(signupsTotal, "new shop")}`}
                  height={phone ? 140 : 160}
                  formatValue={(value) => pluralize(value, "sign-up")}
                  formatAxis={countAxis}
                  refreshing={refreshing}
                  periodLabel="Day"
                  valueLabel="Sign-ups"
                />
                {data && signupsTotal === 0 && <p className={styles.chartEmpty}>No new shops in the last 30 days.</p>}
              </div>
            )}
          </Card>

          <Card title="Plans" description="Shops on each plan">
            {loading ? (
              <div className={styles.planSkeleton}>
                {[0, 1, 2, 3].map((row) => (
                  <Skeleton key={row} height={28} radius={6} />
                ))}
              </div>
            ) : (
              <BarList
                label="Shops on each plan"
                items={(data?.by_plan ?? []).map((row) => ({
                  key: row.plan,
                  label: PLAN_LABEL[row.plan],
                  value: row.count,
                  displayValue: (
                    <span className={styles.planValue}>
                      {formatCount(row.count)}
                      {data && data.shops_total > 0 && row.count > 0 && (
                        <span className={styles.planShare}>{formatPercent((row.count / data.shops_total) * 100)}</span>
                      )}
                    </span>
                  ),
                  to: `/admin?plan=${row.plan}#shops`,
                }))}
                formatValue={formatCount}
                empty="No shops yet."
              />
            )}
          </Card>
        </div>

        <ShopsSection setupIncomplete={data?.shops_setup_incomplete} suspended={data?.shops_suspended} />
      </div>
    </>
  );
}
