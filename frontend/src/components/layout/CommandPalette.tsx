import { CornerDownLeft, Package, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useNewOrder } from "../../features/new-order/NewOrderProvider";
import { useOrderDrawer } from "../../features/order-drawer/OrderDrawerProvider";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import { formatItemsSummary, formatPhone, formatQty, orderNo } from "../../lib/format";
import { useDebouncedValue } from "../../lib/hooks";
import { useSearch } from "../../lib/queries";
import { Avatar, IconButton, Kbd, Money, OrderStatusBadge, Portal, Spinner } from "../ui";
import { usePresence, useOverlayLayer } from "../ui/overlay";
import { cleanId } from "../ui/utils";
import styles from "./CommandPalette.module.css";
import { useNavItems } from "./nav";

type GroupId = "actions" | "customers" | "orders" | "products" | "pages";

const GROUPS: readonly { id: GroupId; label: string }[] = [
  { id: "actions", label: "Actions" },
  { id: "customers", label: "Customers" },
  { id: "orders", label: "Orders" },
  { id: "products", label: "Products" },
  { id: "pages", label: "Pages" },
];

// "1045" or "#1045" is almost always an order number: show orders before customers then.
const ORDER_NUMBER = /^#?\d{3,7}$/;

function groupOrder(term: string): readonly { id: GroupId; label: string }[] {
  if (!ORDER_NUMBER.test(term)) return GROUPS;
  const orders = GROUPS.filter((group) => group.id === "orders");
  return [GROUPS[0], ...orders, ...GROUPS.filter((group) => group.id !== "orders" && group.id !== "actions")];
}

interface PaletteEntry {
  key: string;
  group: GroupId;
  content: ReactNode;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

/** Ctrl/⌘ K: search customers, orders and products, or jump to a page. */
export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { mounted, closing } = usePresence(open, 120);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropPressed = useRef(false);
  useOverlayLayer({ open, onClose, panelRef, initialFocusRef: inputRef });

  if (!mounted) return null;

  return (
    <Portal>
      <div className={styles.root} data-state={closing ? "closed" : "open"}>
        <div
          className={styles.backdrop}
          aria-hidden="true"
          onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
            backdropPressed.current = event.target === event.currentTarget;
          }}
          onClick={(event: MouseEvent<HTMLDivElement>) => {
            if (backdropPressed.current && event.target === event.currentTarget) onClose();
            backdropPressed.current = false;
          }}
        />
        <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Search ShopOS" tabIndex={-1} className={styles.panel}>
          <PaletteBody inputRef={inputRef} onClose={onClose} />
        </div>
      </div>
    </Portal>
  );
}

