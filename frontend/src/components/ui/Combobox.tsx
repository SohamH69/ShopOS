import { Search, X } from "lucide-react";
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { cx } from "../../lib/cx";
import styles from "./Combobox.module.css";
import { useFieldContext } from "./Field";
import { Input, type ControlSize } from "./Input";
import { useAnchoredPosition } from "./popover";
import { Portal } from "./Portal";
import { Spinner } from "./Skeleton";
import { assignRef, cleanId } from "./utils";

/** A row that isn't a search result, such as "Walk-in (no customer)" or "Add new customer". */
export interface ComboboxAction {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Receives the current text, e.g. to prefill a "create new" form. */
  onSelect: (query: string) => void;
}

export interface ComboboxProps<T> {
  /** The text in the field (controlled). */
  inputValue: string;
  onInputChange: (value: string) => void;
  /** Results for the current text (filter or fetch them yourself, debounced). */
  options: readonly T[];
  getOptionKey: (option: T) => string | number;
  renderOption: (option: T, state: { active: boolean }) => ReactNode;
  onSelect: (option: T) => void;
  /** Rows above the results. */
  leadingActions?: readonly ComboboxAction[];
  /** Rows below the results; the "create new" row goes here. */
  trailingActions?: readonly ComboboxAction[];
  /** Shows a spinner (results may still be the previous ones). */
  loading?: boolean;
  /** Shown when the text matches nothing. Default "No matches." */
  emptyMessage?: ReactNode;
  /** Small hint bar under the list. */
  footer?: ReactNode;
  placeholder?: string;
  /** Accessible name when not inside a Field. */
  label?: string;
  size?: ControlSize;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  /** Icon inside the field; default a search glass. Pass null for none. */
  leading?: ReactNode;
  /** Open the list on focus even before typing. Default true. */
  openOnFocus?: boolean;
  /** Keep the list open after choosing (for adding several items in a row). Default false. */
  keepOpenOnSelect?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  className?: string;
}

type Row<T> =
  | { kind: "action"; key: string; action: ComboboxAction }
  | { kind: "option"; key: string; option: T };

/**
 * ARIA combobox: a text field with a listbox of results. ↑/↓ move, Enter chooses, Esc closes the list
 * (or clears the text), Tab leaves. Focus never leaves the field (aria-activedescendant).
 */
