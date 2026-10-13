import type { CSSProperties } from "react";
import { cx } from "../../lib/cx";
import styles from "./Logo.module.css";

export interface LogoProps {
  /** "full" (default): mark + "ShopOS" wordmark. "mark": the shopfront alone. */
  variant?: "full" | "mark";
  /** "light" (default) for light surfaces; "dark" for the night sidebar and other dark panels. */
  tone?: "light" | "dark";
  /** Mark height in px (the wordmark scales with it). Default 28. */
  size?: number;
  className?: string;
}

/** A shopfront: a peacock tile, a scalloped marigold awning and the open counter beneath it. */
export function LogoMark({ labelled = false }: { labelled?: boolean }) {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 32 32"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? "ShopOS" : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path
        d="M6 9.5A2.5 2.5 0 0 1 8.5 7h15A2.5 2.5 0 0 1 26 9.5V13a2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-5 0Z"
        fill="var(--accent)"
      />
      <rect x="9" y="18" width="14" height="7.5" rx="2" fill="#ffffff" />
      <rect x="14.25" y="18" width="3.5" height="7.5" fill="var(--brand-tint-2)" />
    </svg>
  );
}

/** ShopOS logo. Wrap it in a Link yourself when it should navigate. */
export function Logo({ variant = "full", tone = "light", size = 28, className }: LogoProps) {
  const style = { "--logo-size": `${size}px` } as CSSProperties;
  const classes = cx(styles.logo, tone === "dark" && styles.dark, className);
  if (variant === "mark") {
    return (
      <span className={classes} style={style}>
        <LogoMark labelled />
      </span>
    );
  }
  return (
    <span className={classes} style={style}>
      <LogoMark />
      <span className={styles.wordmark}>
        Shop<span className={styles.os}>OS</span>
      </span>
    </span>
  );
}
