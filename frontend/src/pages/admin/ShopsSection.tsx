import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  SearchInput,
  SegmentedControl,
  Select,
  type DataColumn,
  type SegmentedOption,
} from "../../components/ui";
import { formatCount, formatDate, formatDateTime, formatPhone, formatRelative } from "../../lib/format";
import { useDebouncedValue, useMediaQuery } from "../../lib/hooks";
import { useAdminShops } from "../../lib/queries";
import type { AdminShopListParams, AdminShopRow, AdminShopStatus, Plan } from "../../lib/types";
import { isPlan, PLAN_OPTIONS, PlanBadge, ShopPhoto, ShopStatusBadges } from "./adminBits";
import styles from "./ShopsSection.module.css";

const PAGE_SIZE = 25;

const STATUSES: readonly AdminShopStatus[] = ["all", "active", "setup_incomplete", "suspended", "demo"];

function parseStatus(value: string | null): AdminShopStatus {
  return STATUSES.includes(value as AdminShopStatus) ? (value as AdminShopStatus) : "all";
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? page : 1;
}

export interface ShopsSectionProps {
  /** Counts from the stats (real shops only) for the filter labels. */
  setupIncomplete?: number;
  suspended?: number;
}

/** Every shop on ShopOS: search, status and plan filters, 25 to a page. Filters live in the URL. */
export function ShopsSection({ setupIncomplete, suspended }: ShopsSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const phone = useMediaQuery("(max-width: 719px)");
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const status = parseStatus(params.get("status"));
  const planParam = params.get("plan");
  const plan: Plan | undefined = isPlan(planParam) ? planParam : undefined;
  const page = parsePage(params.get("page"));
  const urlSearch = params.get("q") ?? "";

  // Patch the query string; keep the #shops anchor so the page doesn't jump to the top.
  const { hash } = location;
  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      navigate({ search: search ? `?${search}` : "", hash }, { replace: true, preventScrollReset: true });
    },
    [hash, location.search, navigate],
  );

  // The box is local; the URL (and so the query) follows it once typing pauses.
  const [search, setSearch] = useState(urlSearch);
  const [syncedUrlSearch, setSyncedUrlSearch] = useState(urlSearch);
  if (urlSearch !== syncedUrlSearch) {
    setSyncedUrlSearch(urlSearch);
    if (urlSearch !== search.trim()) setSearch(urlSearch);
  }
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const lastWritten = useRef(debouncedSearch);
  useEffect(() => {
    if (debouncedSearch === lastWritten.current) return;
    lastWritten.current = debouncedSearch;
    if (debouncedSearch !== urlSearch) updateParams({ q: debouncedSearch || null, page: null });
  }, [debouncedSearch, urlSearch, updateParams]);

  const listParams: AdminShopListParams = {
    search: urlSearch || undefined,
    status: status === "all" ? undefined : status,
    plan,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  };
  const shops = useAdminShops(listParams);
  const result = shops.data;
  const total = result?.total ?? 0;
  const rows = result?.items;
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(total, (page - 1) * PAGE_SIZE + (rows?.length ?? 0));
  const hasPrevious = page > 1;
  const hasNext = page * PAGE_SIZE < total;
  const filtered = Boolean(urlSearch) || status !== "all" || plan !== undefined;

  const listUpdatedAt = shops.dataUpdatedAt;
  const columns = useMemo<DataColumn<AdminShopRow>[]>(() => {
    const now = listUpdatedAt || Date.now();
    return [
      {
        key: "shop",
        header: "Shop",
        mobile: "title",
        cell: (shop) => (
          <span className={styles.shopCell}>
            <ShopPhoto url={shop.photo_url} />
            <span className={styles.shopText}>
              <Link to={`/admin/shops/${shop.id}`} className={styles.shopName}>
                {shop.name}
              </Link>
              <span className={styles.code}>
                {shop.code}
                {shop.city && <span className={styles.cityBelow}> · {shop.city}</span>}
              </span>
              <ShopStatusBadges shop={shop} size="sm" className={styles.badgesBelow} />
            </span>
          </span>
        ),
      },
      {
        key: "owner",
        header: "Owner",
        cell: (shop) => (
          <span className={styles.stacked}>
            <span className={styles.owner}>{shop.owner_name}</span>
            <span className={`${styles.sub} mono`}>{formatPhone(shop.phone)}</span>
          </span>
        ),
      },
      {
        key: "city",
        header: "City",
        mobile: "hidden",
        cell: (shop) => (shop.city ? <span className={styles.city}>{shop.city}</span> : <span className="muted">–</span>),
      },
      {
        key: "plan",
        header: "Plan",
        mobile: "aside",
        cell: (shop) => <PlanBadge plan={shop.plan} size="sm" />,
      },
      {
        key: "status",
        header: "Status",
        mobile: "hidden",
        cell: (shop) => <ShopStatusBadges shop={shop} size="sm" showLive />,
      },
      {
        key: "orders",
        header: "Orders",
        align: "right",
        cell: (shop) => <span className="mono">{formatCount(shop.orders_count)}</span>,
      },
      {
        key: "customers",
        header: "Customers",
        align: "right",
        cell: (shop) => <span className="mono">{formatCount(shop.customers_count)}</span>,
      },
      {
        key: "joined",
        header: "Joined",
        mobile: "hidden",
        cell: (shop) => (
          <span className={styles.when} title={formatDateTime(shop.created_at)}>
            {formatDate(shop.created_at)}
          </span>
        ),
      },
      {
        key: "active",
        header: "Last active",
        cell: (shop) =>
          shop.last_active_at ? (
            <span className={styles.when} title={formatDateTime(shop.last_active_at)}>
              {formatRelative(shop.last_active_at, now)}
            </span>
          ) : (
            <span className="muted">Never</span>
          ),
      },
    ];
  }, [listUpdatedAt]);

  const statusOptions: SegmentedOption<AdminShopStatus>[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "setup_incomplete", label: "Setup incomplete", count: setupIncomplete || undefined },
    { value: "suspended", label: "Suspended", count: suspended || undefined },
    { value: "demo", label: "Demo" },
  ];

  const clearAll = () => {
    setSearch("");
    updateParams({ q: null, status: null, plan: null, page: null });
  };

  let empty: ReactNode;
  if (page > 1 && total > 0) {
    empty = (
      <EmptyState
        title="Nothing on this page."
        description={`There are ${formatCount(total)} matching shops, all on earlier pages.`}
        action={<Button onClick={() => updateParams({ page: null })}>Go to the first page</Button>}
      />
    );
  } else if (filtered) {
    empty = (
      <EmptyState
        title={urlSearch ? `No shops match “${urlSearch}”.` : "No shops match these filters."}
        description="Search by shop name, shop ID, owner, phone, email or city."
        action={<Button onClick={clearAll}>Clear filters</Button>}
      />
    );
  } else {
    empty = <EmptyState title="No shops yet." description="Shops show up here as soon as they sign up." />;
  }

  return (
    <Card
      id="shops"
      className={styles.section}
      padding="none"
      title="All shops"
      description={
        result ? (filtered ? `${formatCount(total)} matching` : `${formatCount(total)} in total, demo included`) : "Loading shops"
      }
    >
      <div className={styles.filters}>
        <SegmentedControl<AdminShopStatus>
          label="Shop status"
          size="sm"
          className={styles.status}
          options={statusOptions}
          value={status}
          onChange={(next) => updateParams({ status: next === "all" ? null : next, page: null })}
        />
        <div className={styles.filterEnd}>
          <Select<Plan>
            aria-label="Plan"
            size="sm"
            wrapperClassName={styles.plan}
            placeholder="All plans"
            options={PLAN_OPTIONS}
            value={plan ?? ""}
            onValueChange={(next) => updateParams({ plan: next || null, page: null })}
          />
          <SearchInput
            size="sm"
            wrapperClassName={styles.search}
            value={search}
            onChange={setSearch}
            placeholder={phone ? "Search shops" : "Search name, shop ID, phone, city"}
            aria-label="Search shops by name, shop ID, owner, phone or city"
          />
        </div>
      </div>

      <DataTable
        caption="Shops"
        framed={false}
        columns={columns}
        rows={rows}
        rowKey={(shop) => shop.id}
        onRowClick={(shop) => navigate(`/admin/shops/${shop.id}`)}
        isRowMuted={(shop) => shop.is_suspended}
        loading={shops.isPending}
        refreshing={shops.isPlaceholderData}
        error={shops.error}
        onRetry={() => void shops.refetch()}
        empty={empty}
        skeletonRows={6}
      />

      {total > 0 && (rows?.length ?? 0) > 0 && (
        <nav className={styles.pager} aria-label="Shop pages">
          <p className={styles.range} aria-live="polite">
            {formatCount(firstShown)}–{formatCount(lastShown)} of {formatCount(total)}
          </p>
          <div className={styles.pagerButtons}>
            <Button
              size="sm"
              icon={<ChevronLeft aria-hidden="true" />}
              disabled={!hasPrevious || shops.isPlaceholderData}
              onClick={() => updateParams({ page: page - 1 > 1 ? String(page - 1) : null })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              iconRight={<ChevronRight aria-hidden="true" />}
              disabled={!hasNext || shops.isPlaceholderData}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </Card>
  );
}
