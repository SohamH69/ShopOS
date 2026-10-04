import { ArrowRight } from "lucide-react";
import { stockLevel } from "../../../components/ui";
import { cx } from "../../../lib/cx";
import { formatQty } from "../../../lib/format";
import styles from "./StockChange.module.css";

export interface StockChangeProps {
  before: number;
  after: number;
  unit: string;
  /** Low-stock level: the new figure turns haldi at or below it and margin at zero. */
  min: number;
  className?: string;
}

/** "18 kg → 43 kg": stock before and after a change, with the new figure coloured by its level. */
export function StockChange({ before, after, unit, min, className }: StockChangeProps) {
  const level = stockLevel(after, min);
  const beforeText = formatQty(before, unit);
  const afterText = formatQty(after, unit);
  return (
    <span className={cx(styles.change, className)}>
      <span className="visually-hidden">
        {beforeText} now, {afterText} after
      </span>
      <span className={styles.before} aria-hidden="true">
        {beforeText}
      </span>
      <ArrowRight className={styles.arrow} aria-hidden="true" />
      <span className={cx(styles.after, styles[level])} aria-hidden="true">
        {afterText}
      </span>
    </span>
  );
}
