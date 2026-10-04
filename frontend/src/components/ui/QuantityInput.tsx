import { Minus, Plus } from "lucide-react";
import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type Ref } from "react";
import { UNIT_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatQty } from "../../lib/format";
import { roundQty } from "../../lib/money";
import type { ProductUnit } from "../../lib/types";
import { useFieldControlProps } from "./Field";
import styles from "./NumberInput.module.css";
import { parseDecimal, sanitizeDecimal } from "./numberText";
import { assignRef } from "./utils";

export interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Stepper increment (see UNIT_STEP / unitStep()). Default 1. */
  step?: number;
  /** Default 0. Pass `step` for order lines so a line can't reach zero. */
  min?: number;
  max?: number;
  /** Unit code or text shown after the number ("kg", "pcs"). */
  unit?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
}

function toText(value: number): string {
  return String(roundQty(value));
}

function unitLabel(unit: string): string {
  return unit in UNIT_LABEL ? UNIT_LABEL[unit as ProductUnit] : unit;
}

/** − [ 2.5 kg ] + stepper. Decimals allowed (3 places); ↑/↓ keys step too. */
export function QuantityInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  unit,
  size = "md",
  disabled = false,
  invalid,
  id,
  name,
  autoFocus,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  className,
  onBlur,
  onKeyDown,
  inputRef,
}: QuantityInputProps) {
  const control = useFieldControlProps({ id, describedBy, invalid });
  const innerRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    if (parseDecimal(text) !== value) setText(toText(value));
  }

  const inRange = (candidate: number) => candidate >= min && (max === undefined || candidate <= max);

  const commit = (candidate: number) => {
    let next = roundQty(candidate);
    if (next < min) next = min;
    if (max !== undefined && next > max) next = max;
    setText(toText(next));
    setLastValue(next);
    if (next !== value) onChange(next);
  };

  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && (max === undefined || value < max);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" && canIncrease) {
      event.preventDefault();
      commit(value + step);
    } else if (event.key === "ArrowDown" && canDecrease) {
      event.preventDefault();
      commit(value - step);
    }
    onKeyDown?.(event);
  };

  // Keep focus in the text field when the − / + buttons are pressed.
  const keepFocus = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();

  return (
    <div
      className={cx(styles.qty, size === "sm" && styles.sm, className)}
      data-invalid={control.invalid || undefined}
      data-disabled={disabled || undefined}
    >
      <button
        type="button"
        className={styles.step}
        tabIndex={-1}
        aria-label="Decrease quantity"
        disabled={!canDecrease}
        onMouseDown={keepFocus}
        onClick={() => commit(value - step)}
      >
        <Minus aria-hidden="true" />
      </button>
      <span className={styles.value} onClick={() => innerRef.current?.focus()}>
        <input
          ref={(node) => {
            innerRef.current = node;
            assignRef(inputRef, node);
          }}
          id={control.id}
          name={name}
          className={styles.qtyInput}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          role="spinbutton"
          aria-label={ariaLabel}
          aria-describedby={control.describedBy}
          aria-invalid={control.invalid || undefined}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={formatQty(value, unit)}
          disabled={disabled}
          autoFocus={autoFocus}
          value={text}
          onChange={(event) => {
            const next = sanitizeDecimal(event.target.value, 3);
            setText(next);
            const parsed = parseDecimal(next);
            if (parsed !== null && inRange(parsed)) {
              const rounded = roundQty(parsed);
              setLastValue(rounded);
              if (rounded !== value) onChange(rounded);
            }
          }}
          onBlur={(event) => {
            const parsed = parseDecimal(text);
            setText(toText(parsed !== null && inRange(parsed) ? parsed : value));
            onBlur?.(event);
          }}
          onKeyDown={handleKeyDown}
        />
        {unit && (
          <span className={styles.unit} aria-hidden="true">
            {unitLabel(unit)}
          </span>
        )}
      </span>
      <button
        type="button"
        className={styles.step}
        tabIndex={-1}
        aria-label="Increase quantity"
        disabled={!canIncrease}
        onMouseDown={keepFocus}
        onClick={() => commit(value + step)}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}
