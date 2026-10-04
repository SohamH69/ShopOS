import { Check, Minus } from "lucide-react";
import { useCallback, useEffect, useId, useRef, type ChangeEvent, type ComponentProps, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Checkbox.module.css";
import { assignRef, cleanId } from "./utils";

interface ToggleBaseProps extends Omit<ComponentProps<"input">, "type" | "size"> {
  /** Visible label. Without one, pass aria-label. */
  label?: ReactNode;
  /** Secondary line under the label. */
  description?: ReactNode;
  /** Convenience alongside onChange. */
  onCheckedChange?: (checked: boolean) => void;
}

export interface CheckboxProps extends ToggleBaseProps {
  indeterminate?: boolean;
}

/** A checkbox with its label; the whole row is clickable. */
export function Checkbox({
  label,
  description,
  indeterminate = false,
  className,
  onChange,
  onCheckedChange,
  disabled,
  ref,
  ...rest
}: CheckboxProps) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const descriptionId = `check-${cleanId(useId())}-description`;
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);
    onCheckedChange?.(event.target.checked);
  };

  return (
    <label className={cx(styles.root, className)} data-disabled={disabled || undefined}>
      <input
        ref={setRef}
        type="checkbox"
        className={styles.input}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        onChange={handleChange}
        {...rest}
      />
      <span className={styles.box} aria-hidden="true">
        {indeterminate ? <Minus /> : <Check />}
      </span>
      {(label || description) && (
        <span className={styles.text}>
          {label && <span className={styles.label}>{label}</span>}
          {description && (
            <span id={descriptionId} className={styles.description}>
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}

export type SwitchProps = ToggleBaseProps;

/** An on/off switch (a checkbox with role="switch"). */
export function Switch({ label, description, className, onChange, onCheckedChange, disabled, ...rest }: SwitchProps) {
  const descriptionId = `switch-${cleanId(useId())}-description`;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);
    onCheckedChange?.(event.target.checked);
  };
  return (
    <label className={cx(styles.root, className)} data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        role="switch"
        className={cx(styles.input, styles.switchInput)}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        onChange={handleChange}
        {...rest}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {(label || description) && (
        <span className={styles.text}>
          {label && <span className={styles.label}>{label}</span>}
          {description && (
            <span id={descriptionId} className={styles.description}>
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
