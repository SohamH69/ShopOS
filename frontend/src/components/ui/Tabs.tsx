import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import { formatCount } from "../../lib/format";
import styles from "./Tabs.module.css";
import { cleanId } from "./utils";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Give the same id to the matching <TabPanel tabsId>. Generated when omitted. */
  id?: string;
  /** Accessible name for the tab list. */
  label?: string;
  className?: string;
}

/** Underlined tabs (tablist). Arrow keys switch tabs. Render content with <TabPanel>. */
export function Tabs<T extends string>({ tabs, value, onChange, id, label, className }: TabsProps<T>) {
  const generated = cleanId(useId());
  const baseId = id ?? `tabs-${generated}`;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = tabs.findIndex((tab) => tab.value === value);

  const activate = (index: number) => {
    const tab = tabs[index];
    if (!tab || tab.disabled) return;
    onChange(tab.value);
    buttons.current[index]?.focus();
  };

  const step = (from: number, direction: 1 | -1) => {
    const count = tabs.length;
    for (let offset = 1; offset <= count; offset += 1) {
      const index = (((from + direction * offset) % count) + count) % count;
      if (!tabs[index].disabled) {
        activate(index);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(index, 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      step(-1, 1);
    } else if (event.key === "End") {
      event.preventDefault();
      step(tabs.length, -1);
    }
  };

  return (
    <div role="tablist" aria-label={label} className={cx(styles.list, className)}>
      {tabs.map((tab, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.value}`}
            aria-controls={`${baseId}-panel-${tab.value}`}
            aria-selected={selected}
            tabIndex={selected || (selectedIndex < 0 && index === 0) ? 0 : -1}
            disabled={tab.disabled}
            className={styles.tab}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {tab.label}
            {tab.count !== undefined && <span className={styles.count}>{formatCount(tab.count)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  /** The `id` given to <Tabs>. */
  tabsId: string;
  /** This panel's tab value. */
  value: string;
  /** The currently selected tab value; the panel renders only when they match. */
  current: string;
  className?: string;
  children: ReactNode;
}

export function TabPanel({ tabsId, value, current, className, children }: TabPanelProps) {
  if (value !== current) return null;
  return (
    <div
      role="tabpanel"
      id={`${tabsId}-panel-${value}`}
      aria-labelledby={`${tabsId}-tab-${value}`}
      tabIndex={0}
      className={cx(styles.panel, className)}
    >
      {children}
    </div>
  );
}
