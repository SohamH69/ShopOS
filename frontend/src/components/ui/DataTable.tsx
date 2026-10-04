import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { cx } from "../../lib/cx";
import { useMediaQuery } from "../../lib/hooks";
import styles from "./DataTable.module.css";
import { EmptyState, ErrorState } from "./EmptyState";
import { Skeleton } from "./Skeleton";

export interface DataColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  /** CSS width, e.g. "120px" or "18%". */
  width?: string;
  /**
   * Role in the phone card: "title" (card heading — default for the first column), "aside"
   * (top-right, e.g. an amount), "meta" (label + value grid — default), or "hidden".
   */
  mobile?: "title" | "aside" | "meta" | "hidden";
  /** Label in the phone card; defaults to `header`. */
  mobileLabel?: ReactNode;
  /** Keep the header for screen readers only. */
  headerHidden?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: readonly DataColumn<T>[];
  /** Undefined while loading for the first time. */
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string | number;
  /** Makes rows clickable (and keyboard-activatable with Enter). Clicks on links/buttons inside are ignored. */
  onRowClick?: (row: T) => void;
  /** Trailing cell for per-row actions, e.g. a <Menu>. Clicks there never trigger onRowClick. */
  rowActions?: (row: T) => ReactNode;
  /** Greys out a row (e.g. cancelled orders). */
  isRowMuted?: (row: T) => boolean;
  loading?: boolean;
  /** Dims rows while newer ones load (keeps the frame, no skeleton flash). */
  refreshing?: boolean;
  /** Shows an ErrorState (with onRetry) when there are no rows to show. */
  error?: unknown;
  onRetry?: () => void;
  /** Shown when rows is an empty array — usually an <EmptyState>. */
  empty?: ReactNode;
  /** Visually hidden table caption. */
  caption?: string;
  /** "auto" (default): table from 720px up, cards below. Force one for previews. */
  layout?: "auto" | "table" | "cards";
  /** Paper frame with a rule border (default true). Use false inside a <Card padding="none">. */
  framed?: boolean;
  density?: "default" | "compact";
  /** Below the rows (e.g. a totals line or <LoadMore>). */
  footer?: ReactNode;
  skeletonRows?: number;
  className?: string;
}

const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role='button'], [role='menuitem'], [role='switch']";

function shouldIgnoreClick(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target as HTMLElement;
  const interactive = target.closest(INTERACTIVE);
  if (interactive && interactive !== event.currentTarget && event.currentTarget.contains(interactive)) return true;
  // Selecting text in a row shouldn't open it.
  return Boolean(window.getSelection()?.toString());
}

function mobileRole<T>(column: DataColumn<T>, index: number): NonNullable<DataColumn<T>["mobile"]> {
  return column.mobile ?? (index === 0 ? "title" : "meta");
}

