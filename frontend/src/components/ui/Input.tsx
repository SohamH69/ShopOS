import { ChevronDown } from "lucide-react";
import { useCallback, useRef, type ChangeEvent, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import { useFieldControlProps } from "./Field";
import styles from "./Input.module.css";
import { assignRef } from "./utils";

export type ControlSize = "sm" | "md" | "lg";

function sizeClass(size: ControlSize): string | false {
  return size !== "md" && styles[size];
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface InputProps extends Omit<ComponentProps<"input">, "size"> {
  size?: ControlSize;
  /** Marks the control invalid (a surrounding Field with `error` does this for you). */
  invalid?: boolean;
  /** Element inside the box before the text, e.g. an icon or "₹". */
  leading?: ReactNode;
  /** Element inside the box after the text, e.g. a unit or a clear button. */
  trailing?: ReactNode;
  /** Class for the outer box (only rendered when leading/trailing is used). */
  wrapperClassName?: string;
}

/** Text input. Inside a <Field> it is labelled and described automatically. */
export function Input({
  size = "md",
  invalid,
  leading,
  trailing,
  className,
  wrapperClassName,
  id,
  "aria-describedby": describedBy,
  ref,
  ...rest
}: InputProps) {
  const control = useFieldControlProps({ id, describedBy, invalid });
  const innerRef = useRef<HTMLInputElement | null>(null);
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  const shared = {
    id: control.id,
    "aria-describedby": control.describedBy,
    "aria-invalid": control.invalid || undefined,
    "aria-required": rest["aria-required"] ?? control.ariaRequired,
  };

  if (leading == null && trailing == null) {
    return (
      <input ref={setRef} className={cx(styles.control, sizeClass(size), className)} {...shared} {...rest} />
    );
  }

  // Clicking the box (or a non-interactive adornment) focuses the text field.
  const focusInput = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target === innerRef.current || target.closest("button, a, input, select, textarea")) return;
    event.preventDefault();
    innerRef.current?.focus();
  };

  return (
    <div
      className={cx(styles.group, sizeClass(size), wrapperClassName)}
      data-invalid={control.invalid || undefined}
      data-disabled={rest.disabled || undefined}
      onMouseDown={focusInput}
    >
      {leading != null && <span className={cx(styles.adornment, styles.leading)}>{leading}</span>}
      <input
        ref={setRef}
        className={cx(
          styles.bare,
          leading != null && styles.bareAfterLeading,
          trailing != null && styles.bareBeforeTrailing,
          className,
        )}
        {...shared}
        {...rest}
      />
      {trailing != null && <span className={cx(styles.adornment, styles.trailing)}>{trailing}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------

export interface TextareaProps extends ComponentProps<"textarea"> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, id, "aria-describedby": describedBy, rows = 3, ...rest }: TextareaProps) {
  const control = useFieldControlProps({ id, describedBy, invalid });
  return (
    <textarea
      id={control.id}
      rows={rows}
      aria-describedby={control.describedBy}
      aria-invalid={control.invalid || undefined}
      aria-required={rest["aria-required"] ?? control.ariaRequired}
      className={cx(styles.control, styles.textarea, className)}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Select (native)
// ---------------------------------------------------------------------------

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> extends Omit<ComponentProps<"select">, "size" | "value"> {
  value?: T | "";
  size?: ControlSize;
  invalid?: boolean;
  options?: readonly SelectOption<T>[];
  /** A first, empty option such as "Any payment". Selecting it gives "". */
  placeholder?: string;
  /** Typed convenience alongside onChange. */
  onValueChange?: (value: T) => void;
  wrapperClassName?: string;
}

/** Native select with the kit's look. Pass `options` or <option> children. */
export function Select<T extends string = string>({
  size = "md",
  invalid,
  options,
  placeholder,
  onValueChange,
  onChange,
  className,
  wrapperClassName,
  id,
  "aria-describedby": describedBy,
  value,
  children,
  ...rest
}: SelectProps<T>) {
  const control = useFieldControlProps({ id, describedBy, invalid });
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event);
    onValueChange?.(event.target.value as T);
  };
  return (
    <div className={cx(styles.selectWrap, wrapperClassName)}>
      <select
        id={control.id}
        aria-describedby={control.describedBy}
        aria-invalid={control.invalid || undefined}
        aria-required={rest["aria-required"] ?? control.ariaRequired}
        className={cx(
          styles.control,
          styles.select,
          sizeClass(size),
          placeholder !== undefined && value === "" && styles.placeholder,
          className,
        )}
        value={value}
        onChange={handleChange}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown className={styles.chevron} aria-hidden="true" />
    </div>
  );
}
