import { CalendarDays, Check, ChevronLeft, Clock, Copy, ExternalLink, MapPin, ShieldOff, Store } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { directionsUrl, LazyShopMap } from "../../components/map";
import {
  Button,
  ButtonLink,
  Card,
  DescriptionList,
  ErrorState,
  Skeleton,
  StatStrip,
  type DescriptionItem,
} from "../../components/ui";
import { isApiError } from "../../lib/api";
import { cx } from "../../lib/cx";
import { formatCount, formatDate, formatDateTime, formatMoney, formatPhone, formatRelative, telHref } from "../../lib/format";
import { useCopyToClipboard, useDocumentTitle } from "../../lib/hooks";
import { useAdminShop } from "../../lib/queries";
import type { AdminShopDetail } from "../../lib/types";
import { PlanBadge, ShopPhoto, ShopStatusBadges } from "./adminBits";
import styles from "./AdminShopPage.module.css";
import { AccessCard, PlanCard, ReactivateDialog, SuspendModal } from "./ShopAdminActions";
import { HistoryCard, PeopleCard } from "./ShopRecords";

function BackLink() {
  return (
    <Link to="/admin" className={styles.back}>
      <ChevronLeft aria-hidden="true" />
      All shops
    </Link>
  );
}

/** One shop, as the ShopOS team sees it: who runs it, how it's doing, and the admin switches. */
export default function AdminShopPage() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const validId = Number.isInteger(id) && id > 0;
  const query = useAdminShop(validId ? id : undefined);
  const shop = query.data;
  useDocumentTitle(shop ? `${shop.name} · Admin` : "Shop · Admin");

  if (!validId || (query.isError && !shop)) {
    const notFound = !validId || (isApiError(query.error) && query.error.status === 404);
    return (
      <>
        <BackLink />
        <Card className={styles.stateCard}>
          <ErrorState
            title={notFound ? "Shop not found" : "This shop didn't load"}
            error={notFound ? undefined : query.error}
            description={notFound ? "It may have been removed, or the link is wrong." : undefined}
            onRetry={notFound ? undefined : () => void query.refetch()}
            retrying={query.isFetching}
          />
        </Card>
      </>
    );
  }

  if (!shop) return <ShopSkeleton />;
  return <ShopDetail shop={shop} refreshing={query.isFetching} />;
}

type DialogKind = "suspend" | "reactivate";

