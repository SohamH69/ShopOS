import { Fragment, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Small.module.css";

export interface DescriptionItem {
  key?: string;
  label: ReactNode;
  value: ReactNode;
}

export interface DescriptionListProps {
  items: readonly DescriptionItem[];
  /** Label above value instead of side by side (narrow spaces). */
  stacked?: boolean;
  className?: string;
}

/** Label / value pairs for detail panels: "Due time · 6:30 pm", "Created by · Arjun". */
export function DescriptionList({ items, stacked = false, className }: DescriptionListProps) {
  return (
    <dl className={cx(styles.dl, stacked && styles.dlStacked, className)}>
      {items.map((item, index) => (
        <Fragment key={item.key ?? index}>
          <dt className={styles.dt}>{item.label}</dt>
          <dd className={styles.dd}>{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
