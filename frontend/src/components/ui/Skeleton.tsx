import type { CSSProperties } from "react";
import { cx } from "../../lib/cx";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}

/** A quiet placeholder block while data loads. */
export function Skeleton({ width = "100%", height = 14, radius, className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.skeleton, className)}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** Several text-height skeleton lines; the last one is shorter. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <span className={cx(styles.text, className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} height={12} />
      ))}
    </span>
  );
}

export interface SpinnerProps {
  size?: number;
  /** Announced to screen readers when set; otherwise the spinner is decorative. */
  label?: string;
  className?: string;
}

/** A small rotating arc in the current text colour. */
export function Spinner({ size = 16, label, className }: SpinnerProps) {
  const svg = (
    <svg
      className={cx(styles.spinner, className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className={styles.track} cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
  if (!label) return svg;
  return (
    <span role="status" style={{ display: "inline-flex", alignItems: "center" }}>
      {svg}
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
