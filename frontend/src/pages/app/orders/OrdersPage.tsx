import { ClipboardList, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  isAnyOverlayOpen,
  LoadMore,
  Money,
  OrderStatusBadge,
  PageHeader,
  PaymentStatusBadge,
  SearchInput,
  SegmentedControl,
  Select,
  type DataColumn,
} from "../../../components/ui";
import { useNewOrder } from "../../../features/new-order/NewOrderProvider";
import { useOrderDrawer } from "../../../features/order-drawer/OrderDrawerProvider";
import { CHANNEL_LABEL, FULFILLMENT_LABEL, PAYMENT_STATUS_LABEL, toOptions } from "../../../lib/constants";
import { formatDateTime, formatItemsSummary, formatRelative, orderNo, pluralize } from "../../../lib/format";
import { useDocumentTitle, useHotkey } from "../../../lib/hooks";
import { useInfiniteOrders } from "../../../lib/queries";
import type { Channel, Fulfillment, Order, OrderFilters, PaymentStatus } from "../../../lib/types";
import styles from "./OrdersPage.module.css";

type StatusTab = "all" | "open" | "ready" | "completed" | "cancelled";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "ready", label: "Ready" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_VALUES: readonly StatusTab[] = STATUS_TABS.map((tab) => tab.value);
const PAYMENT_VALUES: readonly PaymentStatus[] = ["unpaid", "partial", "paid"];
const FULFILLMENT_VALUES: readonly Fulfillment[] = ["pickup", "delivery"];
const CHANNEL_VALUES: readonly Channel[] = ["walk_in", "phone", "whatsapp"];

const PAYMENT_OPTIONS = toOptions(PAYMENT_STATUS_LABEL);
const FULFILLMENT_OPTIONS = toOptions(FULFILLMENT_LABEL);
const CHANNEL_OPTIONS = toOptions(CHANNEL_LABEL);

/** URL params this page owns; anything else (notably the drawer's ?order=) is left alone. */
const FILTER_PARAMS = ["status", "payment", "fulfillment", "channel", "q"] as const;
type FilterParam = (typeof FILTER_PARAMS)[number];

const PAGE_SIZE = 50;
const SEARCH_DELAY = 300;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

interface PageFilters {
  status: StatusTab;
  payment?: PaymentStatus;
  fulfillment?: Fulfillment;
  channel?: Channel;
  q: string;
}

function readFilters(params: URLSearchParams): PageFilters {
  return {
    status: pick(params.get("status"), STATUS_VALUES) ?? "all",
    payment: pick(params.get("payment"), PAYMENT_VALUES),
    fulfillment: pick(params.get("fulfillment"), FULFILLMENT_VALUES),
    channel: pick(params.get("channel"), CHANNEL_VALUES),
    q: (params.get("q") ?? "").trim(),
  };
}

function toApiFilters(filters: PageFilters): Omit<OrderFilters, "limit" | "offset"> {
  const api: Omit<OrderFilters, "limit" | "offset"> = {};
  if (filters.status !== "all") api.status = filters.status;
  if (filters.payment) api.payment_status = filters.payment;
  if (filters.fulfillment) api.fulfillment = filters.fulfillment;
  if (filters.channel) api.channel = filters.channel;
  if (filters.q) api.search = filters.q;
  return api;
}

const COLUMNS: DataColumn<Order>[] = [
  {
    key: "order",
    header: "Order",
    width: "120px",
    mobile: "title",
    cell: (order) => (
      <span className={styles.orderCell}>
        <span className={styles.orderNo}>{orderNo(order.number)}</span>
        <time className={styles.when} dateTime={order.created_at} title={formatDateTime(order.created_at)}>
          {formatRelative(order.created_at)}
        </time>
      </span>
    ),
  },
  {
    key: "customer",
    header: "Customer",
    mobile: "title",
    cell: (order) =>
      order.customer_name ? (
        <span className={styles.customer}>{order.customer_name}</span>
      ) : (
        <span className={styles.walkIn}>Walk-in</span>
      ),
  },
  {
    key: "items",
    header: "Items",
    cell: (order) => {
      const summary = formatItemsSummary(order.items);
      return (
        <span className={styles.items} title={summary}>
          {summary}
        </span>
      );
    },
  },
  {
    key: "status",
    header: "Status",
    cell: (order) => (
      <span className={styles.status}>
        <OrderStatusBadge status={order.status} />
        {order.is_overdue && (
          <Badge tone="margin" size="sm">
            Overdue
          </Badge>
        )}
      </span>
    ),
  },
  {
    key: "payment",
    header: "Payment",
    mobile: "aside",
    cell: (order) => <PaymentStatusBadge status={order.payment_status} />,
  },
  {
    key: "total",
    header: "Total",
    align: "right",
    mobile: "aside",
    cell: (order) => <Money value={order.total} />,
  },
  {
    key: "due",
    header: "Due",
    align: "right",
    cell: (order) =>
      order.status !== "cancelled" && order.outstanding > 0 ? (
        <Money value={order.outstanding} tone="margin" />
      ) : (
        <span className={styles.none}>—</span>
      ),
  },
];

