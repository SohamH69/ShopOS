import { useState } from "react";
import { Link } from "react-router-dom";
import { BarList, Button, ButtonLink, Card, EmptyState, StockMeter, type BarListItem } from "../../../components/ui";
import { cx } from "../../../lib/cx";
import { formatQty } from "../../../lib/format";
import type { CategorySales, Product, ProductMovement, ProductSales, ProductUnit } from "../../../lib/types";
import { profitText, quantityText, shareText } from "./reportData";
import styles from "./ReportsPage.module.css";

const TOP_PRODUCTS_SHOWN = 8;

// ---------------------------------------------------------------------------
// Top products
// ---------------------------------------------------------------------------

export interface TopProductsCardProps {
  products: readonly ProductSales[];
  units: ReadonlyMap<number, ProductUnit>;
  /** Link each product to its details (needs the inventory permission). */
  linkProducts: boolean;
  className?: string;
}

/** Best sellers by sales, with quantity sold and profit beneath each bar. */
export function TopProductsCard({ products, units, linkProducts, className }: TopProductsCardProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? products : products.slice(0, TOP_PRODUCTS_SHOWN);
  const items: BarListItem[] = shown.map((product) => {
    const unit = product.product_id !== null ? units.get(product.product_id) : undefined;
    return {
      key: product.product_id !== null ? `product-${product.product_id}` : `custom-${product.name}`,
      label: product.name,
      value: product.sales,
      hint: `${quantityText(product.quantity, unit)} sold · ${profitText(product.profit)}`,
      to: linkProducts && product.product_id !== null ? `/app/products?product=${product.product_id}` : undefined,
    };
  });

  return (
    <Card title="Top products" description="By sales in this period" className={className}>
      <BarList
        items={items}
        label="Top products by sales"
        empty="No products sold in this period."
      />
      {products.length > TOP_PRODUCTS_SHOWN && (
        <Button variant="ghost" size="sm" className={styles.more} onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `Show all ${products.length}`}
        </Button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sales by category
// ---------------------------------------------------------------------------

export interface CategoriesCardProps {
  categories: readonly CategorySales[];
  totalSales: number;
  className?: string;
}

/** Each category's sales and its share of the period's item sales. */
export function CategoriesCard({ categories, totalSales, className }: CategoriesCardProps) {
  const itemSales = categories.reduce((sum, category) => sum + category.sales, 0);
  // Shares are of item sales (before order discounts), so they add up to 100%.
  const whole = itemSales > 0 ? itemSales : totalSales;
  const items: BarListItem[] = categories.map((category) => {
    const share = shareText(category.sales, whole);
    return {
      key: category.category || "uncategorised",
      label: category.category || "No category",
      value: category.sales,
      hint: share ? `${share} of sales` : undefined,
    };
  });
  return (
    <Card title="Sales by category" description="Where your sales come from" className={className}>
      <BarList items={items} label="Sales by category" empty="No sales in this period." />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fast and slow movers
// ---------------------------------------------------------------------------

export interface MoversCardProps {
  kind: "fast" | "slow";
  products: readonly ProductMovement[];
  className?: string;
}

const MOVERS_COPY = {
  fast: {
    title: "Fast movers",
    description: "Sold the most, by quantity",
    empty: "Nothing sold in this period yet.",
  },
  slow: {
    title: "Slow movers",
    description: "Sold the least. Consider stocking less of these.",
    empty: "No products yet. Add products to see what sells slowly.",
  },
} as const;

/**
 * Products ranked by quantity sold. A plain table, not bars: quantities in kg, litres and pieces
 * can't share one scale.
 */
export function MoversCard({ kind, products, className }: MoversCardProps) {
  const copy = MOVERS_COPY[kind];
  return (
    <Card title={copy.title} description={copy.description} className={className}>
      {products.length === 0 ? (
        <EmptyState compact title={copy.empty} />
      ) : (
        <table className={styles.miniTable}>
          <caption className="visually-hidden">{`${copy.title}: quantity sold in this period and stock left`}</caption>
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col" className={cx(styles.qtyCol, styles.numCell)}>
                Sold
              </th>
              <th scope="col" className={cx(styles.qtyCol, styles.numCell)}>
                In stock
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.product_id}>
                <th scope="row" title={product.name}>
                  {product.name}
                </th>
                <td className={cx(styles.numCell, product.quantity <= 0 && styles.notSold)}>
                  {product.quantity > 0 ? formatQty(product.quantity, product.unit) : "None"}
                </td>
                <td className={cx(styles.numCell, product.stock_quantity <= 0 && styles.outOfStock)}>
                  {formatQty(product.stock_quantity, product.unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Low stock
// ---------------------------------------------------------------------------

export interface LowStockCardProps {
  products: readonly Product[];
  /** Link to the products page (needs the inventory permission). */
  linkProducts: boolean;
  className?: string;
}

/** Products at or below their minimum level right now. */
export function LowStockCard({ products, linkProducts, className }: LowStockCardProps) {
  return (
    <Card
      title="Low stock"
      description="At or below the minimum level right now"
      className={className}
      actions={
        linkProducts && products.length > 0 ? (
          <ButtonLink to="/app/products?filter=low" variant="ghost" size="sm" className={styles.cardLink}>
            Restock
          </ButtonLink>
        ) : undefined
      }
    >
      {products.length === 0 ? (
        <EmptyState compact title="Nothing is running low." description="Products show up here when stock drops to the minimum you set." />
      ) : (
        <ul className={cx(styles.list, styles.lowStock)}>
          {products.map((product) => (
            <li key={product.id} className={styles.listItem}>
              <span className={styles.itemMain}>
                {linkProducts ? (
                  <Link to={`/app/products?product=${product.id}`} className={styles.itemName}>
                    {product.name}
                  </Link>
                ) : (
                  <span className={styles.itemName}>{product.name}</span>
                )}
                {product.category && <span className={styles.itemMeta}>{product.category}</span>}
              </span>
              <StockMeter
                stock={product.stock_quantity}
                min={product.min_stock_level}
                unit={product.unit}
                width={48}
                label={
                  product.stock_quantity <= 0
                    ? "Out of stock"
                    : `${formatQty(product.stock_quantity, product.unit)} left · min ${formatQty(product.min_stock_level, product.unit)}`
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
