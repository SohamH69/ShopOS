// Pure helpers that turn a Report into what the Reports page shows: chart data, labels,
// summaries and safe percentages. Kept free of React so they are easy to test.

import type { ColumnDatum } from "../../../components/ui";
import { REPORT_RANGE_LABEL } from "../../../lib/constants";
import { formatDate, formatMoney, formatNumber, formatQty, pluralize } from "../../../lib/format";
import { roundMoney } from "../../../lib/money";
import type { Product, ProductUnit, Report, ReportBucket, ReportRange, SeriesPoint } from "../../../lib/types";

export const REPORT_RANGES: readonly ReportRange[] = ["7d", "30d", "90d", "12m"];
export const DEFAULT_RANGE: ReportRange = "30d";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const BUCKET_NOUN: Readonly<Record<ReportBucket, string>> = { day: "day", week: "week", month: "month" };

/** Column header for the period in the sales table. */
export const PERIOD_HEADER: Readonly<Record<ReportBucket, string>> = {
  day: "Day",
  week: "Week starting",
  month: "Month",
};

const CADENCE: Readonly<Record<ReportBucket, string>> = {
  day: "Daily sales",
  week: "Weekly sales (Monday to Sunday)",
  month: "Monthly sales",
};

/** A `?range=` value, or the default when it is missing or unknown. */
export function parseRange(value: string | null | undefined): ReportRange {
  return REPORT_RANGES.find((range) => range === value) ?? DEFAULT_RANGE;
}

/** Completes "vs …" in trend hints: "previous 30 days". */
export function comparisonLabel(range: ReportRange): string {
  return `previous ${REPORT_RANGE_LABEL[range]}`;
}

/** "5 Sep to 4 Oct" (years only when they aren't the current one). */
export function rangeText(report: Pick<Report, "date_from" | "date_to">): string {
  return `${formatDate(report.date_from)} to ${formatDate(report.date_to)}`;
}

/**
 * Short x-axis label for a bucket. Days keep the API label ("4 Oct"); weeks use their start date
 * ("29 Sep") and months their short name ("Oct") so labels stay narrow enough to read on a phone.
 * A 12-month range never repeats a month, so the short name is unambiguous.
 */
export function axisLabel(point: Pick<SeriesPoint, "label" | "start">, bucket: ReportBucket): string {
  if (bucket === "week") return formatDate(point.start, { year: "never" });
  if (bucket === "month") return MONTHS_SHORT[Number(point.start.slice(5, 7)) - 1] ?? point.label;
  return point.label;
}

/** One column per bucket, the latest one highlighted. */
export function chartData(report: Pick<Report, "series" | "bucket">): ColumnDatum[] {
  const last = report.series.length - 1;
  return report.series.map((point, index) => ({
    key: point.start,
    label: axisLabel(point, report.bucket),
    value: point.sales,
    secondary: pluralize(point.orders, "order"),
    highlight: index === last,
  }));
}

/** The bucket with the highest sales, or null when nothing was sold. */
export function bestPoint(series: readonly SeriesPoint[]): SeriesPoint | null {
  let best: SeriesPoint | null = null;
  for (const point of series) {
    if (point.sales > 0 && (best === null || point.sales > best.sales)) best = point;
  }
  return best;
}

/** Subtitle of the sales card: "Daily sales · best: 27 Sep, ₹14,200". */
export function salesCaption(report: Pick<Report, "series" | "bucket">): string {
  const best = bestPoint(report.series);
  const cadence = CADENCE[report.bucket];
  if (!best) return cadence;
  const when = report.bucket === "week" ? `week of ${formatDate(best.start)}` : best.label;
  return `${cadence} · best: ${when}, ${formatMoney(best.sales)}`;
}

/** Accessible summary of the chart (also the caption of its hidden data table). */
export function salesSummary(report: Pick<Report, "series" | "bucket" | "range" | "totals">): string {
  const noun = BUCKET_NOUN[report.bucket];
  const sentences = [
    `Sales by ${noun}, last ${REPORT_RANGE_LABEL[report.range]}: ${formatMoney(report.totals.sales)} from ${pluralize(report.totals.orders, "order")}.`,
  ];
  const best = bestPoint(report.series);
  if (best) {
    const when = report.bucket === "week" ? `starting ${formatDate(best.start)}` : best.label;
    sentences.push(`Best ${noun}: ${when}, ${formatMoney(best.sales)}.`);
  }
  return sentences.join(" ");
}

/** `part` as a percentage of `whole`, or null when there is nothing to divide by (never NaN). */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

/** "34%", "<1%" for tiny shares, or null when the share can't be computed. */
export function shareText(part: number, whole: number): string | null {
  const percent = percentOf(part, whole);
  if (percent === null) return null;
  if (percent > 0 && percent < 1) return "<1%";
  return `${formatNumber(Math.round(percent), 0)}%`;
}

/** Average order value, 0 when there were no orders. */
export function averageOrder(sales: number, orders: number): number {
  return orders > 0 ? roundMoney(sales / orders) : 0;
}

/** Units for product ids, from the report itself plus any product list the user may read. */
export function unitLookup(
  report: Pick<Report, "inventory">,
  products: readonly Pick<Product, "id" | "unit">[] | undefined,
): Map<number, ProductUnit> {
  const units = new Map<number, ProductUnit>();
  for (const product of products ?? []) units.set(product.id, product.unit);
  for (const item of report.inventory.fast_moving) units.set(item.product_id, item.unit);
  for (const item of report.inventory.slow_moving) units.set(item.product_id, item.unit);
  for (const product of report.inventory.low_stock) units.set(product.id, product.unit);
  return units;
}

/** "12 kg", or a bare number when the unit isn't known (custom items). */
export function quantityText(quantity: number, unit: string | null | undefined): string {
  return unit ? formatQty(quantity, unit) : formatNumber(quantity, 3);
}

/** "₹340 profit" or "₹40 loss". */
export function profitText(profit: number): string {
  return profit < 0 ? `${formatMoney(-profit)} loss` : `${formatMoney(profit)} profit`;
}

/** True when the period has no sales at all (the chart then shows an empty note). */
export function hasNoSales(report: Pick<Report, "series" | "totals">): boolean {
  return report.totals.sales <= 0 && report.series.every((point) => point.sales <= 0);
}
