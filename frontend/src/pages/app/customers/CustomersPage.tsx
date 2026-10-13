import { UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  LoadMore,
  Money,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
  StatStrip,
  type DataColumn,
  type SelectOption,
} from "../../../components/ui";
import { formatCount, formatDate, formatMoney, formatPhone, formatRelative } from "../../../lib/format";
import { useDebouncedValue, useDocumentTitle } from "../../../lib/hooks";
import { sumMoney } from "../../../lib/money";
import { useCustomers } from "../../../lib/queries";
import type { Customer, CustomerFilter, CustomerListParams, CustomerSort } from "../../../lib/types";
import { CustomerFormModal } from "./CustomerFormModal";
import styles from "./CustomersPage.module.css";

const SORT_OPTIONS: readonly SelectOption<CustomerSort>[] = [
  { value: "name", label: "Sort: Name" },
  { value: "outstanding", label: "Sort: Highest dues" },
  { value: "recent", label: "Sort: Recent" },
];

/** Rows rendered at first; "Load more" adds this many again (the API returns every customer at once). */
const PAGE_SIZE = 100;

function parseFilter(value: string | null): CustomerFilter {
  return value === "dues" || value === "promises" ? value : "all";
}

function parseSort(value: string | null): CustomerSort | null {
  return value === "name" || value === "outstanding" || value === "recent" ? value : null;
}

/** Lists about money read best biggest-first; the full list reads best by name. */
function defaultSortFor(filter: CustomerFilter): CustomerSort {
  return filter === "all" ? "name" : "outstanding";
}

function DueCell({ customer }: { customer: Customer }) {
  if (customer.outstanding > 0) {
    return (
      <span className={styles.due}>
        <Money value={customer.outstanding} tone="margin" />
        {customer.promise_overdue ? (
          <Badge tone="margin" size="sm">
            Promise overdue
          </Badge>
        ) : customer.promise_date ? (
          <span className={styles.promise}>Promised by {formatDate(customer.promise_date)}</span>
        ) : null}
      </span>
    );
  }
  if (customer.orders_count > 0) return <span className={styles.settled}>Settled</span>;
  return <span className="muted">–</span>;
}

