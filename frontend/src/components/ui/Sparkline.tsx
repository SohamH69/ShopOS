import { cx } from "../../lib/cx";
import styles from "./Charts.module.css";

export interface SparklineProps {
  values: readonly number[];
  /** Accessible description, e.g. "Sales over the last 12 weeks, rising". */
  label: string;
  width?: number;
  height?: number;
  tone?: "pen" | "leaf" | "margin" | "ink";
  /** Soft 10% wash under the line. Default true. */
  area?: boolean;
  className?: string;
}

const TONE_COLOR: Record<NonNullable<SparklineProps["tone"]>, string> = {
  pen: "var(--pen)",
  leaf: "var(--leaf)",
  margin: "var(--margin)",
  ink: "var(--ink-3)",
};

/** A tiny trend line with an end dot (2px line, 8px dot with a paper ring). */
export function Sparkline({ values, label, width = 96, height = 28, tone = "pen", area = true, className }: SparklineProps) {
  if (values.length === 0) return null;
  const pad = 5; // room for the end dot and its ring
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  const points = values.map((value, index) => {
    const x = pad + (values.length === 1 ? innerWidth : (index / (values.length - 1)) * innerWidth);
    const y = pad + (range === 0 ? innerHeight / 2 : innerHeight - ((value - min) / range) * innerHeight);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const baseline = height - pad;
  const color = TONE_COLOR[tone];

  return (
    <svg
      role="img"
      aria-label={label}
      className={cx(styles.sparkline, className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {area && points.length > 1 && (
        <path d={`${line} L${lastX.toFixed(2)},${baseline} L${points[0][0].toFixed(2)},${baseline} Z`} fill={color} opacity={0.1} />
      )}
      {points.length > 1 && (
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
      <circle cx={lastX} cy={lastY} r={4} fill={color} stroke="var(--paper)" strokeWidth={2} />
    </svg>
  );
}
