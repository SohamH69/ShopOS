import { useState, type FocusEvent } from "react";
import { cx } from "../../lib/cx";
import { roundMoney } from "../../lib/money";
import { Input, type InputProps } from "./Input";
import styles from "./NumberInput.module.css";
import { parseDecimal, sanitizeDecimal } from "./numberText";

export interface MoneyInputProps
  extends Omit<
    InputProps,
    "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "leading" | "min" | "max" | "step"
  > {
  /** Rupees, or null when empty. */
  value: number | null;
  /** Called with rupees rounded to the paise, or null when cleared. */
  onChange: (value: number | null) => void;
}

function toText(value: number | null): string {
  return value == null ? "" : String(roundMoney(value));
}

function toValue(text: string): number | null {
  const parsed = parseDecimal(text);
  return parsed == null ? null : roundMoney(parsed);
}

/** Rupee amount field: "₹" prefix, decimal keyboard on phones, at most 2 decimals. */
export function MoneyInput({ value, onChange, onBlur, placeholder = "0", className, ...rest }: MoneyInputProps) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  // The parent changed the value (e.g. a "Full ₹658" chip): show it unless the text already means it.
  if (value !== lastValue) {
    setLastValue(value);
    if (toValue(text) !== value) setText(toText(value));
  }

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      className={cx(styles.amount, className)}
      leading={<span className={styles.rupee}>₹</span>}
      value={text}
      onChange={(event) => {
        const next = sanitizeDecimal(event.target.value, 2);
        const parsed = toValue(next);
        setText(next);
        setLastValue(parsed);
        onChange(parsed);
      }}
      onBlur={(event: FocusEvent<HTMLInputElement>) => {
        setText(toText(toValue(text)));
        onBlur?.(event);
      }}
    />
  );
}
