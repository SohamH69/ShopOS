import { Archive, Pencil, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  DescriptionList,
  Drawer,
  ErrorState,
  Menu,
  Money,
  Skeleton,
  StockMeter,
  stockLevel,
} from "../../../components/ui";
import { useOrderDrawer } from "../../../features/order-drawer/OrderDrawerProvider";
import { useAuth } from "../../../lib/auth";
import { UNIT_NAME } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { formatDate, formatMoney, formatPercent, formatQty } from "../../../lib/format";
import { MEDIA, useMediaQuery } from "../../../lib/hooks";
import { roundQty } from "../../../lib/money";
import { useProduct, useProductTransactions } from "../../../lib/queries";
import type { Product } from "../../../lib/types";
import styles from "./ProductDrawer.module.css";
import { marginPerUnit, perUnitLabel, shelfValue } from "./stock";
import { StockLedger } from "./StockLedger";

export interface ProductDrawerProps {
  /** The product to show; null closes the drawer. */
  productId: number | null;
  /** The row from the list, shown at once while the full record loads. */
  placeholder?: Product;
  onClose: () => void;
  onAdjust: (product: Product) => void;
  onEdit: (product: Product) => void;
  onArchive: (product: Product) => void;
}

/** One product: stock level, prices and margin, and its stock history as a mini ledger. */
export function ProductDrawer({ productId, placeholder, onClose, onAdjust, onEdit, onArchive }: ProductDrawerProps) {
  const { can } = useAuth();
  const { openOrder } = useOrderDrawer();
  const historyId = useId();

  // Keep showing the last product while the drawer animates out.
  const [shownId, setShownId] = useState(productId);
  if (productId !== null && productId !== shownId) setShownId(productId);

  const productQuery = useProduct(shownId);
  const transactionsQuery = useProductTransactions(shownId);
  const product = productQuery.data ?? (placeholder && placeholder.id === shownId ? placeholder : undefined);
  const editable = product !== undefined && !product.is_archived;

  let body: ReactNode;
  if (!product) {
    body = productQuery.isError ? (
      <ErrorState error={productQuery.error} onRetry={() => void productQuery.refetch()} retrying={productQuery.isFetching} />
    ) : (
      <DrawerSkeleton />
    );
  } else {
    body = (
      <div className={styles.body}>
        {product.is_archived && (
          <p className={styles.archived}>Archived. It no longer shows up in new orders or purchases.</p>
        )}
        <StockSummary product={product} />
        <PriceStrip product={product} />
        <DescriptionList
          items={[
            { key: "unit", label: "Sold by", value: UNIT_NAME[product.unit] },
            {
              key: "value",
              label: "Stock value",
              value: (
                <>
                  <Money value={shelfValue(product)} /> <span className={styles.quiet}>at buy price</span>
                </>
              ),
            },
            { key: "added", label: "Added", value: formatDate(product.created_at, { year: "always" }) },
          ]}
        />
        <section className={styles.history} aria-labelledby={historyId}>
          <h3 id={historyId} className={styles.sectionTitle}>
            Stock history
          </h3>
          <StockLedger
            productName={product.name}
            unit={product.unit}
            transactions={transactionsQuery.data}
            error={transactionsQuery.error}
            onRetry={() => void transactionsQuery.refetch()}
            onOpenOrder={can("orders") ? openOrder : undefined}
          />
        </section>
      </div>
    );
  }

  return (
    <Drawer
      open={productId !== null}
      onClose={onClose}
      title={product?.name ?? "Product"}
      description={product ? <ProductSubtitle product={product} /> : undefined}
      headerActions={
        editable ? (
          <Menu
            label="More actions"
            items={[
              { label: "Archive product", icon: <Archive />, tone: "danger", onSelect: () => onArchive(product) },
            ]}
          />
        ) : undefined
      }
      footer={
        editable ? (
          <>
            <Button icon={<Pencil aria-hidden="true" />} onClick={() => onEdit(product)}>
              Edit
            </Button>
            <Button variant="primary" icon={<SlidersHorizontal aria-hidden="true" />} onClick={() => onAdjust(product)}>
              Adjust stock
            </Button>
          </>
        ) : undefined
      }
    >
      {body}
    </Drawer>
  );
}

