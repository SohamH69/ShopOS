import { cx } from "../../lib/cx";
import { formatMoney, formatMoneyExact } from "../../lib/format";
import { toPaise } from "../../lib/money";
import styles from "./Small.module.css";

export type MoneyTone = "default" | "muted" | "margin" | "leaf" | "pen";

export interface MoneyProps {
  value: number | null | undefined;
  /** margin for dues, leaf for money received, muted for secondary amounts. */
  tone?: MoneyTone;
  /** Always two decimals (receipts). */
  exact?: boolean;
  /** "auto": minus for negatives · "always": +₹1,400 / −₹1,000 (ledgers) · "never": absolute value. */
  sign?: "auto" | "always" | "never";
  size?: "sm" | "md" | "lg";
  /** Headline amount in the display face (proportional figures). */
  display?: boolean;
  className?: string;
}

const MINUS = "−";

/** An amount in rupees, mono with tabular figures: "₹18,450", "₹92.50". Null shows "–". */
export function Money({ value, tone = "default", exact = false, sign = "auto", size = "md", display = false, className }: MoneyProps) {
  if (value === null || value === undefined) {
    return <span className={cx(styles.money, styles.money_muted, className)}>–</span>;
  }
  const paise = toPaise(value);
  const absolute = Math.abs(paise) / 100;
  const text = exact ? formatMoneyExact(absolute) : formatMoney(absolute);
  let prefix = "";
  if (sign !== "never" && paise < 0) prefix = MINUS;
  else if (sign === "always" && paise > 0) prefix = "+";
  return (
    <span
      className={cx(
        styles.money,
        size !== "md" && styles[`money_${size}`],
        tone !== "default" && styles[`money_${tone}`],
        display && styles.money_display,
        className,
      )}
    >
      {prefix}
      {text}
    </span>
  );
}
