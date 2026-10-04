import type { CSSProperties } from "react";
import { cx } from "../../lib/cx";
import styles from "./Logo.module.css";

export interface LogoProps {
  /** "full" (default): mark + "ShopOS" wordmark. "mark": the paper slip alone. */
  variant?: "full" | "mark";
  /** Mark height in px (the wordmark scales with it). Default 28. */
  size?: number;
  className?: string;
}

/** The order slip with a torn zig-zag edge, two ink lines and a violet stamp dot. */
function LogoMark({ labelled }: { labelled: boolean }) {
  return (
    <svg
      className={styles.mark}
      viewBox="7 2.5 19.5 26.5"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? "ShopOS" : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      <path
        d="M8 6.5A3.5 3.5 0 0 1 11.5 3h9A3.5 3.5 0 0 1 24 6.5V28l-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6-2 1.6-2-1.6-2 1.6Z"
        fill="var(--pen)"
      />
      <rect x="11.5" y="8.6" width="9" height="2.1" rx="1.05" fill="#ffffff" />
      <rect x="11.5" y="13.2" width="5.6" height="2.1" rx="1.05" fill="#ffffff" />
      <circle cx="21.6" cy="21.4" r="3.5" fill="var(--stamp)" stroke="#ffffff" strokeWidth="1.6" />
    </svg>
  );
}

/** ShopOS logo. Wrap it in a Link yourself when it should navigate. */
export function Logo({ variant = "full", size = 28, className }: LogoProps) {
  const style = { "--logo-size": `${size}px` } as CSSProperties;
  if (variant === "mark") {
    return (
      <span className={cx(styles.logo, className)} style={style}>
        <LogoMark labelled />
      </span>
    );
  }
  return (
    <span className={cx(styles.logo, className)} style={style}>
      <LogoMark labelled={false} />
      <span className={styles.wordmark}>
        Shop<span className={styles.os}>OS</span>
      </span>
    </span>
  );
}
