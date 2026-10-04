import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "../../lib/cx";
import { formatChange } from "../../lib/format";
import { Skeleton } from "./Skeleton";
import styles from "./StatStrip.module.css";

export type StatTone = "default" | "margin" | "leaf" | "haldi" | "pen";

export interface StatItem {
  /** Stable key; defaults to the index. */
  key?: string;
  /** Sentence case, no colon: "Sales today". */
  label: ReactNode;
  /** Pre-formatted text such as formatMoney(x) or a count — shown in the display face. */
  value: ReactNode;
  /** Small line under the value, e.g. <Trend …/>. */
  hint?: ReactNode;
  tone?: StatTone;
  /** Makes the whole cell a link. */
  to?: string;
}

export interface StatStripProps {
  items: readonly StatItem[];
  /** Shows skeletons instead of values. */
  loading?: boolean;
  /** Dims the values while newer numbers load (keeps the frame, no flash). */
  refreshing?: boolean;
  className?: string;
}

/** A row of key numbers in one paper card divided by rules (2 columns on phones). */
export function StatStrip({ items, loading = false, refreshing = false, className }: StatStripProps) {
  const style = { "--stat-count": items.length } as CSSProperties;
  return (
    <div
      className={cx(styles.strip, refreshing && styles.refreshing, className)}
      data-count={items.length}
      style={style}
      aria-busy={loading || refreshing || undefined}
    >
      {items.map((item, index) => {
        const content = (
          <>
            <span className={styles.label}>{item.label}</span>
            {loading ? (
              <Skeleton width="60%" height={30} />
            ) : (
              <span className={cx(styles.value, item.tone && item.tone !== "default" && styles[`tone_${item.tone}`])}>
                {item.value}
              </span>
            )}
            {!loading && item.hint !== undefined && item.hint !== null && <span className={styles.hint}>{item.hint}</span>}
          </>
        );
        const key = item.key ?? String(index);
        return item.to ? (
          <Link key={key} to={item.to} className={styles.item}>
            {content}
          </Link>
        ) : (
          <div key={key} className={styles.item}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

export interface TrendProps {
  current: number;
  previous: number;
  /** Completes "vs …": "yesterday", "previous 30 days". */
  comparison: string;
  /** For costs: going down is good. */
  invert?: boolean;
  className?: string;
}

/** "↑ 12% vs yesterday" (leaf when good, margin when bad) or "Same as yesterday". */
export function Trend({ current, previous, comparison, invert = false, className }: TrendProps) {
  const change = formatChange(current, previous);
  if (change.direction === "same") {
    return <span className={cx(styles.trend, className)}>Same as {comparison}</span>;
  }
  const up = change.direction === "up";
  const good = invert ? !up : up;
  return (
    <span className={cx(styles.trend, good ? styles.good : styles.bad, className)}>
      <span className={styles.arrow} aria-hidden="true">
        {up ? "↑" : "↓"}
      </span>
      <span>
        <span className="visually-hidden">{up ? "Up" : "Down"} </span>
        {change.text ? `${change.text} ` : ""}vs {comparison}
      </span>
    </span>
  );
}