/** The customer list: who buys from you, who owes you, and who promised to pay. */
export default function CustomersPage() {
  useDocumentTitle("Customers");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get("filter"));
  const sort = parseSort(params.get("sort")) ?? defaultSortFor(filter);
  const urlSearch = params.get("q") ?? "";
  const [formOpen, setFormOpen] = useState(false);

  // Patch some params, keeping the rest (including ?order= for the order drawer).
  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // The search box is local state; the URL follows it, debounced.
  const [search, setSearch] = useState(urlSearch);
  const [syncedUrlSearch, setSyncedUrlSearch] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  if (urlSearch !== syncedUrlSearch) {
    // The URL changed from outside (e.g. the Customers link was clicked again): follow it.
    setSyncedUrlSearch(urlSearch);
    if (urlSearch !== debouncedSearch) setSearch(urlSearch);
  }
  const lastWrittenSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (debouncedSearch === lastWrittenSearch.current) return;
    lastWrittenSearch.current = debouncedSearch;
    updateParams({ q: debouncedSearch || null });
  }, [debouncedSearch, updateParams]);

  const listParams: CustomerListParams = {
    search: debouncedSearch || undefined,
    filter: filter === "all" ? undefined : filter,
    sort: sort === "name" ? undefined : sort,
  };
  const customers = useCustomers(listParams);
  // The unfiltered list feeds the summary and the filter counts (same request as the default view).
  const everyone = useCustomers({});

  const summary = useMemo(() => {
    const list = everyone.data ?? [];
    const withDues = list.filter((customer) => customer.outstanding > 0);
    return {
      total: list.length,
      owed: sumMoney(withDues.map((customer) => customer.outstanding)),
      withDues: withDues.length,
      promises: list.filter((customer) => customer.promise_date !== null).length,
    };
  }, [everyone.data]);

  const rowsKey = JSON.stringify(listParams);
  const [visible, setVisible] = useState({ key: rowsKey, count: PAGE_SIZE });
  const visibleCount = visible.key === rowsKey ? visible.count : PAGE_SIZE;
  const allRows = customers.data;
  const rows = useMemo(() => allRows?.slice(0, visibleCount), [allRows, visibleCount]);

  // "Last order" times are relative to when the list arrived, so they refresh with every refetch.
  const listUpdatedAt = customers.dataUpdatedAt;
  const columns = useMemo<DataColumn<Customer>[]>(() => {
    const now = listUpdatedAt || Date.now();
    return [
      {
        key: "name",
        header: "Name",
        mobile: "title",
        cell: (customer) => (
          <span className={styles.nameCell}>
            <span className={styles.name}>{customer.name}</span>
            <span className={`${styles.phoneBelow} mono`}>{formatPhone(customer.phone)}</span>
          </span>
        ),
      },
      {
        key: "phone",
        header: "Phone",
        mobile: "hidden",
        cell: (customer) => <span className={`${styles.phone} mono`}>{formatPhone(customer.phone)}</span>,
      },
      {
        key: "orders",
        header: "Orders",
        align: "right",
        cell: (customer) => <span className="mono">{formatCount(customer.orders_count)}</span>,
      },
      {
        key: "purchases",
        header: "Total purchases",
        align: "right",
        mobileLabel: "Purchases",
        cell: (customer) => <Money value={customer.total_purchases} />,
      },
      {
        key: "last",
        header: "Last order",
        cell: (customer) =>
          customer.last_order_at ? (
            <span className={styles.relative} title={formatDate(customer.last_order_at)}>
              {formatRelative(customer.last_order_at, now)}
            </span>
          ) : (
            <span className="muted">No orders yet</span>
          ),
      },
      {
        key: "due",
        header: "Due",
        align: "right",
        mobile: "aside",
        cell: (customer) => <DueCell customer={customer} />,
      },
    ];
  }, [listUpdatedAt]);

  const setFilter = (next: CustomerFilter) => updateParams({ filter: next === "all" ? null : next, sort: null });
  const setSort = (next: CustomerSort) => updateParams({ sort: next === defaultSortFor(filter) ? null : next });
  const clearAll = () => {
    setSearch("");
    updateParams({ filter: null, sort: null });
  };

  let empty: ReactNode;
  if (debouncedSearch) {
    empty = (
      <EmptyState
        title={`No customers match “${debouncedSearch}”.`}
        description={filter === "all" ? "Check the spelling, or search by phone number." : "Try the full list, or check the spelling."}
        action={<Button onClick={clearAll}>Clear search</Button>}
      />
    );
  } else if (filter === "dues") {
    empty = (
      <EmptyState
        title="No one owes you money right now."
        description="Customers with unpaid orders show up here."
        action={<Button onClick={() => setFilter("all")}>Show all customers</Button>}
      />
    );
  } else if (filter === "promises") {
    empty = (
      <EmptyState
        title="No payment promises."
        description="When a customer says they will pay by a date, add it on their khata so you remember to follow up."
        action={<Button onClick={() => setFilter("all")}>Show all customers</Button>}
      />
    );
  } else {
    empty = (
      <EmptyState
        title="No customers yet."
        description="Add the people who buy from you regularly. Their khata starts with their first order."
        action={
          <Button variant="primary" icon={<UserPlus aria-hidden="true" />} onClick={() => setFormOpen(true)}>
            Add customer
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="Your customers, their khata and what they owe."
        actions={
          <Button variant="primary" icon={<UserPlus aria-hidden="true" />} onClick={() => setFormOpen(true)}>
            Add customer
          </Button>
        }
      />

      <div className={styles.stack}>
        <StatStrip
          loading={everyone.isPending}
          items={[
            { key: "customers", label: "Customers", value: formatCount(summary.total) },
            {
              key: "owed",
              label: "Owed to you",
              value: formatMoney(summary.owed),
              tone: summary.owed > 0 ? "margin" : "default",
            },
            { key: "dues", label: "With dues", value: formatCount(summary.withDues) },
          ]}
        />

        <div className={styles.filters}>
          <SegmentedControl<CustomerFilter>
            label="Show customers"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "dues", label: "With dues", count: everyone.data ? summary.withDues : undefined },
              { value: "promises", label: "Promises", count: everyone.data ? summary.promises : undefined },
            ]}
          />
          <div className={styles.filterEnd}>
            <Select<CustomerSort>
              aria-label="Sort customers"
              wrapperClassName={styles.sort}
              value={sort}
              options={SORT_OPTIONS}
              onValueChange={setSort}
            />
            <SearchInput
              wrapperClassName={styles.search}
              value={search}
              onChange={setSearch}
              placeholder="Search by name or phone"
            />
          </div>
        </div>

        <DataTable
          caption="Customers"
          columns={columns}
          rows={rows}
          rowKey={(customer) => customer.id}
          onRowClick={(customer) => navigate(`/app/customers/${customer.id}`)}
          loading={customers.isPending}
          refreshing={customers.isPlaceholderData}
          error={customers.error}
          onRetry={() => void customers.refetch()}
          empty={empty}
          footer={
            allRows && allRows.length > visibleCount ? (
              <LoadMore
                shown={visibleCount}
                total={allRows.length}
                hasMore
                loading={false}
                noun="customers"
                onLoadMore={() => setVisible({ key: rowsKey, count: visibleCount + PAGE_SIZE })}
              />
            ) : undefined
          }
        />
      </div>

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
