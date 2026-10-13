import { Plus } from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type Ref } from "react";
import { Combobox, Money, type ComboboxAction } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { formatQty } from "../../lib/format";
import { useProducts } from "../../lib/queries";
import type { Product } from "../../lib/types";
import styles from "./Pickers.module.css";

export interface ProductPickerProps {
  /** Called for each pick; the field clears and stays focused for the next item. */
  onSelect: (product: Product) => void;
  /** Adds an "Add custom item" row that receives the typed text. */
  onCustomItem?: (name: string) => void;
  /** Which price to show: "selling" (orders, default) or "purchase" (supplier purchases). */
  price?: "selling" | "purchase";
  /** Quantities already added, by product id, shown as "2 in order". */
  inOrder?: Readonly<Record<number, number>>;
  autoFocus?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Extra key handling on the field (e.g. Ctrl+Enter to submit the order). */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

const LIMIT = 30;

// Best matches first: exact SKU, then name starts with, then a word starts with, then anywhere.
function rank(product: Product, query: string): number {
  const name = product.name.toLowerCase();
  const sku = (product.sku ?? "").toLowerCase();
  if (sku && sku === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.split(/[\s(/-]+/).some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  if (sku.includes(query) || product.category.toLowerCase().includes(query)) return 4;
  return -1;
}

function StockHint({ product }: { product: Product }) {
  if (product.stock_quantity <= 0) return <span className={styles.stockOut}>Out of stock</span>;
  if (product.low_stock) return <span className={styles.stockLow}>Only {formatQty(product.stock_quantity, product.unit)} left</span>;
  return <span className={styles.stockOk}>{formatQty(product.stock_quantity, product.unit)} in stock</span>;
}

/**
 * Type to find a product (name, SKU or category), ↑/↓ and Enter to add it. Filters the cached product
 * list instantly, so a barcode scanner (types the SKU + Enter) adds the item straight away.
 */
export function ProductPicker({
  onSelect,
  onCustomItem,
  price = "selling",
  inOrder,
  autoFocus,
  placeholder = "Add a product by name or SKU",
  disabled,
  invalid,
  id,
  inputRef,
  onKeyDown,
}: ProductPickerProps) {
  const [query, setQuery] = useState("");
  const products = useProducts();
  const term = query.trim().toLowerCase();

  const options = useMemo(() => {
    const list = (products.data ?? []).filter((product) => !product.is_archived);
    if (!term) return list.slice(0, LIMIT);
    return list
      .map((product) => ({ product, score: rank(product, term) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || a.product.name.localeCompare(b.product.name))
      .slice(0, LIMIT)
      .map((entry) => entry.product);
  }, [products.data, term]);

  const trailingActions: ComboboxAction[] =
    onCustomItem && term
      ? [
          {
            key: "custom",
            label: `Add custom item “${query.trim()}”`,
            icon: <Plus />,
            onSelect: (text) => {
              onCustomItem(text.trim());
              setQuery("");
            },
          },
        ]
      : [];

  return (
    <Combobox<Product>
      id={id}
      inputRef={inputRef}
      label="Add a product"
      inputValue={query}
      onInputChange={setQuery}
      options={options}
      getOptionKey={(product) => product.id}
      keepOpenOnSelect
      onSelect={(product) => {
        onSelect(product);
        setQuery("");
      }}
      renderOption={(product) => {
        const added = inOrder?.[product.id];
        return (
          <span className={styles.option}>
            <span className={styles.optionMain}>
              <span className={styles.optionName}>{product.name}</span>
              <span className={styles.optionMeta}>
                {product.category}
                {product.sku ? ` · ${product.sku}` : ""}
                {added ? ` · ${formatQty(added, product.unit)} in order` : ""}
              </span>
            </span>
            <span className={styles.optionAside}>
              <Money value={price === "purchase" ? product.purchase_price : product.selling_price} size="sm" />
              <StockHint product={product} />
            </span>
          </span>
        );
      }}
      trailingActions={trailingActions}
      loading={products.isPending}
      emptyMessage={products.isError ? errorMessage(products.error) : `No product matches “${query.trim()}”.`}
      footer="↑ ↓ to choose · Enter to add"
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      invalid={invalid}
      onKeyDown={onKeyDown}
    />
  );
}
