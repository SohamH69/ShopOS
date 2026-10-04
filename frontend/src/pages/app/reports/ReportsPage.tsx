import { useMemo } from "react";
import {
  Card,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  SkeletonText,
  StatStrip,
  Trend,
  type StatItem,
} from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { EXPENSE_CATEGORY_LABEL, REPORT_RANGE_LABEL } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { formatCount, formatMoney } from "../../../lib/format";
import { useDocumentTitle, useSearchParam } from "../../../lib/hooks";
import { useProducts, useReport } from "../../../lib/queries";
import type { Report, ReportRange } from "../../../lib/types";
import { CustomersCard, TopCustomersCard } from "./CustomerCards";
import { ExportMenu } from "./ExportMenu";
import { ExpensesCard, PaymentsCard } from "./MoneyCards";
import { CategoriesCard, LowStockCard, MoversCard, TopProductsCard } from "./ProductCards";
import { averageOrder, comparisonLabel, DEFAULT_RANGE, parseRange, rangeText, REPORT_RANGES, shareText, unitLookup } from "./reportData";
import styles from "./ReportsPage.module.css";
import { SalesCard } from "./SalesCard";

const RANGE_OPTIONS = REPORT_RANGES.map((value) => ({ value, label: REPORT_RANGE_LABEL[value] }));

const STAT_LABELS = ["Sales", "Orders", "Average order", "Gross profit", "Expenses", "Net profit"];

export default function ReportsPage() {
  useDocumentTitle("Reports");
  const { can } = useAuth();
  const [rangeParam, setRangeParam] = useSearchParam("range", DEFAULT_RANGE);
  const range = parseRange(rangeParam);
  const report = useReport(range);
  // Units for "12 kg sold" come from the product list when this role may read it.
  const products = useProducts({}, { enabled: can(["orders", "inventory", "suppliers"]), staleTime: 5 * 60_000 });

  const data = report.data;
  const description = data
    ? `${rangeText(data)} · compared with the ${REPORT_RANGE_LABEL[data.range]} before`
    : "Sales, profit, customers and stock over time.";

  return (
    <>
      <PageHeader
        title="Reports"
        description={description}
        actions={
          <>
            <SegmentedControl<ReportRange>
              label="Report period"
              options={RANGE_OPTIONS}
              value={range}
              onChange={(value) => setRangeParam(value)}
            />
            <ExportMenu />
          </>
        }
      />
      {data ? (
        <ReportBody report={data} refreshing={report.isPlaceholderData} products={products.data} />
      ) : report.isError ? (
        <Card>
          <ErrorState
            title="Reports didn't load"
            error={report.error}
            onRetry={() => void report.refetch()}
            retrying={report.isFetching}
          />
        </Card>
      ) : (
        <ReportSkeleton />
      )}
    </>
  );
}

interface ReportBodyProps {
  report: Report;
  refreshing: boolean;
  products: Parameters<typeof unitLookup>[1];
}

function ReportBody({ report, refreshing, products }: ReportBodyProps) {
  const { can } = useAuth();
  const units = useMemo(() => unitLookup(report, products), [report, products]);
  const linkProducts = can("inventory");
  const linkCustomers = can("customers");

  return (
    <div className={styles.page}>
      <div className={styles.totals}>
        <StatStrip items={totalsItems(report)} refreshing={refreshing} />
        <p className={styles.footnote}>
          Gross profit is sales minus what the goods cost you. Net profit also takes out expenses.
        </p>
      </div>

      <SalesCard report={report} refreshing={refreshing} />

      <div className={cx(styles.grid, refreshing ? styles.refreshing : styles.settled)} aria-busy={refreshing || undefined}>
        <TopProductsCard products={report.by_product} units={units} linkProducts={linkProducts} />
        <CategoriesCard categories={report.by_category} totalSales={report.totals.sales} />
        <TopCustomersCard customers={report.customers.top} linkCustomers={linkCustomers} />
        <CustomersCard customers={report.customers} linkCustomers={linkCustomers} />
        <PaymentsCard payments={report.payments} linkPayments={can("payments")} />
        <ExpensesCard expenses={report.expenses} linkExpenses={can("expenses")} />
        <MoversCard kind="fast" products={report.inventory.fast_moving} />
        <MoversCard kind="slow" products={report.inventory.slow_moving} />
        <LowStockCard products={report.inventory.low_stock} linkProducts={linkProducts} className={styles.wide} />
      </div>
    </div>
  );
}

function totalsItems(report: Report): StatItem[] {
  const { totals, previous } = report;
  const comparison = comparisonLabel(report.range);
  const marginShare = shareText(totals.gross_profit, totals.sales);
  const topExpense = report.expenses.by_category[0];
  const hadOrders = totals.orders > 0 || previous.orders > 0;

  return [
    {
      key: "sales",
      label: "Sales",
      value: formatMoney(totals.sales),
      hint: <Trend current={totals.sales} previous={previous.sales} comparison={comparison} />,
    },
    {
      key: "orders",
      label: "Orders",
      value: formatCount(totals.orders),
      hint: <Trend current={totals.orders} previous={previous.orders} comparison={comparison} />,
    },
    {
      key: "average",
      label: "Average order",
      value: formatMoney(totals.avg_order_value),
      hint: hadOrders ? (
        <Trend
          current={totals.avg_order_value}
          previous={averageOrder(previous.sales, previous.orders)}
          comparison={comparison}
        />
      ) : (
        "No orders yet"
      ),
    },
    {
      key: "gross",
      label: "Gross profit",
      value: formatMoney(totals.gross_profit),
      tone: totals.gross_profit < 0 ? "margin" : "default",
      hint: marginShare ? `${marginShare} of sales` : "No sales yet",
    },
    {
      key: "expenses",
      label: "Expenses",
      value: formatMoney(totals.expenses),
      hint: topExpense ? `Most on ${EXPENSE_CATEGORY_LABEL[topExpense.category].toLowerCase()}` : "None recorded",
    },
    {
      key: "net",
      label: "Net profit",
      value: formatMoney(totals.net_profit),
      tone: totals.net_profit < 0 ? "margin" : "default",
      hint: totals.net_profit < 0 ? "Expenses were more than gross profit" : "Gross profit minus expenses",
    },
  ];
}

function ReportSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading reports
      </span>
      <StatStrip loading items={STAT_LABELS.map((label) => ({ key: label, label, value: "" }))} />
      <Card title="Sales">
        <Skeleton height={246} />
      </Card>
      <div className={styles.grid}>
        {["Top products", "Sales by category", "Top customers", "Customers"].map((title) => (
          <Card key={title} title={title}>
            <div className={styles.skeletonCard}>
              <SkeletonText lines={4} />
              <Skeleton width="60%" height={12} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
