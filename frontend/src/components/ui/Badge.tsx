import type { ReactNode } from "react";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import type { OrderStatus, PaymentStatus } from "../../lib/types";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "pen" | "margin" | "haldi" | "leaf" | "stamp";

export interface BadgeProps {
  /** neutral (default) · pen · margin (dues, overdue) · haldi (warnings) · leaf (done) · stamp (paid only). */
  tone?: BadgeTone;
  size?: "sm" | "md";
  icon?: ReactNode;
  title?: string;
  className?: string;
  children: ReactNode;
}

/** A small tinted label: "Overdue", "Owner", "Rent". */
export function Badge({ tone = "neutral", size = "md", icon, title, className, children }: BadgeProps) {
  return (
    <span title={title} className={cx(styles.badge, styles[tone], size === "sm" && styles.sm, className)}>
      {icon}
      {children}
    </span>
  );
}

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

/** Order status as a coloured dot + word: New, Preparing, Ready, Collected, Delivered, Cancelled. */
export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  return (
    <span className={cx(styles.status, styles[`status_${status}`], className)}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.statusText}>{ORDER_STATUS_LABEL[status]}</span>
    </span>
  );
}

export interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
}

/** Payment status as a stamped mark: UNPAID, PARTIAL, PAID. Independent of the order status. */
export function PaymentStatusBadge({ status, className }: PaymentStatusBadgeProps) {
  const label = PAYMENT_STATUS_LABEL[status];
  return (
    <span title={`Payment: ${label}`} className={cx(styles.payment, styles[`payment_${status}`], className)}>
      {label}
    </span>
  );
}