function PaletteBody({ inputRef, onClose }: { inputRef: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const term = query.trim();
  const debounced = useDebouncedValue(term, 150);
  const search = useSearch(debounced);
  const navigate = useNavigate();
  const { openOrder } = useOrderDrawer();
  const { openNewOrder } = useNewOrder();
  const { can } = useAuth();
  const navItems = useNavItems();
  const listId = `palette-${cleanId(useId())}`;
  const lower = term.toLowerCase();
  const results = term && debounced ? search.data : undefined;

  // Close first, so focus returns to where it was before the next screen (or drawer) takes over.
  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  const entries: PaletteEntry[] = [];

  if (can("orders") && (!lower || "new order".includes(lower) || "create order".includes(lower))) {
    entries.push({
      key: "action-new-order",
      group: "actions",
      content: (
        <>
          <span className={styles.icon}>
            <Plus aria-hidden="true" />
          </span>
          <span className={styles.main}>
            <span className={styles.primary}>New order</span>
          </span>
          <Kbd>N</Kbd>
        </>
      ),
      onSelect: run(() => openNewOrder()),
    });
  }

  for (const customer of results?.customers ?? []) {
    entries.push({
      key: `customer-${customer.id}`,
      group: "customers",
      content: (
        <>
          <Avatar name={customer.name} size="sm" />
          <span className={styles.main}>
            <span className={styles.primary}>{customer.name}</span>
            <span className={cx(styles.secondary, "mono")}>{formatPhone(customer.phone)}</span>
          </span>
          {customer.outstanding > 0 && (
            <span className={styles.aside}>
              <Money value={customer.outstanding} tone="margin" size="sm" /> due
            </span>
          )}
        </>
      ),
      onSelect: run(() => navigate(`/app/customers/${customer.id}`)),
    });
  }

  for (const order of results?.orders ?? []) {
    entries.push({
      key: `order-${order.id}`,
      group: "orders",
      content: (
        <>
          <span className={cx(styles.orderNo, "mono")}>{orderNo(order.number)}</span>
          <span className={styles.main}>
            <span className={styles.primary}>{order.customer_name ?? "Walk-in"}</span>
            <span className={styles.secondary}>{formatItemsSummary(order.items, 2)}</span>
          </span>
          <span className={styles.aside}>
            <Money value={order.total} size="sm" />
            <OrderStatusBadge status={order.status} />
          </span>
        </>
      ),
      onSelect: run(() => openOrder(order.id)),
    });
  }

  for (const product of results?.products ?? []) {
    entries.push({
      key: `product-${product.id}`,
      group: "products",
      content: (
        <>
          <span className={styles.icon}>
            <Package aria-hidden="true" />
          </span>
          <span className={styles.main}>
            <span className={styles.primary}>{product.name}</span>
            <span className={styles.secondary}>
              {product.category} · {formatQty(product.stock_quantity, product.unit)} in stock
            </span>
          </span>
          <span className={styles.aside}>
            <Money value={product.selling_price} size="sm" />
          </span>
        </>
      ),
      onSelect: run(() => navigate(`/app/products?product=${product.id}`)),
    });
  }

  for (const item of navItems) {
    if (lower && !item.label.toLowerCase().includes(lower) && !(item.keywords ?? "").includes(lower)) continue;
    const Icon = item.icon;
    entries.push({
      key: `page-${item.id}`,
      group: "pages",
      content: (
        <>
          <span className={styles.icon}>
            <Icon aria-hidden="true" />
          </span>
          <span className={styles.main}>
            <span className={styles.primary}>{item.label}</span>
          </span>
        </>
      ),
      onSelect: run(() => navigate(item.to)),
    });
  }

  // Keyboard order must match what's on screen.
  const groups = groupOrder(term);
  entries.sort((a, b) => groups.findIndex((group) => group.id === a.group) - groups.findIndex((group) => group.id === b.group));

  // Highlight the first result whenever the result set changes.
  const signature = entries.map((entry) => entry.key).join("|");
  const [lastSignature, setLastSignature] = useState(signature);
  const [active, setActive] = useState(0);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setActive(0);
  }

  useEffect(() => {
    document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (entries.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + entries.length) % entries.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      entries[active]?.onSelect();
    } else if (event.key === "Escape" && query) {
      // First Esc clears the search; the next one closes the palette.
      event.preventDefault();
      setQuery("");
    }
  };

  const searching = Boolean(term) && (search.isFetching || term !== debounced);
  const searchedNothing =
    Boolean(term) &&
    !searching &&
    !search.isError &&
    (results?.customers.length ?? 0) + (results?.orders.length ?? 0) + (results?.products.length ?? 0) === 0;

  const positions = new Map(entries.map((entry, position) => [entry.key, position]));
  return (
    <>
      <div className={styles.searchRow}>
        <Search className={styles.searchIcon} aria-hidden="true" />
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={entries.length > 0 ? `${listId}-option-${active}` : undefined}
          aria-label="Search orders, customers, products and pages"
          placeholder="Search orders, customers, products…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {searching && <Spinner size={16} />}
        <IconButton className={styles.close} label="Close search" icon={<X aria-hidden="true" />} onClick={onClose} />
      </div>
      <div className={styles.results}>
        <div id={listId} role="listbox" aria-label="Results">
          {groups.map((group) => {
            const groupEntries = entries.filter((entry) => entry.group === group.id);
            if (groupEntries.length === 0) return null;
            const labelId = `${listId}-${group.id}`;
            return (
              <div key={group.id} role="group" aria-labelledby={labelId} className={styles.group}>
                <div id={labelId} className={styles.groupLabel}>
                  {group.label}
                </div>
                {groupEntries.map((entry) => {
                  const position = positions.get(entry.key) ?? 0;
                  return (
                    <div
                      key={entry.key}
                      id={`${listId}-option-${position}`}
                      role="option"
                      aria-selected={position === active}
                      className={cx(styles.option, position === active && styles.active)}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => {
                        if (position !== active) setActive(position);
                      }}
                      onClick={entry.onSelect}
                    >
                      {entry.content}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {search.isError && term && <p className={styles.message}>Search isn't available right now. Check your connection and try again.</p>}
        {searchedNothing && (
          <p className={styles.message}>
            No customers, orders or products match “{term}”. Try a name, a phone number or an order number like 1045.
          </p>
        )}
      </div>
      <footer className={styles.footer}>
        <span className={styles.hint}>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className={styles.hint}>
          <Kbd>
            <CornerDownLeft size={11} aria-hidden="true" />
          </Kbd>{" "}
          to open
        </span>
        <span className={styles.hint}>
          <Kbd>Esc</Kbd> to close
        </span>
      </footer>
    </>
  );
}
