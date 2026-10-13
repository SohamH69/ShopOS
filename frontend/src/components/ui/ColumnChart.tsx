import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "../../lib/cx";
import { formatMoney, formatMoneyCompact } from "../../lib/format";
import { useElementSize } from "../../lib/hooks";
import styles from "./Charts.module.css";
import { cleanId } from "./utils";

export interface ColumnDatum {
  key?: string;
  /** Category / period label under the column ("4 Oct", "Week of 29 Sep"). */
  label: string;
  value: number;
  /** Extra tooltip text, e.g. "32 orders". */
  secondary?: string;
  /** Draw in pen (e.g. today / the latest bucket); others are pen-tint. */
  highlight?: boolean;
}

export interface ColumnChartProps {
  data: readonly ColumnDatum[];
  /** Accessible summary, also the caption of the hidden data table: "Sales, last 7 days". */
  label: string;
  /** Plot height in px, excluding the x-axis labels (they get their own band). Default 160. */
  height?: number;
  /** Tooltip and table values. Default formatMoney. */
  formatValue?: (value: number) => string;
  /** Y-axis tick labels. Default formatMoneyCompact. */
  formatAxis?: (value: number) => string;
  /** Gridlines and y-axis labels. Default true. */
  showAxis?: boolean;
  /** Keeps the previous render dimmed while new data loads. */
  refreshing?: boolean;
  /** Column headers for the hidden table. */
  periodLabel?: string;
  valueLabel?: string;
  className?: string;
}

const TOP_PAD = 8;
const X_AXIS_BAND = 26;
const Y_AXIS_WIDTH = 52;
const MAX_COLUMN = 24;
const RADIUS = 4;

