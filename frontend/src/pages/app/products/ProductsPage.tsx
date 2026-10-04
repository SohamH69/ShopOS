import { Archive, PackagePlus, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { useCallback, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  ButtonLink,
  DataTable,
  EmptyState,
  Menu,
  Money,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
  StatStrip,
  StockMeter,
  Switch,
  stockLevel,
  type DataColumn,
  type SegmentedOption,
  type StatItem,
  type StatTone,
} from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { cx } from "../../../lib/cx";
import { formatCount, formatMoney, formatPercent, formatQty, pluralize } from "../../../lib/format";
import { MEDIA, useDocumentTitle, useMediaQuery } from "../../../lib/hooks";
import { sumMoney } from "../../../lib/money";
import { useProductCategories, useProducts } from "../../../lib/queries";
import type { Product } from "../../../lib/types";
import { AdjustStockModal } from "./AdjustStockModal";
import { ArchiveProductDialog } from "./ArchiveProductDialog";
import { ProductDrawer } from "./ProductDrawer";
import { ProductFormModal } from "./ProductFormModal";
import styles from "./ProductsPage.module.css";
import { byUrgency, matchesSearch, shelfValue } from "./stock";
import { isRecord, parseId, setParam, useSearchText, useUpdateSearchParams } from "./urlState";
import { useDialogState } from "./useDialogState";

type ProductDialog =
  | { kind: "create" }
  | { kind: "edit"; product: Product }
  | { kind: "adjust"; product: Product }
  | { kind: "archive"; product: Product };

type StockFilter = "all" | "low";

/** Marks history entries pushed by opening the drawer, so closing it can step back. */
const DRAWER_FLAG = "shoposProductDrawer";

interface Summary {
  count: number;
  categories: number;
  stockValue: number;
  low: number;
  out: number;
}

function summarize(products: readonly Product[] | undefined): Summary | null {
  if (!products) return null;
  const categories = new Set(products.map((product) => product.category.toLowerCase()));
  const low = products.filter((product) => product.low_stock);
  return {
    count: products.length,
    categories: categories.size,
    stockValue: sumMoney(products.map(shelfValue)),
    low: low.length,
    out: low.filter((product) => product.stock_quantity <= 0).length,
  };
}

function lowStockStat(summary: Summary | null): StatItem {
  let tone: StatTone = "default";
  let hint = "At or below their low-stock level";
  if (summary && summary.out > 0) {
    tone = "margin";
    hint = `${formatCount(summary.out)} out of stock`;
  } else if (summary && summary.low > 0) {
    tone = "haldi";
  } else if (summary) {
    hint = "Everything is above its low-stock level";
  }
  return { key: "low", label: "Running low", value: summary ? formatCount(summary.low) : "—", tone, hint };
}

export default function ProductsPage() {
  useDocumentTitle("Products");
  const { can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const update = useUpdateSearchParams();
  const isPhone = useMediaQuery(MEDIA.mobile);
  const dialog = useDialogState<ProductDialog>();

  const stockFilter: StockFilter = params.get("filter") === "low" ? "low" : "all";
  const category = params.get("category") ?? "";
  const showArchived = params.get("archived") === "1";
  const productId = parseId(params.get("product"));
  const [query, setQuery] = useSearchText("q");

  // The active list is shared with the product pickers (same cache entry); archived rows load on request.
  const activeQuery = useProducts();
  const listQuery = useProducts(showArchived ? { include_archived: true } : {});
  const categoriesQuery = useProductCategories();

  const summary = useMemo(() => summarize(activeQuery.data), [activeQuery.data]);

  const rows = useMemo(() => {
    const list = listQuery.data;
    if (!list) return undefined;
    const wanted = category.toLowerCase();
    const filtered = list.filter(
      (product) =>
        (stockFilter === "all" || (product.low_stock && !product.is_archived)) &&
        (!wanted || product.category.toLowerCase() === wanted) &&
        matchesSearch(product, query),
    );
    if (stockFilter === "low") return filtered.sort(byUrgency);
    // Archived products go to the end, still in name order.
    return filtered.sort((a, b) => Number(a.is_archived) - Number(b.is_archived));
  }, [listQuery.data, stockFilter, category, query]);

  const categoryOptions = useMemo(() => {
    const names = categoriesQuery.data ?? [];
    const all = category && !names.some((name) => name.toLowerCase() === category.toLowerCase()) ? [...names, category] : names;
    return all.map((name) => ({ value: name, label: name }));
  }, [categoriesQuery.data, category]);

  const openProduct = useCallback(
    (id: number) => {
      const base = isRecord(location.state) ? location.state : {};
      update((next) => next.set("product", String(id)), { push: true, state: { ...base, [DRAWER_FLAG]: true } });
    },
    [location.state, update],
  );

  const closeProduct = useCallback(() => {
    if (isRecord(location.state) && location.state[DRAWER_FLAG] === true) navigate(-1);
    else update((next) => next.delete("product"));
  }, [location.state, navigate, update]);

  const setStockFilter = (value: StockFilter) => update((next) => setParam(next, "filter", value === "low" ? "low" : null));
  const setCategory = (value: string) => update((next) => setParam(next, "category", value));
  const setShowArchived = (value: boolean) => update((next) => setParam(next, "archived", value ? "1" : null));
  const clearFilters = () => {
    setQuery("");
    update((next) => {
      for (const key of ["filter", "category", "archived", "q"]) next.delete(key);
    });
  };

  const addProduct = () => dialog.show({ kind: "create" });

  const stats: StatItem[] = [
    {
      key: "count",
      label: "Products",
      value: summary ? formatCount(summary.count) : "—",
      hint: summary && summary.categories > 0 ? `In ${pluralize(summary.categories, "category", "categories")}` : undefined,
    },
    {
      key: "value",
      label: "Stock value (at cost)",
      value: summary ? formatMoney(summary.stockValue) : "—",
      hint: "What you paid for it",
    },
    lowStockStat(summary),
  ];

  const stockOptions: readonly SegmentedOption<StockFilter>[] = [
    { value: "all", label: "All products" },
    { value: "low", label: "Running low", count: summary?.low },
  ];

  const hasProducts = (activeQuery.data?.length ?? 0) > 0;
  const searching = query.trim().length > 0;
  let empty: ReactNode;
  if (!hasProducts && stockFilter === "all" && !category && !searching) {
    empty = (
      <EmptyState
        icon={<PackagePlus />}
        title="Add your first product"
        description="Products show up when you create orders, with their price and how much is in stock."
        action={
          <>
            <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={addProduct}>
              Add product
            </Button>
            {can("settings") && <ButtonLink to="/app/settings">Import a CSV in Settings</ButtonLink>}
          </>
        }
      />
    );
  } else if (stockFilter === "low" && !category && !searching) {
    empty = (
      <EmptyState
        title="Nothing is running low."
        description="Products at or below their low-stock level show up here, most urgent first."
        action={<Button onClick={() => setStockFilter("all")}>Show all products</Button>}
      />
    );
  } else {
    empty = (
      <EmptyState
        title="No products match these filters."
        description="Try another name or category, or clear the filters."
        action={<Button onClick={clearFilters}>Clear filters</Button>}
      />
    );
  }

  const current = dialog.state;
  const dialogValue = current?.value;

  return (
    <>
      <PageHeader
        title="Products"
        description="Your stock, prices and low-stock alerts."
        actions={
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={addProduct}>
            Add product
          </Button>
        }
      />

      <div className={styles.body}>
        <StatStrip items={stats} loading={activeQuery.isPending} />

        <div className={styles.toolbar}>
          <SegmentedControl
            label="Which products"
            value={stockFilter}
            onChange={setStockFilter}
            options={stockOptions}
            block={isPhone}
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search name, SKU or category"
            wrapperClassName={styles.search}
          />
          <div className={styles.toolbarEnd}>
            <Select
              aria-label="Category"
              value={category}
              onValueChange={setCategory}
              placeholder="All categories"
              options={categoryOptions}
              wrapperClassName={styles.category}
            />
            <Switch label="Show archived" checked={showArchived} onCheckedChange={setShowArchived} className={styles.archived} />
          </div>
        </div>

        <DataTable
          caption="Products"
          columns={COLUMNS}
          rows={rows}
          rowKey={(product) => product.id}
          onRowClick={(product) => openProduct(product.id)}
          isRowMuted={(product) => product.is_archived}
          rowActions={(product) =>
            product.is_archived ? null : (
              <Menu
                label={`Actions for ${product.name}`}
                items={[
                  {
                    label: "Adjust stock",
                    icon: <SlidersHorizontal />,
                    onSelect: () => dialog.show({ kind: "adjust", product }),
                  },
                  { label: "Edit product", icon: <Pencil />, onSelect: () => dialog.show({ kind: "edit", product }) },
                  { type: "separator" },
                  {
                    label: "Archive product",
                    icon: <Archive />,
                    tone: "danger",
                    onSelect: () => dialog.show({ kind: "archive", product }),
                  },
                ]}
              />
            )
          }
          loading={listQuery.isPending}
          refreshing={listQuery.isPlaceholderData}
          error={listQuery.isError ? listQuery.error : undefined}
          onRetry={() => void listQuery.refetch()}
          empty={empty}
        />
      </div>

      <ProductDrawer
        productId={productId}
        placeholder={productId === null ? undefined : listQuery.data?.find((product) => product.id === productId)}
        onClose={closeProduct}
        onAdjust={(product) => dialog.show({ kind: "adjust", product })}
        onEdit={(product) => dialog.show({ kind: "edit", product })}
        onArchive={(product) => dialog.show({ kind: "archive", product })}
      />

      {current && dialogValue?.kind === "create" && (
        <ProductFormModal key={current.key} open={current.open} onClose={dialog.close} onOpenProduct={openProduct} />
      )}
      {current && dialogValue?.kind === "edit" && (
        <ProductFormModal key={current.key} open={current.open} onClose={dialog.close} product={dialogValue.product} />
      )}
      {current && dialogValue?.kind === "adjust" && (
        <AdjustStockModal key={current.key} open={current.open} onClose={dialog.close} product={dialogValue.product} />
      )}
      {current && dialogValue?.kind === "archive" && (
        <ArchiveProductDialog
          key={current.key}
          open={current.open}
          onClose={dialog.close}
          product={dialogValue.product}
          onArchived={(product) => {
            if (product.id === productId) closeProduct();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Table cells
// ---------------------------------------------------------------------------

function ProductCell({ product }: { product: Product }) {
  return (
    <span className={styles.productCell}>
      <span className={styles.productName}>
        {product.name}
        {product.is_archived && <Badge size="sm">Archived</Badge>}
      </span>
      <span className={styles.productMeta}>
        {product.category}
        {product.sku && (
          <>
            {" · "}
            <span className={styles.sku}>{product.sku}</span>
          </>
        )}
      </span>
    </span>
  );
}

function StockCell({ product }: { product: Product }) {
  const { stock_quantity: stock, min_stock_level: min, reserved_quantity: reserved, unit } = product;
  const level = product.is_archived ? "ok" : stockLevel(stock, min);
  return (
    <span className={styles.stockCell}>
      <span className={styles.stockTop}>
        <span className={styles.stockQty}>{formatQty(stock, unit)}</span>
        {!product.is_archived && <StockMeter stock={stock} min={min} unit={unit} width={48} />}
      </span>
      {(level !== "ok" || reserved > 0) && (
        <span className={styles.stockNote}>
          {level === "out" && <span className={styles.noteOut}>Out of stock</span>}
          {level === "low" && <span className={styles.noteLow}>Running low</span>}
          {level !== "ok" && reserved > 0 && " · "}
          {reserved > 0 && `${formatQty(reserved, unit)} reserved`}
        </span>
      )}
    </span>
  );
}

function MarginCell({ value }: { value: number | null }) {
  if (value === null) return <span className={styles.none}>—</span>;
  return <span className={cx(styles.margin, value < 0 && styles.loss)}>{formatPercent(value, 1)}</span>;
}

const COLUMNS: readonly DataColumn<Product>[] = [
  { key: "product", header: "Product", cell: (product) => <ProductCell product={product} />, mobile: "title" },
  { key: "stock", header: "Stock", cell: (product) => <StockCell product={product} />, width: "190px", mobile: "aside" },
  {
    key: "min",
    header: "Min level",
    cell: (product) => <span className={styles.qty}>{formatQty(product.min_stock_level, product.unit)}</span>,
    width: "110px",
  },
  {
    key: "buy",
    header: "Buy price",
    cell: (product) => <Money value={product.purchase_price} />,
    align: "right",
    width: "110px",
  },
  {
    key: "sell",
    header: "Sell price",
    cell: (product) => <Money value={product.selling_price} />,
    align: "right",
    width: "110px",
  },
  {
    key: "margin",
    header: "Margin",
    cell: (product) => <MarginCell value={product.margin_percent} />,
    align: "right",
    width: "90px",
  },
];