export default function OrdersPage() {
  useDocumentTitle("Orders");
  const { openOrder } = useOrderDrawer();
  const { openNewOrder } = useNewOrder();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const list = useInfiniteOrders(toApiFilters(filters), PAGE_SIZE);

  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<number | undefined>(undefined);
  const [searchText, setSearchText] = useState(filters.q);
  // Follow the URL when it changes from outside (Back, Clear filters), without fighting the typist.
  const [syncedQuery, setSyncedQuery] = useState(filters.q);
  if (filters.q !== syncedQuery) {
    setSyncedQuery(filters.q);
    if (searchText.trim() !== filters.q) setSearchText(filters.q);
  }

  useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  const setFilter = useCallback(
    (key: FilterParam, value: string | null) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (!value || (key === "status" && value === "all")) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const handleSearch = (value: string) => {
    setSearchText(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => setFilter("q", value.trim()), SEARCH_DELAY);
  };

  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearchText("");
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const key of FILTER_PARAMS) next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  // "/" jumps to the search box, as on most sites with search.
  useHotkey("/", () => {
    if (!isAnyOverlayOpen()) searchRef.current?.focus();
  });

  const filtersActive =
    filters.status !== "all" || Boolean(filters.payment || filters.fulfillment || filters.channel || filters.q);
  const showFooter = list.hasMore || list.items.length >= 20;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order, its status and what's still due."
        actions={
          <Button icon={<Plus aria-hidden="true" />} onClick={() => openNewOrder()} aria-keyshortcuts="N">
            New order
          </Button>
        }
      >
        <div className={styles.filters}>
          <div className={styles.filterRow}>
            <SegmentedControl
              label="Order status"
              options={STATUS_TABS}
              value={filters.status}
              onChange={(value) => setFilter("status", value)}
            />
            <SearchInput
              ref={searchRef}
              wrapperClassName={styles.search}
              value={searchText}
              onChange={handleSearch}
              placeholder="Search by order #, customer or product"
              aria-keyshortcuts="/"
            />
          </div>
          <div className={styles.selects}>
            <Select
              aria-label="Payment status"
              placeholder="Any payment"
              options={PAYMENT_OPTIONS}
              value={filters.payment ?? ""}
              onValueChange={(value) => setFilter("payment", value || null)}
            />
            <Select
              aria-label="Pickup or delivery"
              placeholder="Pickup & delivery"
              options={FULFILLMENT_OPTIONS}
              value={filters.fulfillment ?? ""}
              onValueChange={(value) => setFilter("fulfillment", value || null)}
            />
            <Select
              aria-label="Channel"
              placeholder="Any channel"
              options={CHANNEL_OPTIONS}
              value={filters.channel ?? ""}
              onValueChange={(value) => setFilter("channel", value || null)}
            />
            {filtersActive && (
              <Button variant="ghost" size="sm" className={styles.clear} onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </PageHeader>

      <p className={styles.count} aria-live="polite">
        {list.isPending ? " " : pluralize(list.total, "order")}
        {!list.isPending && filtersActive && <span className={styles.countHint}> match these filters</span>}
      </p>

      <DataTable
        columns={COLUMNS}
        rows={list.isPending ? undefined : list.items}
        rowKey={(order) => order.id}
        onRowClick={(order) => openOrder(order.id)}
        isRowMuted={(order) => order.status === "cancelled"}
        loading={list.isPending}
        refreshing={list.isPlaceholderData}
        error={list.isError ? list.error : undefined}
        onRetry={list.refetch}
        caption="Orders, newest first"
        skeletonRows={8}
        empty={
          filtersActive ? (
            <EmptyState
              title="No orders match these filters."
              description="Try another status or search, or clear the filters to see every order."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              icon={<ClipboardList aria-hidden="true" />}
              title="No orders yet."
              description="Orders you take at the counter, on the phone or on WhatsApp show up here."
              action={
                <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => openNewOrder()}>
                  Create your first order
                </Button>
              }
            />
          )
        }
        footer={
          showFooter ? (
            <LoadMore
              shown={list.items.length}
              total={list.total}
              hasMore={list.hasMore}
              loading={list.isLoadingMore}
              onLoadMore={list.loadMore}
              noun="orders"
            />
          ) : undefined
        }
      />
    </>
  );
}
