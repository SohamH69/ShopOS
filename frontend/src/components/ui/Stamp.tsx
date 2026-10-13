import { useId, type CSSProperties } from "react";
import { cx } from "../../lib/cx";
import styles from "./Stamp.module.css";
import { cleanId } from "./utils";

export type StampLabel = "Paid" | "Settled" | "Collected" | "Delivered";
export type StampSize = "sm" | "md" | "lg";

export interface StampProps {
  label?: StampLabel;
  size?: StampSize;
  /** Play the stamp-in animation on mount (static under reduced motion). Remount with a new `key` to replay. */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface InkSettings {
  /** Low-frequency wobble of the whole impression (px). */
  wobble: number;
  /** Fine grain along the edges (px). */
  grain: number;
  /** Higher = fewer pin-hole voids where the pad missed. */
  voids: number;
}

// The texture scales with the stamp so it reads the same at every size.
const INK: Record<StampSize, InkSettings> = {
  sm: { wobble: 1, grain: 0.4, voids: 7.2 },
  md: { wobble: 1.6, grain: 0.55, voids: 6.7 },
  lg: { wobble: 2.2, grain: 0.7, voids: 6.6 },
};

function seedFrom(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return (hash % 89) + 3;
}

/**
 * The violet PAID stamp, ShopOS's signature. Use ONLY on: the landing hero demo, the order drawer
 * when an order becomes fully paid, receipts, and a settled customer khata.
 */
export function Stamp({ label = "Paid", size = "md", animate = false, className, style }: StampProps) {
  const filterId = `stamp-ink-${cleanId(useId())}`;
  const seed = seedFrom(filterId);
  const ink = INK[size];

  return (
    <span
      role="img"
      aria-label={label}
      className={cx(styles.stamp, styles[size], animate && styles.animate, className)}
      style={style}
    >
      <svg className={styles.defs} aria-hidden="true" focusable="false">
        <filter id={filterId} x="-12%" y="-30%" width="124%" height="160%" colorInterpolationFilters="sRGB">
          {/* A rubber stamp never lands perfectly flat: a gentle wobble, then a little grain on the edges. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={seed} result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale={ink.wobble} xChannelSelector="R" yChannelSelector="G" result="wobbled" />
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={1} seed={seed + 2} result="fibres" />
          <feDisplacementMap in="wobbled" in2="fibres" scale={ink.grain} xChannelSelector="R" yChannelSelector="G" result="inked" />
          {/* Uneven pressure: soft lighter patches across the impression. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.1" numOctaves={2} seed={seed + 14} result="pressure" />
          <feColorMatrix in="pressure" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 2.15" result="pressureAlpha" />
          {/* Pin-hole voids where the pad didn't touch. */}
          <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves={1} seed={seed + 26} result="specks" />
          <feColorMatrix
            in="specks"
            type="matrix"
            values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -9 0 0 0 ${ink.voids}`}
            result="specksAlpha"
          />
          <feComposite in="pressureAlpha" in2="specksAlpha" operator="arithmetic" k1={1} k2={0} k3={0} k4={0} result="coverage" />
          <feComposite in="inked" in2="coverage" operator="in" />
        </filter>
      </svg>
      <span className={styles.frame} style={{ filter: `url(#${filterId})` }}>
        <span className={styles.label}>{label}</span>
      </span>
    </span>
  );
}
