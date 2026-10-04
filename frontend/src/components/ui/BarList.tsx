import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "../../lib/cx";
import { formatMoney } from "../../lib/format";
import styles from "./Charts.module.css";

export interface BarListItem {
  key?: string;
  label: ReactNode;
  value: number;
  /** Replaces the formatted value on the right. */
  displayValue?: ReactNode;
  /** Small line under the bar, e.g. "12 kg sold". */
  hint?: ReactNode;
  /** Makes the row a link. */
  to?: string;
}

export interface BarListProps {
  items: readonly BarListItem[];
  /** Default formatMoney. */
  formatValue?: (value: number) => string;
  /** Scale maximum; defaults to the largest value. */
  max?: number;
  /** One colour for every bar (a single series): pen (default), leaf, haldi, margin, ink. */
  tone?: "pen" | "leaf" | "haldi" | "margin" | "ink";
  /** Show only the first N items. */
  limit?: number;
  /** Shown when there are no items. */
  empty?: ReactNode;
  /** Accessible name for the list. */
  label?: string;
  className?: string;
}

/** Ranked horizontal bars: label and value on one line, a thin bar beneath. */
export function BarList({
  items,
  formatValue = formatMoney,
  max,
  tone = "pen",
  limit,
  empty = "Nothing to show yet.",
  label,
  className,
}: BarListProps) {
  const shown = limit ? items.slice(0, limit) : items;
  if (shown.length === 0) return <p className={styles.barEmpty}>{empty}</p>;
  const scale = Math.max(max ?? 0, ...shown.map((item) => item.value), 0);

  return (
    <ul aria-label={label} className={cx(styles.barList, styles[`tone_${tone}`], className)}>
      {shown.map((item, index) => {
        const percent = scale > 0 ? Math.max(0, Math.min(100, (item.value / scale) * 100)) : 0;
        const body = (
          <>
            <span className={styles.barTop}>
              <span className={styles.barLabel}>{item.label}</span>
              <span className={styles.barValue}>{item.displayValue ?? formatValue(item.value)}</span>
            </span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.fill} style={{ display: "block", width: `${percent}%`, minWidth: percent > 0 ? 2 : 0 }} />
            </span>
            {item.hint !== undefined && <span className={styles.barHint}>{item.hint}</span>}
          </>
        );
        return (
          <li key={item.key ?? index}>
            {item.to ? (
              <Link to={item.to} className={styles.barRow}>
                {body}
              </Link>
            ) : (
              <div className={styles.barRow}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
