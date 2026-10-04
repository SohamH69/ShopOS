import { ChevronDown, Ellipsis } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "../../lib/cx";
import { Button, IconButton, type ButtonSize, type ButtonVariant } from "./Button";
import styles from "./Menu.module.css";
import { useAnchoredPosition } from "./popover";
import { Portal } from "./Portal";
import { cleanId } from "./utils";

export interface MenuItemEntry {
  type?: "item";
  key?: string;
  label: ReactNode;
  /** Text for type-ahead when the label isn't a plain string. */
  textValue?: string;
  onSelect?: () => void;
  /** In-app route. */
  to?: string;
  /** External URL (e.g. a wa.me link). */
  href?: string;
  newTab?: boolean;
  icon?: ReactNode;
  tone?: "default" | "danger";
  /** Still focusable (so the hint can be read) but does nothing. */
  disabled?: boolean;
  /** Second line, e.g. why it's disabled: "Add a phone number first". */
  hint?: ReactNode;
}

export interface MenuSeparatorEntry {
  type: "separator";
  key?: string;
}

export interface MenuLabelEntry {
  type: "label";
  key?: string;
  label: ReactNode;
}

export type MenuEntry = MenuItemEntry | MenuSeparatorEntry | MenuLabelEntry;

export interface MenuTriggerProps {
  ref: (node: HTMLButtonElement | null) => void;
  id: string;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  disabled?: boolean;
}

export interface MenuProps {
  /** Entries; falsy values are skipped so you can write `can("payments") && { … }`. */
  items: readonly (MenuEntry | false | null | undefined)[];
  /** Accessible name of the trigger and the menu, e.g. "Order actions". */
  label: string;
  /** Visible trigger text (renders a Button with a chevron). Without it, an icon button (⋯) is used. */
  triggerText?: ReactNode;
  triggerIcon?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Which trigger edge the menu lines up with. Default "end". */
  align?: "start" | "end";
  disabled?: boolean;
  /** Custom trigger; spread the props onto a <button>. */
  renderTrigger?: (props: MenuTriggerProps) => ReactNode;
  className?: string;
}

function isItem(entry: MenuEntry): entry is MenuItemEntry {
  return entry.type === undefined || entry.type === "item";
}

function textOf(entry: MenuItemEntry): string {
  return entry.textValue ?? (typeof entry.label === "string" ? entry.label : "");
}

