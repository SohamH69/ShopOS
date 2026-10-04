import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import { formatCount } from "../../lib/format";
import { useFieldContext } from "./Field";
import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Small number after the label, e.g. how many orders match. */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name, e.g. "Order status". Inside a Field the Field's label is used instead. */
  label?: string;
  size?: "sm" | "md";
  /** Stretch to full width with equal segments. */
  block?: boolean;
  disabled?: boolean;
  className?: string;
}

/** One choice from a few (a radio group): arrow keys move and select, Tab leaves the group. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  block = false,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const field = useFieldContext();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);

  const select = (index: number) => {
    const option = options[index];
    if (!option || option.disabled || disabled) return;
    onChange(option.value);
    buttons.current[index]?.focus();
  };

  const step = (from: number, direction: 1 | -1) => {
    const count = options.length;
    for (let offset = 1; offset <= count; offset += 1) {
      const index = (((from + direction * offset) % count) + count) % count;
      if (!options[index].disabled) {
        select(index);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      step(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      step(index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      step(-1, 1);
    } else if (event.key === "End") {
      event.preventDefault();
      step(options.length, -1);
    }
  };

  return (
    <div
      role="radiogroup"
      id={field?.id}
      aria-label={field ? undefined : label}
      aria-labelledby={field?.labelId}
      aria-describedby={field?.describedBy}
      aria-disabled={disabled || undefined}
      className={cx(styles.root, size === "sm" && styles.sm, block && styles.block, className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabbableIndex ? 0 : -1}
            disabled={disabled || option.disabled}
            className={styles.segment}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className={styles.label}>{option.label}</span>
            {option.count !== undefined && <span className={styles.count}>{formatCount(option.count)}</span>}
          </button>
        );
      })}
    </div>
  );
}