export function Combobox<T>({
  inputValue,
  onInputChange,
  options,
  getOptionKey,
  renderOption,
  onSelect,
  leadingActions = [],
  trailingActions = [],
  loading = false,
  emptyMessage = "No matches.",
  footer,
  placeholder,
  label,
  size = "md",
  autoFocus,
  disabled,
  invalid,
  id,
  name,
  leading,
  openOnFocus = true,
  keepOpenOnSelect = false,
  inputRef,
  onKeyDown,
  onBlur,
  className,
}: ComboboxProps<T>) {
  const field = useFieldContext();
  const baseId = cleanId(useId());
  const listboxId = `combobox-${baseId}-list`;
  const optionId = (index: number) => `combobox-${baseId}-option-${index}`;
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);

  const rows: Row<T>[] = [
    ...leadingActions.map((action) => ({ kind: "action" as const, key: `action-${action.key}`, action })),
    ...options.map((option) => ({ kind: "option" as const, key: `option-${getOptionKey(option)}`, option })),
    ...trailingActions.map((action) => ({ kind: "action" as const, key: `action-${action.key}`, action })),
  ];
  const hasQuery = inputValue.trim().length > 0;
  const defaultIndex = hasQuery ? (options.length > 0 ? leadingActions.length : rows.length > 0 ? 0 : -1) : -1;

  // Re-pick the default active row whenever the text or the set of rows changes.
  const signature = `${inputValue}\u0000${rows.map((row) => row.key).join("|")}`;
  const [lastSignature, setLastSignature] = useState(signature);
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setActiveIndex(defaultIndex);
  }

  const showEmpty = !loading && hasQuery && options.length === 0;
  const popupVisible = open && !disabled && (rows.length > 0 || loading || showEmpty);
  const { style, update } = useAnchoredPosition({
    open: popupVisible,
    anchorRef,
    popoverRef: popupRef,
    matchWidth: true,
    maxHeight: 340,
  });

  // The list's height changes with its rows; re-place it (it may need to flip above the field).
  useLayoutEffect(() => {
    if (popupVisible) update();
  }, [popupVisible, rows.length, loading, update]);

  useEffect(() => {
    if (!popupVisible || activeIndex < 0) return;
    document.getElementById(`combobox-${baseId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [popupVisible, activeIndex, baseId]);

  const choose = (row: Row<T>) => {
    if (row.kind === "option") {
      onSelect(row.option);
      if (!keepOpenOnSelect) setOpen(false);
    } else {
      row.action.onSelect(inputValue);
      setOpen(false);
    }
  };

  const move = (direction: 1 | -1) => {
    if (rows.length === 0) return;
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : rows.length - 1;
      return (current + direction + rows.length) % rows.length;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        move(-1);
        break;
      case "Enter":
        if (popupVisible && activeIndex >= 0 && rows[activeIndex] && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          choose(rows[activeIndex]);
        }
        break;
      case "Escape":
        if (popupVisible) {
          event.preventDefault();
          setOpen(false);
        } else if (inputValue) {
          event.preventDefault();
          onInputChange("");
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
    onKeyDown?.(event);
  };

  const trailing = loading ? (
    <span className={styles.trailing}>
      <Spinner size={16} />
    </span>
  ) : inputValue && !disabled ? (
    <button
      type="button"
      tabIndex={-1}
      className={cx(styles.trailing, styles.clear)}
      aria-label="Clear"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onInputChange("");
        setOpen(true);
        localInputRef.current?.focus();
      }}
    >
      <X aria-hidden="true" />
    </button>
  ) : null;

  const firstOptionRow = leadingActions.length;
  const firstTrailingRow = leadingActions.length + options.length;

  return (
    <div ref={anchorRef} className={cx(styles.root, className)}>
      <Input
        ref={(node) => {
          localInputRef.current = node;
          assignRef(inputRef, node);
        }}
        id={id}
        name={name}
        size={size}
        invalid={invalid}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        type="text"
        role="combobox"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label={field ? undefined : label}
        aria-autocomplete="list"
        aria-expanded={popupVisible}
        aria-controls={popupVisible ? listboxId : undefined}
        aria-activedescendant={popupVisible && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        leading={leading === undefined ? <Search aria-hidden="true" /> : leading}
        trailing={trailing}
        value={inputValue}
        onChange={(event) => {
          onInputChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (openOnFocus) setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={(event) => {
          setOpen(false);
          onBlur?.(event);
        }}
        onKeyDown={handleKeyDown}
      />
      <p className="visually-hidden" aria-live="polite">
        {popupVisible && hasQuery
          ? loading
            ? "Searching"
            : `${options.length} ${options.length === 1 ? "result" : "results"}`
          : ""}
      </p>
      {popupVisible && (
        <Portal>
          {/* Pressing inside the list must not blur the field. */}
          <div ref={popupRef} className={styles.popup} style={style} onMouseDown={(event) => event.preventDefault()}>
            {rows.length > 0 && (
              <ul
                id={listboxId}
                role="listbox"
                aria-label={field ? undefined : label}
                aria-labelledby={field?.labelId}
                className={styles.list}
              >
                {rows.map((row, index) => {
                  const active = index === activeIndex;
                  const separate =
                    (index === firstOptionRow && leadingActions.length > 0 && options.length > 0) ||
                    (index === firstTrailingRow && trailingActions.length > 0 && index > 0);
                  return (
                    <Fragment key={row.key}>
                      {separate && <li role="presentation" className={styles.separator} />}
                      <li
                        id={optionId(index)}
                        role="option"
                        aria-selected={active}
                        className={cx(styles.option, active && styles.active, row.kind === "action" && styles.actionRow)}
                        onMouseMove={() => {
                          if (!active) setActiveIndex(index);
                        }}
                        onClick={() => choose(row)}
                      >
                        {row.kind === "option" ? (
                          renderOption(row.option, { active })
                        ) : (
                          <>
                            {row.action.icon && (
                              <span className={styles.actionIcon} aria-hidden="true">
                                {row.action.icon}
                              </span>
                            )}
                            <span>{row.action.label}</span>
                          </>
                        )}
                      </li>
                    </Fragment>
                  );
                })}
              </ul>
            )}
            {loading && options.length === 0 && (
              <p className={styles.status}>
                <Spinner size={14} /> Searching…
              </p>
            )}
            {showEmpty && <p className={styles.status}>{emptyMessage}</p>}
            {footer && <div className={styles.footer}>{footer}</div>}
          </div>
        </Portal>
      )}
    </div>
  );
}
