import { Info, PackageSearch, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, Button, Chip, EmptyState, ErrorState, QuantityInput, SearchInput, Skeleton } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatMoney, pluralize } from "../../lib/format";
import { lineTotal } from "../../lib/money";
import type { PortalProduct } from "../../lib/types";
import {
  MAX_LINE_QUANTITY,
  cartQuantity,
  filterProducts,
  firstQuantity,
  groupProducts,
  priceSuffix,
  productCategories,
  quantityStep,
  type Cart,
} from "./portalModel";
import styles from "./ShopCatalog.module.css";

export type SetQuantity = (productId: number, quantity: number, keepZero?: boolean) => void;

interface ProductRowProps {
  product: PortalProduct;
  /** Undefined when the product isn't in the cart. */
  quantity: number | undefined;
  ordering: boolean;
  onSetQuantity: SetQuantity;
}

function ProductRow({ product, quantity, ordering, onSetQuantity }: ProductRowProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focusStepper, setFocusStepper] = useState(false);
  const inCart = quantity !== undefined;

  // After "Add" from the keyboard, keep focus on the product: move it to the stepper that replaced the button.
  useEffect(() => {
    if (focusStepper && inCart) {
      inputRef.current?.focus();
      setFocusStepper(false);
    }
  }, [focusStepper, inCart]);

  const lineValue = inCart && quantity > 0 ? lineTotal(quantity, product.price) : null;

  return (
    <li className={cx(styles.product, !product.in_stock && styles.out, inCart && styles.inCart)}>
      <div className={styles.info}>
        <p className={styles.name}>{product.name}</p>
        <p className={styles.price}>
          <span className={styles.amount}>{formatMoney(product.price)}</span>
          <span className={styles.per}>{priceSuffix(product.unit)}</span>
          {lineValue !== null && <span className={styles.lineTotal}> · {formatMoney(lineValue)}</span>}
        </p>
      </div>
      {!product.in_stock ? (
        <Badge size="sm" className={styles.outBadge}>
          Out of stock
        </Badge>
      ) : ordering ? (
        <div className={styles.control}>
          {inCart ? (
            <QuantityInput
              value={quantity}
              onChange={(next) => onSetQuantity(product.id, next, document.activeElement === inputRef.current)}
              onBlur={() => {
                if (quantity === 0) onSetQuantity(product.id, 0);
              }}
              step={quantityStep(product.unit)}
              min={0}
              max={MAX_LINE_QUANTITY}
              unit={product.unit}
              inputRef={inputRef}
              aria-label={`Quantity of ${product.name}`}
            />
          ) : (
            <Button
              size="sm"
              className={styles.add}
              icon={<Plus aria-hidden="true" />}
              aria-label={`Add ${product.name}`}
              onClick={(event) => {
                onSetQuantity(product.id, firstQuantity(product.unit));
                // detail 0: pressed with Enter or Space, not tapped.
                if (event.detail === 0) setFocusStepper(true);
              }}
            >
              Add
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}

function CatalogSkeleton() {
  return (
    <div className={styles.group} aria-hidden="true">
      <Skeleton width={90} height={12} />
      <ul className={styles.products}>
        {[0, 1, 2, 3, 4].map((index) => (
          <li key={index} className={styles.product}>
            <div className={styles.info}>
              <Skeleton width={`${60 - index * 6}%`} height={14} />
              <Skeleton width={70} height={12} style={{ marginTop: 8 }} />
            </div>
            <Skeleton width={72} height={36} radius={10} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ShopCatalogProps {
  products: readonly PortalProduct[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  cart: Cart;
  onSetQuantity: SetQuantity;
  /** The shop takes orders here (otherwise this is a price list). */
  ordering: boolean;
  shopName: string;
}

/** The shop's products by category, with search, prices and an Add / quantity control per product. */
export function ShopCatalog({ products, loading, error, onRetry, retrying, cart, onSetQuantity, ordering, shopName }: ShopCatalogProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const baseId = useId();
  const all = useMemo(() => products ?? [], [products]);
  const categories = useMemo(() => productCategories(all), [all]);
  const activeCategory = category && categories.includes(category) ? category : null;
  const filtered = useMemo(() => filterProducts(all, query, activeCategory), [all, query, activeCategory]);
  const groups = useMemo(() => groupProducts(filtered), [filtered]);
  const filtering = query.trim() !== "" || activeCategory !== null;

  let content;
  if (!products && loading) {
    content = <CatalogSkeleton />;
  } else if (!products && error) {
    content = (
      <div className={styles.panel}>
        <ErrorState title="The products didn't load" error={error} onRetry={onRetry} retrying={retrying} />
      </div>
    );
  } else if (all.length === 0) {
    content = (
      <div className={styles.panel}>
        <EmptyState icon={<PackageSearch />} title="No products here yet." description={`${shopName} hasn't listed its products yet.`} />
      </div>
    );
  } else if (filtered.length === 0) {
    content = (
      <div className={styles.panel}>
        <EmptyState
          icon={<PackageSearch />}
          title={query.trim() ? `Nothing matches “${query.trim()}”.` : "Nothing in this category."}
          description="Try another word, or ask the shop on WhatsApp."
          action={
            <Button
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory(null);
              }}
            >
              Show all products
            </Button>
          }
        />
      </div>
    );
  } else {
    content = groups.map((group, index) => {
      const headingId = `${baseId}-group-${index}`;
      return (
        <section key={group.category} className={styles.group} aria-labelledby={headingId}>
          <h3 id={headingId} className={styles.category}>
            {group.category}
          </h3>
          <ul className={styles.products}>
            {group.products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                quantity={cartQuantity(cart, product.id)}
                ordering={ordering}
                onSetQuantity={onSetQuantity}
              />
            ))}
          </ul>
        </section>
      );
    });
  }

  return (
    <div className={styles.catalog}>
      {!ordering && (
        <p className={styles.notice}>
          <Info aria-hidden="true" />
          <span>These are the shop's prices. To order, call or WhatsApp the shop.</span>
        </p>
      )}

      {all.length > 0 && (
        <div className={styles.filters}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search products" aria-label="Search products" />
          {categories.length > 1 && (
            <div className={styles.chips} role="group" aria-label="Category">
              <Chip selected={activeCategory === null} onClick={() => setCategory(null)}>
                All
              </Chip>
              {categories.map((name) => (
                <Chip key={name} selected={activeCategory === name} onClick={() => setCategory(activeCategory === name ? null : name)}>
                  {name}
                </Chip>
              ))}
            </div>
          )}
          <p className="visually-hidden" role="status">
            {filtering ? pluralize(filtered.length, "product") : ""}
          </p>
        </div>
      )}

      {content}
    </div>
  );
}