function ShopDetail({ shop, refreshing }: { shop: AdminShopDetail; refreshing: boolean }) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  // A new key on every open gives each dialog a fresh form; it stays put while closing so the exit animates.
  const [keys, setKeys] = useState<Record<DialogKind, number>>({ suspend: 0, reactivate: 0 });
  const open = (kind: DialogKind) => {
    setKeys((current) => ({ ...current, [kind]: current[kind] + 1 }));
    setDialog(kind);
  };
  const close = () => setDialog(null);

  // The button that opened a dialog may be gone once the shop changes (e.g. the suspended notice):
  // when the dialog has closed and the new state has arrived, focus the Access card's button.
  const accessButtonRef = useRef<HTMLButtonElement>(null);
  const focusWhenSuspendedIs = useRef<boolean | null>(null);
  const done = (updated: AdminShopDetail) => {
    focusWhenSuspendedIs.current = updated.is_suspended;
    close();
  };
  useEffect(() => {
    if (dialog !== null || focusWhenSuspendedIs.current !== shop.is_suspended) return;
    focusWhenSuspendedIs.current = null;
    window.requestAnimationFrame(() => accessButtonRef.current?.focus());
  }, [dialog, shop.is_suspended]);

  return (
    <>
      <BackLink />

      <div className={styles.page}>
        <Signboard shop={shop} />

        {shop.is_suspended && (
          <div className={styles.suspended} role="status">
            <ShieldOff aria-hidden="true" className={styles.suspendedIcon} />
            <div className={styles.suspendedText}>
              <p className={styles.suspendedTitle}>
                Suspended{shop.suspended_at ? ` on ${formatDateTime(shop.suspended_at)}` : ""}
              </p>
              {shop.suspended_reason && <p className={styles.suspendedReason}>“{shop.suspended_reason}”</p>}
              <p className={styles.suspendedHelp}>No one at this shop can sign in, and its customers' khata links are off.</p>
            </div>
            <Button size="sm" onClick={() => open("reactivate")} className={styles.suspendedAction}>
              Reactivate
            </Button>
          </div>
        )}

        <StatStrip
          refreshing={refreshing}
          items={[
            { key: "sales", label: "Sales, last 30 days", value: formatMoney(shop.totals.sales_30d) },
            { key: "orders", label: "Orders, last 30 days", value: formatCount(shop.totals.orders_30d) },
            {
              key: "dues",
              label: "Dues outstanding",
              value: formatMoney(shop.totals.outstanding),
              tone: shop.totals.outstanding > 0 ? "margin" : "default",
            },
            { key: "customers", label: "Customers", value: formatCount(shop.customers_count) },
            { key: "products", label: "Products", value: formatCount(shop.totals.products) },
            { key: "staff", label: "Staff", value: formatCount(shop.totals.staff), hint: "Besides the owner" },
          ]}
        />

        <div className={styles.layout}>
          <div className={styles.main}>
            <ContactCard shop={shop} className={styles.areaContact} />
            <PeopleCard shop={shop} className={styles.areaPeople} />
            <HistoryCard shop={shop} className={styles.areaHistory} />
          </div>
          <div className={styles.side}>
            <AccessCard
              shop={shop}
              buttonRef={accessButtonRef}
              className={styles.areaAccess}
              onSuspend={() => open("suspend")}
              onReactivate={() => open("reactivate")}
            />
            <PlanCard shop={shop} className={styles.areaPlan} />
          </div>
        </div>
      </div>

      <SuspendModal key={`suspend-${keys.suspend}`} shop={shop} open={dialog === "suspend"} onClose={close} onDone={done} />
      <ReactivateDialog
        key={`reactivate-${keys.reactivate}`}
        shop={shop}
        open={dialog === "reactivate"}
        onClose={close}
        onDone={done}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// The signboard: photo, the shop's name painted on, plan and status
// ---------------------------------------------------------------------------

function Signboard({ shop }: { shop: AdminShopDetail }) {
  const { copy, copied } = useCopyToClipboard();
  const hasPhoto = Boolean(shop.photo_url);
  return (
    <section className={styles.board} aria-labelledby="shop-name">
      <span className={styles.awning} aria-hidden="true" />
      <div className={styles.boardBody}>
        <div className={cx(styles.photoFrame, !hasPhoto && styles.photoFrameEmpty)}>
          {hasPhoto ? (
            <ShopPhoto url={shop.photo_url} size="lg" className={styles.boardPhoto} />
          ) : (
            <span className={styles.noPhoto}>
              <Store aria-hidden="true" />
              No shop photo yet
            </span>
          )}
        </div>
        <div className={styles.boardText}>
          <div className={styles.boardBadges}>
            <PlanBadge plan={shop.plan} />
            <ShopStatusBadges shop={shop} />
          </div>
          <h1 id="shop-name" className={styles.shopName}>
            {shop.name}
          </h1>
          <div className={styles.codeRow}>
            <span className={styles.codeLabel}>Shop ID</span>
            <span className={styles.code}>{shop.code}</span>
            <button
              type="button"
              className={styles.copy}
              onClick={() => void copy(shop.code)}
              aria-label={copied ? "Shop ID copied" : "Copy shop ID"}
              title={copied ? "Copied" : "Copy shop ID"}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </button>
          </div>
          <ul className={styles.facts}>
            <li>
              <Store aria-hidden="true" />
              {shop.segment || "No segment"}
            </li>
            <li>
              <MapPin aria-hidden="true" />
              {shop.city || "No city"}
            </li>
            <li title={formatDateTime(shop.created_at)}>
              <CalendarDays aria-hidden="true" />
              Joined {formatDate(shop.created_at, { year: "always" })}
            </li>
            <li title={shop.last_active_at ? formatDateTime(shop.last_active_at) : undefined}>
              <Clock aria-hidden="true" />
              {shop.last_active_at ? `Active ${formatRelative(shop.last_active_at)}` : "Never active"}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Contact and location
// ---------------------------------------------------------------------------

function NotAdded() {
  return <span className="muted">Not added</span>;
}

function ContactCard({ shop, className }: { shop: AdminShopDetail; className?: string }) {
  const hasPin = shop.latitude !== null && shop.longitude !== null;
  const items: DescriptionItem[] = [
    { key: "owner", label: "Owner", value: shop.owner_name || <NotAdded /> },
    {
      key: "phone",
      label: "Phone",
      value: shop.phone ? (
        <a href={telHref(shop.phone)} className="mono">
          {formatPhone(shop.phone)}
        </a>
      ) : (
        <NotAdded />
      ),
    },
    {
      key: "email",
      label: "Email",
      value: shop.email ? <a href={`mailto:${shop.email}`}>{shop.email}</a> : <NotAdded />,
    },
    { key: "address", label: "Address", value: shop.address.trim() ? shop.address : <NotAdded /> },
    { key: "city", label: "City", value: shop.city || <NotAdded /> },
    { key: "segment", label: "Segment", value: shop.segment || <NotAdded /> },
    { key: "upi", label: "UPI ID", value: shop.upi_id ? <span className="mono">{shop.upi_id}</span> : <NotAdded /> },
  ];

  return (
    <Card title="Contact and location" className={className}>
      <div className={styles.contact}>
        <div className={styles.contactGrid}>
          <DescriptionList items={items} />
          <div className={styles.mapCol}>
            {hasPin ? (
              <>
                <LazyShopMap
                  latitude={shop.latitude}
                  longitude={shop.longitude}
                  label={`Map showing ${shop.name}`}
                  height={220}
                />
                <ButtonLink
                  href={directionsUrl(shop.latitude as number, shop.longitude as number)}
                  newTab
                  size="sm"
                  icon={<ExternalLink aria-hidden="true" />}
                >
                  Open in Google Maps
                </ButtonLink>
              </>
            ) : (
              <div className={styles.noPin}>
                <MapPin aria-hidden="true" />
                <p>No map pin yet.</p>
                <p className={styles.noPinHint}>The owner drops the pin in Settings.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function ShopSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading shop">
      <BackLink />
      <div className={styles.page}>
        <Skeleton height={220} radius={16} />
        <StatStrip
          loading
          items={[
            { key: "a", label: "Sales, last 30 days", value: "" },
            { key: "b", label: "Orders, last 30 days", value: "" },
            { key: "c", label: "Dues outstanding", value: "" },
            { key: "d", label: "Customers", value: "" },
            { key: "e", label: "Products", value: "" },
            { key: "f", label: "Staff", value: "" },
          ]}
        />
        <div className={styles.layout}>
          <div className={styles.main}>
            <Skeleton height={300} radius={16} />
          </div>
          <div className={styles.side}>
            <Skeleton height={180} radius={16} />
          </div>
        </div>
      </div>
    </div>
  );
}