/** Dropdown of actions: arrow keys, Home/End, type-ahead, Esc returns focus to the trigger. */
export function Menu({
  items,
  label,
  triggerText,
  triggerIcon,
  variant,
  size = "md",
  align = "end",
  disabled = false,
  renderTrigger,
  className,
}: MenuProps) {
  const entries = items.filter((entry): entry is MenuEntry => Boolean(entry));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const baseId = cleanId(useId());
  const triggerId = `menu-${baseId}-trigger`;
  const menuId = `menu-${baseId}`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const typeahead = useRef({ text: "", time: 0 });
  const { style } = useAnchoredPosition({ open, anchorRef: triggerRef, popoverRef: menuRef, align, maxHeight: 420 });

  const itemIndexes = entries.flatMap((entry, index) => (isItem(entry) ? [index] : []));

  const openMenu = (focus: "first" | "last") => {
    setOpen(true);
    setActiveIndex(focus === "first" ? (itemIndexes[0] ?? -1) : (itemIndexes[itemIndexes.length - 1] ?? -1));
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (open && activeIndex >= 0) itemRefs.current[activeIndex]?.focus({ preventScroll: true });
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const move = (direction: 1 | -1) => {
    if (itemIndexes.length === 0) return;
    const position = itemIndexes.indexOf(activeIndex);
    const next = position === -1 ? 0 : (position + direction + itemIndexes.length) % itemIndexes.length;
    setActiveIndex(itemIndexes[next]);
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(itemIndexes[0] ?? -1);
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(itemIndexes[itemIndexes.length - 1] ?? -1);
        return;
      case "Escape":
      case "Tab":
        event.preventDefault();
        close(true);
        return;
      default:
        break;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Claim the key so single-letter app shortcuts (like N for a new order) don't also fire.
      event.preventDefault();
      const now = Date.now();
      const state = typeahead.current;
      state.text = now - state.time > 700 ? event.key.toLowerCase() : state.text + event.key.toLowerCase();
      state.time = now;
      const start = Math.max(0, itemIndexes.indexOf(activeIndex));
      for (let offset = 1; offset <= itemIndexes.length; offset += 1) {
        const index = itemIndexes[(start + offset) % itemIndexes.length];
        const entry = entries[index];
        if (isItem(entry) && textOf(entry).toLowerCase().startsWith(state.text)) {
          setActiveIndex(index);
          break;
        }
      }
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    }
  };

  const triggerProps: MenuTriggerProps = {
    ref: (node) => {
      triggerRef.current = node;
    },
    id: triggerId,
    onClick: () => (open ? close(false) : openMenu("first")),
    onKeyDown: handleTriggerKeyDown,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    disabled,
  };

  let trigger: ReactNode;
  if (renderTrigger) {
    trigger = renderTrigger(triggerProps);
  } else if (triggerText !== undefined) {
    trigger = (
      <Button
        {...triggerProps}
        variant={variant ?? "secondary"}
        size={size}
        icon={triggerIcon}
        iconRight={<ChevronDown className={styles.chevron} aria-hidden="true" />}
      >
        {triggerText}
      </Button>
    );
  } else {
    trigger = (
      <IconButton
        {...triggerProps}
        label={label}
        icon={triggerIcon ?? <Ellipsis aria-hidden="true" />}
        variant={variant ?? "ghost"}
        size={size}
      />
    );
  }

  return (
    <>
      {trigger}
      {open && (
        <Portal>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            className={cx(styles.menu, className)}
            style={style}
            onKeyDown={handleMenuKeyDown}
          >
            {entries.map((entry, index) => {
              const key = entry.key ?? `entry-${index}`;
              if (entry.type === "separator") return <div key={key} role="separator" className={styles.separator} />;
              if (entry.type === "label") {
                return (
                  <div key={key} role="presentation" className={styles.groupLabel}>
                    {entry.label}
                  </div>
                );
              }
              const className = cx(styles.item, entry.tone === "danger" && styles.danger);
              const content = (
                <>
                  {entry.icon && (
                    <span className={styles.itemIcon} aria-hidden="true">
                      {entry.icon}
                    </span>
                  )}
                  <span className={styles.itemText}>
                    <span>{entry.label}</span>
                    {entry.hint && <span className={styles.itemHint}>{entry.hint}</span>}
                  </span>
                </>
              );
              const shared = {
                ref: (node: HTMLElement | null) => {
                  itemRefs.current[index] = node;
                },
                role: "menuitem",
                tabIndex: -1,
                className,
                "aria-disabled": entry.disabled || undefined,
                onMouseEnter: () => setActiveIndex(index),
              } as const;

              if (!entry.disabled && entry.to) {
                return (
                  <Link
                    key={key}
                    {...shared}
                    to={entry.to}
                    onClick={() => {
                      close(false);
                      entry.onSelect?.();
                    }}
                  >
                    {content}
                  </Link>
                );
              }
              if (!entry.disabled && entry.href) {
                return (
                  <a
                    key={key}
                    {...shared}
                    href={entry.href}
                    target={entry.newTab ? "_blank" : undefined}
                    rel={entry.newTab ? "noopener noreferrer" : undefined}
                    onClick={() => {
                      close(true);
                      entry.onSelect?.();
                    }}
                  >
                    {content}
                  </a>
                );
              }
              return (
                <button
                  key={key}
                  {...shared}
                  type="button"
                  onClick={() => {
                    if (entry.disabled) return;
                    close(true);
                    entry.onSelect?.();
                  }}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </Portal>
      )}
    </>
  );
}
