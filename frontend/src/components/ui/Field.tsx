import { CircleAlert } from "lucide-react";
import { createContext, useContext, useId, useMemo, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Field.module.css";
import { cleanId, joinIds } from "./utils";

interface FieldContextValue {
  id: string;
  labelId: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** The surrounding <Field>'s ids and state, or null outside a Field. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

interface ControlPropsInput {
  id?: string;
  describedBy?: string;
  invalid?: boolean;
}

/** Merges a control's own id / aria props with those provided by an enclosing <Field>. */
export function useFieldControlProps({ id, describedBy, invalid }: ControlPropsInput) {
  const field = useContext(FieldContext);
  return {
    id: id ?? field?.id,
    describedBy: joinIds(describedBy, field?.describedBy),
    invalid: invalid ?? field?.invalid ?? false,
    ariaRequired: field?.required ? true : undefined,
    labelId: field?.labelId,
  };
}

export interface FieldProps {
  label: ReactNode;
  /** Helper text under the control (hidden while an error shows). */
  hint?: ReactNode;
  /** Error text; marks the control aria-invalid. */
  error?: ReactNode;
  /** Adds a quiet "Optional" after the label. */
  optional?: boolean;
  /** Sets aria-required on the control (no native validation bubble). */
  required?: boolean;
  /** Control id; generated when omitted. */
  id?: string;
  /** Keep the label for screen readers only. */
  labelHidden?: boolean;
  /** Right-aligned element on the label row (e.g. a small link). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint/error. Kit controls inside (Input, Textarea, Select, MoneyInput,
 * QuantityInput, Combobox, pickers) pick up the id, aria-describedby and aria-invalid automatically.
 */
export function Field({ label, hint, error, optional, required, id, labelHidden, action, className, children }: FieldProps) {
  const generated = cleanId(useId());
  const controlId = id ?? `field-${generated}`;
  const labelId = `${controlId}-label`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const hasHint = hint !== undefined && hint !== null && hint !== false && hint !== "";
  const describedBy = hasError ? errorId : hasHint ? hintId : undefined;

  const context = useMemo<FieldContextValue>(
    () => ({ id: controlId, labelId, describedBy, invalid: hasError, required: Boolean(required) }),
    [controlId, labelId, describedBy, hasError, required],
  );

  return (
    <div className={cx(styles.field, className)}>
      <div className={cx(styles.labelRow, labelHidden && "visually-hidden")}>
        <label id={labelId} htmlFor={controlId} className={styles.label}>
          {label}
          {optional && <span className={styles.optional}>Optional</span>}
        </label>
        {action}
      </div>
      <FieldContext.Provider value={context}>{children}</FieldContext.Provider>
      {hasError ? (
        <p id={errorId} className={styles.error}>
          <CircleAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hasHint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
