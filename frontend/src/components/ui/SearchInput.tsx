import { Search, X } from "lucide-react";
import { useCallback, useRef, type KeyboardEvent } from "react";
import { useFieldContext } from "./Field";
import { Input, type InputProps } from "./Input";
import styles from "./SearchInput.module.css";
import { assignRef } from "./utils";

export interface SearchInputProps extends Omit<InputProps, "value" | "onChange" | "type" | "leading" | "trailing"> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Search box with a clear button; Esc clears it. Debounce the value yourself
 * (useDebouncedValue) before querying. Outside a Field, the placeholder doubles as its label.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  onKeyDown,
  "aria-label": ariaLabel,
  ref,
  ...rest
}: SearchInputProps) {
  const field = useFieldContext();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && value) {
      // Clear first; a second Esc can close whatever the search lives in.
      event.preventDefault();
      event.stopPropagation();
      onChange("");
    }
    onKeyDown?.(event);
  };

  return (
    <Input
      {...rest}
      ref={setRef}
      type="search"
      enterKeyHint="search"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      aria-label={ariaLabel ?? (field ? undefined : placeholder)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      leading={<Search aria-hidden="true" />}
      trailing={
        value ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        ) : null
      }
    />
  );
}
