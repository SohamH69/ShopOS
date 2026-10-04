import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Small.module.css";

export interface ChipProps extends Omit<ComponentProps<"button">, "children"> {
  /** When set, the chip is a toggle (aria-pressed) and shows as selected when true. */
  selected?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

/** A small pill button for quick picks: "In 1 hour", "Full ₹658", "Repeat last order". */
export function Chip({ selected, icon, className, children, type = "button", ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={selected} className={cx(styles.chip, className)} {...rest}>
      {icon}
      <span className={styles.chipLabel}>{children}</span>
    </button>
  );
}