function ProductSubtitle({ product }: { product: Product }) {
  return (
    <>
      {product.category}
      {product.sku && (
        <>
          {" · "}
          <span className={styles.sku}>{product.sku}</span>
        </>
      )}
    </>
  );
}

const LEVEL_BADGE = {
  ok: { tone: "leaf", text: "In stock" },
  low: { tone: "haldi", text: "Running low" },
  out: { tone: "margin", text: "Out of stock" },
} as const;

function StockSummary({ product }: { product: Product }) {
  const { stock_quantity: stock, min_stock_level: min, reserved_quantity: reserved, unit } = product;
  const level = stockLevel(stock, min);
  const free = roundQty(stock - reserved);
  const badge = LEVEL_BADGE[level];
  return (
    <section className={styles.stock} aria-label="Stock">
      <div className={styles.stockHead}>
        <span className={styles.label}>In stock</span>
        {!product.is_archived && (
          <Badge tone={badge.tone} size="sm">
            {badge.text}
          </Badge>
        )}
      </div>
      <p className={cx(styles.stockValue, styles[`value_${level}`])}>{formatQty(stock, unit)}</p>
      <div className={styles.meterRow}>
        <StockMeter stock={stock} min={min} unit={unit} width={140} />
        <span>{min > 0 ? `Low-stock alert at ${formatQty(min, unit)}` : "Alert when it runs out"}</span>
      </div>
      {reserved > 0 && (
        <p className={styles.reserved}>
          {formatQty(reserved, unit)} in open orders ·{" "}
          {free >= 0 ? (
            `${formatQty(free, unit)} free to sell`
          ) : (
            <span className={styles.short}>{formatQty(-free, unit)} short for open orders</span>
          )}
        </p>
      )}
    </section>
  );
}

function PriceStrip({ product }: { product: Product }) {
  const isPhone = useMediaQuery(MEDIA.mobile);
  const size = isPhone ? "md" : "lg";
  const per = perUnitLabel(product.unit);
  const margin = product.margin_percent;
  const profit = marginPerUnit(product.purchase_price, product.selling_price);
  return (
    <dl className={styles.prices}>
      <div className={styles.price}>
        <dt>Buy price</dt>
        <dd>
          <Money value={product.purchase_price} size={size} />
        </dd>
        <dd className={styles.priceHint}>per {per}</dd>
      </div>
      <div className={styles.price}>
        <dt>Sell price</dt>
        <dd>
          <Money value={product.selling_price} size={size} />
        </dd>
        <dd className={styles.priceHint}>per {per}</dd>
      </div>
      <div className={styles.price}>
        <dt>Margin</dt>
        <dd className={cx(styles.margin, size === "lg" && styles.marginLarge, margin !== null && margin < 0 && styles.loss)}>
          {margin === null ? "—" : formatPercent(margin, 1)}
        </dd>
        <dd className={styles.priceHint}>{margin === null ? "No selling price" : `${formatMoney(profit)} per ${per}`}</dd>
      </div>
    </dl>
  );
}

function DrawerSkeleton() {
  return (
    <div className={styles.body} aria-busy="true" aria-label="Loading product">
      <div className={styles.stock}>
        <Skeleton width={72} height={12} />
        <Skeleton width={140} height={34} />
        <Skeleton width={220} height={12} />
      </div>
      <Skeleton height={76} radius={10} />
      <div className={styles.stock}>
        <Skeleton width="60%" height={12} />
        <Skeleton width="45%" height={12} />
        <Skeleton width="50%" height={12} />
      </div>
      <Skeleton height={160} radius={10} />
    </div>
  );
}
