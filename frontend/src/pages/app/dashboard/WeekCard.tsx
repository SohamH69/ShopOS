import { useMemo, type ReactNode } from "react";
import { Card, ColumnChart, EmptyState, Skeleton, type ColumnDatum } from "../../../components/ui";
import { formatDate, formatMoney, pluralize } from "../../../lib/format";
import { sumMoney } from "../../../lib/money";
import type { DailyPoint } from "../../../lib/types";
import styles from "./WeekCard.module.css";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-04" → "Sun". Pure calendar arithmetic, so the device's time zone can't shift the day. */
function weekdayShort(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? isoDate;
}

export interface WeekCardProps {
  /** Exactly 7 days, oldest first, ending today; undefined while loading. */
  points: readonly DailyPoint[] | undefined;
  /** Today's date (IST), highlighted in the chart. */
  today: string | undefined;
  className?: string;
}

/** Sales for the last 7 days: one column per day, today in pen. */
export function WeekCard({ points, today, className }: WeekCardProps) {
  const data = useMemo<ColumnDatum[]>(
    () =>
      (points ?? []).map((point) => ({
        key: point.date,
        label: weekdayShort(point.date),
        value: point.sales,
        secondary: `${point.date === today ? "Today" : formatDate(point.date)} · ${pluralize(point.orders, "order")}`,
        highlight: point.date === today,
      })),
    [points, today],
  );

  const total = points ? sumMoney(points.map((point) => point.sales)) : 0;
  const orders = points ? points.reduce((sum, point) => sum + point.orders, 0) : 0;

  let body: ReactNode;
  if (!points) {
    body = (
      <div aria-hidden="true" className={styles.loading}>
        <Skeleton width={140} height={30} />
        <Skeleton height={186} radius={6} />
      </div>
    );
  } else if (total === 0) {
    body = (
      <EmptyState compact title="No sales in the last 7 days." description="Each day's sales show up here as you take orders." />
    );
  } else {
    body = (
      <>
        <p className={styles.summary}>
          <span className={styles.total}>{formatMoney(total)}</span>
          <span className={styles.meta}>
            {pluralize(orders, "order")} · about {formatMoney(Math.round(total / points.length))} a day
          </span>
        </p>
        <ColumnChart data={data} label="Sales, last 7 days" height={160} periodLabel="Day" valueLabel="Sales" />
      </>
    );
  }

  return (
    <Card className={className} title="This week" description="Sales in the last 7 days">
      {body}
    </Card>
  );
}
