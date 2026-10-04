import type { CSSProperties, ReactNode } from "react";
import { cx } from "../../lib/cx";
import { formatQty } from "../../lib/format";
import styles from "./Charts.module.css";

export interface StockMeterProps {
  stock: number;
  /** Minimum stock level (the low-stock line). */
  min: number;
  unit?: string;
  /** Text after the meter, e.g. "3 kg left · min 10". Colour follows the level. */
  label?: ReactNode;
  /** Track width in px. Default 64. */
  width?: number;
  className?: string;
}

export type StockLevel = "ok" | "low" | "out";

/** ok above the minimum, low at or below it, out at zero or less. */
export function stockLevel(stock: number, min: number): StockLevel {
  if (stock <= 0) return "out";
  if (stock <= min) return "low";
  return "ok";
}

/** A small level meter for stock: leaf when fine, haldi when low, margin when out. */
export function StockMeter({ stock, min, unit, label, width = 64, className }: StockMeterProps) {
  const level = stockLevel(stock, min);
  const capacity = min > 0 ? min * 2 : Math.max(stock, 1);
  const ratio = Math.max(0, Math.min(1, stock / capacity));
  const levelText = level === "out" ? "out of stock" : level === "low" ? `at or below the minimum of ${formatQty(min, unit)}` : "in stock";
  return (
    <span className={cx(styles.meter, styles[`meter_${level}`], className)}>
      <span
        role="meter"
        aria-label="Stock level"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={Math.max(0, stock)}
        aria-valuetext={`${formatQty(stock, unit)}, ${levelText}`}
        className={styles.meterTrack}
        style={{ "--meter-width": `${width}px` } as CSSProperties}
      >
        <span className={styles.meterFill} style={{ display: "block", width: `${ratio * 100}%` }} />
      </span>
      {label !== undefined && <span className={styles.meterLabel}>{label}</span>}
    </span>
  );
}
