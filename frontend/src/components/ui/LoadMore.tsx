import { formatCount } from "../../lib/format";
import { Button } from "./Button";
import styles from "./Small.module.css";

export interface LoadMoreProps {
  /** Rows shown so far. */
  shown: number;
  /** Total matching rows on the server. */
  total: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Plural noun for the count line, e.g. "orders". Default "items". */
  noun?: string;
}

/** "Showing 50 of 230 orders" with a Load more button. Renders nothing for a single short page. */
export function LoadMore({ shown, total, hasMore, loading, onLoadMore, noun = "items" }: LoadMoreProps) {
  if (!hasMore && shown <= 0) return null;
  if (!hasMore && total <= shown && shown < 20) return null;
  return (
    <div className={styles.loadMore}>
      <p className={styles.loadMoreText} aria-live="polite">
        {hasMore ? `Showing ${formatCount(shown)} of ${formatCount(total)} ${noun}` : `Showing all ${formatCount(total)} ${noun}`}
      </p>
      {hasMore && (
        <Button size="sm" loading={loading} onClick={onLoadMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