/** Rows of records: a table on wide screens, stacked cards on phones. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowActions,
  isRowMuted,
  loading = false,
  refreshing = false,
  error,
  onRetry,
  empty,
  caption,
  layout = "auto",
  framed = true,
  density = "default",
  footer,
  skeletonRows = 5,
  className,
}: DataTableProps<T>) {
  const narrow = useMediaQuery("(max-width: 719px)");
  const asCards = layout === "cards" || (layout === "auto" && narrow);
  const showSkeleton = loading && (!rows || rows.length === 0);
  const showError = !showSkeleton && Boolean(error) && (!rows || rows.length === 0);
  const showEmpty = !showSkeleton && !showError && rows !== undefined && rows.length === 0;

  const rowHandlers = (row: T) =>
    onRowClick
      ? {
          tabIndex: 0,
          onClick: (event: MouseEvent<HTMLElement>) => {
            if (!shouldIgnoreClick(event)) onRowClick(row);
          },
          onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
              event.preventDefault();
              onRowClick(row);
            }
          },
        }
      : {};

  const stop = {
    onClick: (event: MouseEvent) => event.stopPropagation(),
    onKeyDown: (event: KeyboardEvent) => event.stopPropagation(),
  };

  let body: ReactNode;
  if (showError) {
    body = (
      <div className={styles.state}>
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    );
  } else if (showEmpty) {
    body = <div className={styles.state}>{empty ?? <EmptyState title="Nothing here yet." />}</div>;
  } else if (asCards) {
    const cardRows = showSkeleton ? [] : (rows ?? []);
    body = (
      <ul className={cx(styles.cards, !framed && styles.listed)} aria-busy={showSkeleton || refreshing || undefined}>
        {showSkeleton
          ? Array.from({ length: Math.min(skeletonRows, 4) }, (_, index) => (
              <li key={`skeleton-${index}`} className={styles.card} aria-hidden="true">
                <Skeleton width="55%" height={16} />
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <Skeleton width="80%" height={12} />
                  <Skeleton width="40%" height={12} />
                </div>
              </li>
            ))
          : cardRows.map((row, rowIndex) => {
              const title = columns.filter((column, index) => mobileRole(column, index) === "title");
              const aside = columns.filter((column, index) => mobileRole(column, index) === "aside");
              const meta = columns.filter((column, index) => mobileRole(column, index) === "meta");
              return (
                <li
                  key={rowKey(row)}
                  className={cx(styles.card, onRowClick && styles.clickable, isRowMuted?.(row) && styles.muted)}
                  {...rowHandlers(row)}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardTitle}>
                      {title.map((column) => (
                        <div key={column.key} className={column.className}>
                          {column.cell(row, rowIndex)}
                        </div>
                      ))}
                    </div>
                    {aside.length > 0 && (
                      <div className={styles.cardAside}>
                        {aside.map((column) => (
                          <div key={column.key} className={column.className}>
                            {column.cell(row, rowIndex)}
                          </div>
                        ))}
                      </div>
                    )}
                    {rowActions && (
                      <div className={styles.cardActions} {...stop}>
                        {rowActions(row)}
                      </div>
                    )}
                  </div>
                  {meta.length > 0 && (
                    <dl className={styles.cardMeta}>
                      {meta.map((column) => (
                        <div key={column.key} className={styles.metaItem}>
                          <dt>{column.mobileLabel ?? column.header}</dt>
                          <dd className={column.className}>{column.cell(row, rowIndex)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
      </ul>
    );
  } else {
    body = (
      <div className={styles.scroll}>
        <table className={cx(styles.table, density === "compact" && styles.compact)} aria-busy={showSkeleton || refreshing || undefined}>
          {caption && <caption className="visually-hidden">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cx(column.align === "right" && styles.right, column.align === "center" && styles.center)}
                >
                  {column.headerHidden ? <span className="visually-hidden">{column.header}</span> : column.header}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className={styles.actionsCell}>
                  <span className="visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {showSkeleton
              ? Array.from({ length: skeletonRows }, (_, index) => (
                  <tr key={`skeleton-${index}`} aria-hidden="true">
                    {columns.map((column, columnIndex) => (
                      <td key={column.key} className={cx(column.align === "right" && styles.right)}>
                        <Skeleton
                          width={columnIndex === 0 ? "70%" : "50%"}
                          height={12}
                          style={column.align === "right" ? { marginLeft: "auto" } : undefined}
                        />
                      </td>
                    ))}
                    {rowActions && <td className={styles.actionsCell} />}
                  </tr>
                ))
              : (rows ?? []).map((row, rowIndex) => (
                  <tr
                    key={rowKey(row)}
                    className={cx(onRowClick && styles.clickable, isRowMuted?.(row) && styles.muted)}
                    {...rowHandlers(row)}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cx(
                          column.align === "right" && styles.right,
                          column.align === "center" && styles.center,
                          column.className,
                        )}
                      >
                        {column.cell(row, rowIndex)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className={styles.actionsCell} {...stop}>
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div
      className={cx(
        styles.frame,
        framed && styles.framed,
        framed && asCards && !showError && !showEmpty && styles.asCards,
        refreshing && styles.refreshing,
        className,
      )}
    >
      {body}
      {footer && <div className={cx(framed && !asCards && styles.footer)}>{footer}</div>}
    </div>
  );
}
