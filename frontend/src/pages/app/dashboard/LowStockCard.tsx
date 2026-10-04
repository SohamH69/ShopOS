import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ButtonLink, Card, EmptyState, Skeleton, StockMeter } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { cx } from "../../../lib/cx";
import { formatCount, formatNumber, formatQty } from "../../../lib/format";
import type { Product } from "../../../lib/types";
import styles from "./LowStockCard.module.css";

/** "3 kg left · min 10", or "Out of stock · min 5". */
function stockText(product: Product): string {
  const minimum = `min ${formatNumber(product.min_stock_level, 3)}`;
  if (product.stock_quantity <= 0) return `Out of stock · ${minimum}`;
  return `${formatQty(product.stock_quantity, product.unit)} left · ${minimum}`;
}

function LowStockRow({ product, linked }: { product: Product; linked: boolean }) {
  const content = (
    <>
      <span className={styles.name}>{product.name}</span>
      <StockMeter
        className={styles.meter}
        stock={product.stock_quantity}
        min={product.min_stock_level}
        unit={product.unit}
        label={stockText(product)}
      />
    </>
  );
  return linked ? (
    <Link to={`/app/products?product=${product.id}`} className={cx(styles.row, styles.link)}>
      {content}
    </Link>
  ) : (
    <div className={styles.row}>{content}</div>
  );
}

export interface LowStockCardProps {
  /** Up to 5 products, lowest stock ratio first; undefined while loading. */
  products: readonly Product[] | undefined;
  /** How many products are low in all. */
  total: number | undefined;
  className?: string;
}

/** Products at or below their minimum level, so the shopkeeper can reorder in time. */
export function LowStockCard({ products, total, className }: LowStockCardProps) {
  const { can } = useAuth();
  const canOpenProducts = can("inventory");
  const more = total !== undefined && products !== undefined && total > products.length ? total - products.length : 0;

  let body: ReactNode;
  if (!products) {
    body = (
      <ul className={styles.list} aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <li key={index} className={styles.item}>
            <div className={styles.row}>
              <Skeleton width="45%" height={14} />
              <Skeleton width={150} height={12} />
            </div>
          </li>
        ))}
      </ul>
    );
  } else if (products.length === 0) {
    body = (
      <EmptyState compact title="Stock looks good." description="Products at or below their minimum level show up here." />
    );
  } else {
    body = (
      <>
        <ul className={styles.list}>
          {products.map((product) => (
            <li key={product.id} className={styles.item}>
              <LowStockRow product={product} linked={canOpenProducts} />
            </li>
          ))}
        </ul>
        {more > 0 && <p className={styles.more}>and {formatCount(more)} more running low</p>}
      </>
    );
  }

  return (
    <Card
      className={className}
      title="Low stock"
      padding="none"
      actions={
        canOpenProducts && products && products.length > 0 ? (
          <ButtonLink to="/app/products?filter=low" variant="ghost" size="sm" iconRight={<ChevronRight aria-hidden="true" />}>
            View all
          </ButtonLink>
        ) : undefined
      }
    >
      <div aria-busy={!products || undefined}>{body}</div>
    </Card>
  );
}
