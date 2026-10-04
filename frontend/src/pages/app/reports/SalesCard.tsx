import { useMemo, useState } from "react";
import { Card, ColumnChart, SegmentedControl } from "../../../components/ui";
import { cx } from "../../../lib/cx";
import { formatCount, formatMoney } from "../../../lib/format";
import { MEDIA, useMediaQuery } from "../../../lib/hooks";
import type { Report } from "../../../lib/types";
import { chartData, hasNoSales, PERIOD_HEADER, salesCaption, salesSummary } from "./reportData";
import styles from "./ReportsPage.module.css";

type SalesView = "chart" | "table";

const VIEW_OPTIONS = [
  { value: "chart", label: "Chart" },
  { value: "table", label: "Table" },
] as const satisfies readonly { value: SalesView; label: string }[];

export interface SalesCardProps {
  report: Report;
  /** The report is from the previous range while the new one loads. */
  refreshing: boolean;
}

/**
 * Sales per bucket as a column chart (latest bucket in pen), with a table view of the same
 * numbers: the pale columns are low-contrast by design, so every value is also readable as text.
 */
export function SalesCard({ report, refreshing }: SalesCardProps) {
  const [view, setView] = useState<SalesView>("chart");
  const phone = useMediaQuery(MEDIA.mobile);
  const data = useMemo(() => chartData(report), [report]);
  const empty = hasNoSales(report);

  return (
    <Card
      title="Sales"
      description={salesCaption(report)}
      actions={
        <SegmentedControl size="sm" label="Show sales as" options={VIEW_OPTIONS} value={view} onChange={setView} />
      }
    >
      {view === "chart" ? (
        <div className={styles.chartWrap}>
          <ColumnChart
            data={data}
            label={salesSummary(report)}
            height={phone ? 160 : 220}
            refreshing={refreshing}
            periodLabel={PERIOD_HEADER[report.bucket]}
            valueLabel="Sales"
          />
          {empty && <p className={styles.chartEmpty}>No sales in this period yet. New orders show up here.</p>}
        </div>
      ) : (
        <SalesTable report={report} refreshing={refreshing} />
      )}
    </Card>
  );
}

function SalesTable({ report, refreshing }: SalesCardProps) {
  // Newest first, like a day book.
  const rows = useMemo(() => [...report.series].reverse(), [report.series]);
  return (
    <div className={cx(styles.tableScroll, refreshing ? styles.refreshing : styles.settled)}>
      <table className={styles.dataTable}>
        <caption className="visually-hidden">{salesSummary(report)}</caption>
        <thead>
          <tr>
            <th scope="col">{PERIOD_HEADER[report.bucket]}</th>
            <th scope="col" className={styles.numCell}>
              Orders
            </th>
            <th scope="col" className={styles.numCell}>
              Sales
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((point) => (
            <tr key={point.start}>
              <th scope="row">{point.label}</th>
              <td className={cx(styles.numCell, point.orders === 0 && styles.zero)}>{formatCount(point.orders)}</td>
              <td className={cx(styles.numCell, point.sales === 0 && styles.zero)}>{formatMoney(point.sales)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className={styles.numCell}>{formatCount(report.totals.orders)}</td>
            <td className={styles.numCell}>{formatMoney(report.totals.sales)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
