import { Logo } from "../brand/Logo";
import { Skeleton, Spinner } from "../ui";
import styles from "./PageLoader.module.css";

/** Whole-screen loading state while the session is checked or a public page loads. */
export function FullPageLoader({ label = "Opening ShopOS" }: { label?: string }) {
  return (
    <div className={styles.full}>
      <span className={styles.mark}>
        <Logo variant="mark" size={40} />
      </span>
      <Spinner size={18} label={label} />
    </div>
  );
}

/** Content-area placeholder while an app page's code loads (the shell stays in place). */
export function PageSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true" aria-label="Loading page">
      <div className={styles.skeletonHeader}>
        <Skeleton width={220} height={32} />
        <Skeleton width={320} height={14} />
      </div>
      <Skeleton height={96} radius={10} />
      <div className={styles.skeletonCards}>
        <div className={styles.skeletonCard}>
          <Skeleton width="40%" height={16} />
          <Skeleton height={12} />
          <Skeleton width="80%" height={12} />
          <Skeleton width="60%" height={12} />
        </div>
        <div className={styles.skeletonCard}>
          <Skeleton width="35%" height={16} />
          <Skeleton height={12} />
          <Skeleton width="70%" height={12} />
          <Skeleton width="50%" height={12} />
        </div>
      </div>
    </div>
  );
}
