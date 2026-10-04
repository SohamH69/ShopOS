import type { ReactNode } from "react";
import { cx } from "../../../lib/cx";
import styles from "./ReportsPage.module.css";

export interface Fact {
  key: string;
  label: string;
  /** Pre-formatted value, shown in the display face. */
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "margin" | "leaf";
}

/** Up to three key numbers side by side inside a card. */
export function Facts({ items, className }: { items: readonly Fact[]; className?: string }) {
  return (
    <dl className={cx(styles.facts, className)}>
      {items.map((item) => (
        <div key={item.key} className={cx(styles.fact, item.tone && item.tone !== "default" && styles[`tone_${item.tone}`])}>
          <dt className={styles.factLabel}>{item.label}</dt>
          <dd className={styles.factValue}>{item.value}</dd>
          {item.hint !== undefined && <dd className={styles.factHint}>{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
