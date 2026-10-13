import { Lock, Navigation, Unlink } from "lucide-react";
import { Logo } from "../../components/brand/Logo";
import { ButtonLink, Card, ErrorState, Skeleton } from "../../components/ui";
import { LazyShopMap } from "../../components/map";
import { ApiError, errorMessage } from "../../lib/api";
import type { PortalShop } from "../../lib/types";
import { BalanceCardSkeleton } from "./BalanceCard";
import page from "./PortalPage.module.css";
import { shopAddress } from "./portalModel";
import { ShopSignboardSkeleton, shopDirectionsHref } from "./ShopSignboard";
import styles from "./PortalStates.module.css";

/** The small print at the foot of every khata page. */
export function PortalFooter({ privateNote = true }: { privateNote?: boolean }) {
  return (
    <footer className={page.footer}>
      {privateNote && (
        <p className={page.private}>
          <Lock aria-hidden="true" />
          <span>This page is just for you. Please don't forward the link.</span>
        </p>
      )}
      <p className={page.madeWith}>
        Khata kept with <Logo size={16} />
      </p>
    </footer>
  );
}

/** A small read-only map with directions, when the shop has pinned where it is. */
export function FindShopCard({ shop }: { shop: PortalShop }) {
  if (shop.latitude === null || shop.longitude === null) return null;
  const directions = shopDirectionsHref(shop);
  return (
    <Card title="Find the shop" description={shopAddress(shop.address, shop.city) || undefined}>
      <div className={styles.map}>
        <LazyShopMap
          latitude={shop.latitude}
          longitude={shop.longitude}
          label={`Map showing where ${shop.name} is`}
          height={180}
          interactive={false}
        />
      </div>
      {directions && (
        <ButtonLink href={directions} newTab block icon={<Navigation aria-hidden="true" />} className={styles.directions}>
          Get directions
        </ButtonLink>
      )}
    </Card>
  );
}

/** The whole page while the khata loads. */
export function PortalLoading() {
  return (
    <div className={page.page} aria-busy="true">
      <span className="visually-hidden" role="status">
        Opening your khata
      </span>
      <ShopSignboardSkeleton />
      <main className={page.main}>
        <div className={page.overlap}>
          <BalanceCardSkeleton />
        </div>
        <div className={styles.tabsSkeleton} aria-hidden="true">
          <Skeleton width="28%" height={14} />
          <Skeleton width="28%" height={14} />
          <Skeleton width="28%" height={14} />
        </div>
        <div className={styles.listSkeleton} aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className={styles.rowSkeleton}>
              <Skeleton width={28} height={28} radius={6} />
              <Skeleton width={`${55 - index * 5}%`} height={12} />
              <Skeleton width={56} height={12} style={{ marginLeft: "auto" }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export interface PortalProblemProps {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * The link can't be opened. A 404 means the link is old or was reset: say so in the API's own words,
 * with a little hanging sign. Anything else (offline, server trouble) gets a way to try again.
 */
export function PortalProblem({ error, onRetry, retrying }: PortalProblemProps) {
  const linkGone = error instanceof ApiError && error.status === 404;

  return (
    <div className={styles.problemPage}>
      <main className={styles.problem}>
        {linkGone ? (
          <>
            <div className={styles.sign} aria-hidden="true">
              <svg className={styles.strings} viewBox="0 0 160 44">
                <path d="M24 44 80 6l56 38" />
                <circle cx="80" cy="6" r="4.5" />
              </svg>
              <span className={styles.board}>
                <Unlink />
              </span>
            </div>
            <h1 className={styles.title}>This link isn't working.</h1>
            <p className={styles.text}>{errorMessage(error)}</p>
          </>
        ) : (
          <>
            <h1 className="visually-hidden">Your khata</h1>
            <div className={styles.errorCard}>
              <ErrorState title="Your khata didn't open" error={error} onRetry={onRetry} retrying={retrying} />
            </div>
          </>
        )}
      </main>
      <div className={styles.problemFooter}>
        <PortalFooter privateNote={false} />
      </div>
    </div>
  );
}