function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/** Clean y-axis ticks from 0 up to just past `maxValue` (about `count` steps). */
export function niceTicks(maxValue: number, count = 3): number[] {
  if (!(maxValue > 0)) return [0];
  const step = niceStep(maxValue / count);
  const top = Math.ceil(maxValue / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(Number(tick.toPrecision(12)));
  return ticks;
}

// Rounded 4px data-end at the top, square at the baseline.
function columnPath(x: number, y: number, width: number, baseline: number): string {
  const height = baseline - y;
  if (height <= 0.5) return "";
  const r = Math.min(RADIUS, width / 2, height);
  return `M${x},${baseline}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${y + r}V${baseline}Z`;
}

/**
 * Single-series column chart in hand-rolled SVG. Hover or focus (then ←/→) shows a tooltip;
 * a visually hidden table carries every value for screen readers.
 */
export function ColumnChart({
  data,
  label,
  height = 160,
  formatValue = formatMoney,
  formatAxis = formatMoneyCompact,
  showAxis = true,
  refreshing = false,
  periodLabel = "Period",
  valueLabel = "Value",
  className,
}: ColumnChartProps) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const liveId = `chart-${cleanId(useId())}-live`;

  const count = data.length;
  const maxValue = Math.max(0, ...data.map((datum) => datum.value));
  const ticks = showAxis ? niceTicks(maxValue) : [0];
  const scaleTop = showAxis ? ticks[ticks.length - 1] : maxValue;
  const axisWidth = showAxis ? Y_AXIS_WIDTH : 0;
  const plotWidth = Math.max(0, width - axisWidth);
  const baseline = TOP_PAD + height;
  const band = count > 0 ? plotWidth / count : 0;
  const columnWidth = Math.max(2, Math.min(MAX_COLUMN, band * 0.62));
  const totalHeight = baseline + X_AXIS_BAND;
  const yFor = (value: number) => (scaleTop > 0 ? baseline - (Math.max(0, value) / scaleTop) * height : baseline);
  const centerX = (index: number) => axisWidth + index * band + band / 2;

  // Thin x labels so they never collide; always keep the latest one.
  const longestLabel = Math.max(1, ...data.map((datum) => datum.label.length));
  const labelEvery = band > 0 ? Math.max(1, Math.ceil((longestLabel * 6.6 + 12) / band)) : 1;
  const showsLabel = (index: number) => (count - 1 - index) % labelEvery === 0;

  const highlighted = data.findIndex((datum) => datum.highlight);
  const activeDatum = active !== null ? data[active] : undefined;

  const describe = (datum: { label: string; value: number; secondary?: string }) =>
    `${datum.label}: ${formatValue(datum.value)}${datum.secondary ? `, ${datum.secondary}` : ""}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const current = active ?? (highlighted >= 0 ? highlighted : count - 1);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActive(Math.min(count - 1, current + (active === null ? 0 : 1)));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActive(Math.max(0, current - (active === null ? 0 : 1)));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(count - 1);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    // Touch pointers "leave" right after lifting; keep the tooltip until focus moves away.
    if (event.pointerType === "mouse") setActive(null);
  };

  const tooltipLeft = active !== null ? Math.max(56, Math.min(width - 56, centerX(active))) : 0;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      aria-describedby={liveId}
      tabIndex={count > 0 ? 0 : -1}
      className={cx(styles.chart, refreshing && styles.refreshing, className)}
      style={{ height: totalHeight }}
      onKeyDown={handleKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget && active === null && count > 0) {
          setActive(highlighted >= 0 ? highlighted : count - 1);
        }
      }}
      onBlur={() => setActive(null)}
      onPointerLeave={handlePointerLeave}
    >
      {width > 0 && (
        <svg className={styles.svg} width={width} height={totalHeight} aria-hidden="true" focusable="false">
          {showAxis
            ? ticks.map((tick) => {
                const y = Math.round(yFor(tick)) + 0.5;
                return (
                  <g key={tick}>
                    <line className={tick === 0 ? styles.baseline : styles.grid} x1={axisWidth} x2={width} y1={y} y2={y} />
                    <text className={styles.axisLabel} x={axisWidth - 10} y={y} dy="0.32em" textAnchor="end">
                      {formatAxis(tick)}
                    </text>
                  </g>
                );
              })
            : (
                <line className={styles.baseline} x1={0} x2={width} y1={baseline + 0.5} y2={baseline + 0.5} />
              )}
          {data.map((datum, index) => {
            const x = axisWidth + index * band + (band - columnWidth) / 2;
            return (
              <path
                key={datum.key ?? `${datum.label}-${index}`}
                className={cx(styles.column, datum.highlight && styles.columnHighlight, active === index && styles.columnActive)}
                d={columnPath(x, yFor(datum.value), columnWidth, baseline)}
              />
            );
          })}
          {data.map((datum, index) =>
            showsLabel(index) ? (
              <text
                key={`label-${datum.key ?? index}`}
                className={cx(styles.xLabel, (active === index || datum.highlight) && styles.xLabelActive)}
                x={centerX(index)}
                y={baseline + 18}
                textAnchor="middle"
              >
                {datum.label}
              </text>
            ) : null,
          )}
          {data.map((datum, index) => (
            <rect
              key={`hit-${datum.key ?? index}`}
              className={styles.hit}
              x={axisWidth + index * band}
              y={0}
              width={band}
              height={baseline}
              onPointerEnter={() => setActive(index)}
              onPointerDown={() => setActive(index)}
            />
          ))}
        </svg>
      )}

      {activeDatum && active !== null && width > 0 && (
        <div className={styles.tooltip} style={{ left: tooltipLeft, top: Math.max(yFor(activeDatum.value), 30) }}>
          <span className={styles.tooltipValue}>{formatValue(activeDatum.value)}</span>
          <span className={styles.tooltipLabel}>
            {activeDatum.label}
            {activeDatum.secondary ? ` · ${activeDatum.secondary}` : ""}
          </span>
        </div>
      )}

      <p id={liveId} className="visually-hidden" aria-live="polite">
        {activeDatum ? describe(activeDatum) : ""}
      </p>

      {/* A table ignores the 1px box, so a wrapper clips it; screen readers still get the table. */}
      <div className="visually-hidden">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{periodLabel}</th>
              <th scope="col">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum, index) => (
              <tr key={`row-${datum.key ?? index}`}>
                <th scope="row">{datum.label}</th>
                <td>
                  {formatValue(datum.value)}
                  {datum.secondary ? ` (${datum.secondary})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
