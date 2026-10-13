import { ArrowRight, BookOpen, CircleCheck, ReceiptText, ShoppingBasket, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, IconButton, Money, TabPanel, Tabs, type TabItem } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { cx } from "../../lib/cx";
import { orderNo, pluralize } from "../../lib/format";
import { useDocumentTitle, useSearchParam } from "../../lib/hooks";
import { queryKeys, usePlacePortalOrder, usePortal, usePortalProducts } from "../../lib/queries";
import type { Fulfillment, PortalOrder, PortalView } from "../../lib/types";
import { BalanceCard } from "./BalanceCard";
import { CheckoutSheet } from "./CheckoutSheet";
import { KhataList } from "./KhataList";
import { OrdersList } from "./OrdersList";
import page from "./PortalPage.module.css";
import { cartLines, cartTotal, loadCart, pruneCart, saveCart, setCartQuantity, type Cart } from "./portalModel";
import { FindShopCard, PortalFooter, PortalLoading, PortalProblem } from "./PortalStates";
import { ShopCatalog } from "./ShopCatalog";
import { ShopSignboard } from "./ShopSignboard";

type PortalTab = "khata" | "orders" | "shop";

const TABS_ID = "portal-tabs";

/**
 * The customer's khata link (/c/:token), opened from WhatsApp. No sign-in: the token is the key.
 * The shop's signboard, what the customer owes (Pay by UPI), their khata and orders, and, when the
 * shop allows it, the shop's products to send an order from.
 */
export default function PortalPage() {
  const { token = "" } = useParams();
  const portal = usePortal(token || undefined);
  const shopName = portal.data?.shop.name;
  useDocumentTitle(shopName ? `${shopName} · Your khata` : "Your khata", { exact: Boolean(shopName) });

  let content;
  if (!token) {
    content = (
      <PortalProblem
        error={new ApiError(404, "This khata link isn't complete. Ask the shop to send it to you again.")}
        onRetry={() => undefined}
        retrying={false}
      />
    );
  } else if (portal.data) {
    content = <PortalContent token={token} view={portal.data} />;
  } else if (portal.isError) {
    content = <PortalProblem error={portal.error} onRetry={() => void portal.refetch()} retrying={portal.isFetching} />;
  } else {
    content = <PortalLoading />;
  }

  return (
    <>
      {/* A private page: keep it out of search engines. (React hoists this into <head>.) */}
      <meta name="robots" content="noindex, nofollow" />
      {content}
    </>
  );
}

interface PortalContentProps {
  token: string;
  view: PortalView;
}

function PortalContent({ token, view }: PortalContentProps) {
  const { shop, customer, ledger, orders } = view;
  const catalogOn = shop.catalog_enabled;
  const ordering = catalogOn && shop.orders_enabled;

  // Tabs ----------------------------------------------------------------------
  const [tabParam, setTabParam] = useSearchParam("tab", "khata");
  const tab: PortalTab = tabParam === "orders" ? "orders" : tabParam === "shop" && catalogOn ? "shop" : "khata";
  const tabsAnchorRef = useRef<HTMLDivElement>(null);

  const selectTab = (next: PortalTab) => {
    // With the tabs stuck to the top of the screen, start the new tab at its top, not mid-way down.
    const anchor = tabsAnchorRef.current;
    if (anchor) {
      const top = anchor.getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: top + window.scrollY });
    }
    setTabParam(next);
  };

  // Orders: which are open, and which one to bring into view ----------------
  const [openOrderIds, setOpenOrderIds] = useState<ReadonlySet<number>>(() => new Set());
  const [focusOrderId, setFocusOrderId] = useState<number | null>(null);
  const orderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders]);

  const toggleOrder = useCallback((orderId: number) => {
    setOpenOrderIds((previous) => {
      const next = new Set(previous);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const showOrder = (orderId: number) => {
    setOpenOrderIds((previous) => new Set(previous).add(orderId));
    setTabParam("orders");
    setFocusOrderId(orderId);
  };

  // Products and the cart -----------------------------------------------------
  const products = usePortalProducts(token, { enabled: catalogOn });
  const [cart, setCart] = useState<Cart>(() => (ordering ? loadCart(token) : []));

  useEffect(() => {
    if (ordering) saveCart(token, cart);
  }, [token, cart, ordering]);

  // Once the products are in, forget anything that's gone or out of stock since the cart was saved.
  useEffect(() => {
    if (products.data) setCart((previous) => pruneCart(previous, products.data));
  }, [products.data]);

  const lines = useMemo(() => cartLines(cart, products.data ?? []), [cart, products.data]);
  const total = cartTotal(lines);

  const setQuantity = useCallback((productId: number, quantity: number, keepZero = false) => {
    setCart((previous) => setCartQuantity(previous, productId, quantity, keepZero));
  }, []);

  // Sending the order ---------------------------------------------------------
  const queryClient = useQueryClient();
  const placeOrder = usePlacePortalOrder(token);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [placed, setPlaced] = useState<PortalOrder | null>(null);
  const placedRef = useRef<HTMLDivElement>(null);

  const openCheckout = () => {
    placeOrder.reset();
    setCheckoutOpen(true);
  };

  const send = () => {
    const deliveryAddress = fulfillment === "delivery" ? address.trim() : "";
    const note = notes.trim();
    placeOrder.mutate(
      {
        items: lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
        fulfillment,
        ...(deliveryAddress ? { delivery_address: deliveryAddress } : {}),
        ...(note ? { notes: note } : {}),
      },
      {
        onSuccess: (order) => {
          setCart([]);
          setNotes("");
          setAddress("");
          setCheckoutOpen(false);
          setPlaced(order);
          setOpenOrderIds((previous) => new Set(previous).add(order.id));
          // The new order and the khata entry it made. (Joins a refetch already on its way rather than
          // starting a second one: every mutation also refreshes all queries.)
          void queryClient.invalidateQueries({ queryKey: queryKeys.portal(token), exact: true }, { cancelRefetch: false });
        },
        // Stock may have changed under the customer: refresh what's available.
        onError: () => void products.refetch(),
      },
    );
  };

  // Bring the confirmation into view (and to screen readers) once the sheet has closed.
  useEffect(() => {
    if (!placed) return undefined;
    const frame = window.requestAnimationFrame(() => placedRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [placed]);

  // ---------------------------------------------------------------------------

  const tabs: TabItem<PortalTab>[] = [
    {
      value: "khata",
      label: (
        <>
          <BookOpen size={18} aria-hidden="true" />
          Khata
        </>
      ),
    },
    {
      value: "orders",
      label: (
        <>
          <ReceiptText size={18} aria-hidden="true" />
          Orders
        </>
      ),
    },
  ];
  if (catalogOn) {
    tabs.push({
      value: "shop",
      label: (
        <>
          <ShoppingBasket size={18} aria-hidden="true" />
          Shop
        </>
      ),
    });
  }

  const showCartBar = ordering && lines.length > 0;

  return (
    <div className={cx(page.page, showCartBar && page.withCartBar)}>
      <ShopSignboard shop={shop} customer={customer} />

      <main className={page.main}>
        <div className={page.overlap}>
          <BalanceCard shop={shop} customer={customer} hasHistory={ledger.length > 0} />
        </div>

        {placed && (
          <div ref={placedRef} tabIndex={-1} role="status" className={page.placed}>
            <CircleCheck className={page.placedIcon} aria-hidden="true" />
            <div className={page.placedBody}>
              <p className={page.placedTitle}>
                Order {orderNo(placed.number)} sent to {shop.name}.
              </p>
              <p className={page.placedText}>They'll get it ready. You can follow it under Orders.</p>
              <div className={page.placedActions}>
                <Button size="sm" onClick={() => showOrder(placed.id)}>
                  See order
                </Button>
              </div>
            </div>
            <IconButton
              className={page.placedClose}
              label="Close"
              size="sm"
              icon={<X aria-hidden="true" />}
              onClick={() => setPlaced(null)}
            />
          </div>
        )}

        <div ref={tabsAnchorRef} className={page.tabsAnchor} />
        <div className={page.tabsBar}>
          <Tabs id={TABS_ID} tabs={tabs} value={tab} onChange={selectTab} label="Your khata" className={page.tabs} />
        </div>

        <TabPanel tabsId={TABS_ID} value="khata" current={tab} className={page.panel}>
          <h2 className="visually-hidden">Khata</h2>
          <KhataList
            entries={ledger}
            outstanding={customer.outstanding}
            shopName={shop.name}
            openableOrderIds={orderIds}
            onOpenOrder={showOrder}
          />
        </TabPanel>

        <TabPanel tabsId={TABS_ID} value="orders" current={tab} className={page.panel}>
          <h2 className="visually-hidden">Your orders</h2>
          <OrdersList
            orders={orders}
            shop={shop}
            openIds={openOrderIds}
            onToggle={toggleOrder}
            focusOrderId={focusOrderId}
            onFocused={() => setFocusOrderId(null)}
            emptyAction={
              ordering ? (
                <Button variant="primary" icon={<ShoppingBasket aria-hidden="true" />} onClick={() => selectTab("shop")}>
                  Order from the shop
                </Button>
              ) : undefined
            }
          />
        </TabPanel>

        {catalogOn && (
          <TabPanel tabsId={TABS_ID} value="shop" current={tab} className={page.panel}>
            <h2 className="visually-hidden">{ordering ? "Order from the shop" : "The shop's prices"}</h2>
            <ShopCatalog
              products={products.data}
              loading={products.isPending}
              error={products.error}
              onRetry={() => void products.refetch()}
              retrying={products.isFetching}
              cart={cart}
              onSetQuantity={setQuantity}
              ordering={ordering}
              shopName={shop.name}
            />
          </TabPanel>
        )}

        <FindShopCard shop={shop} />
      </main>

      <PortalFooter />

      {showCartBar && (
        <div className={page.cartBar}>
          <div className={page.cartInner} role="region" aria-label="Your order">
            <div className={page.cartSummary}>
              <span className={page.cartCount}>{pluralize(lines.length, "item")}</span>
              <Money value={total} className={page.cartTotal} />
            </div>
            <Button variant="primary" size="lg" className={page.cartButton} iconRight={<ArrowRight aria-hidden="true" />} onClick={openCheckout}>
              Review order
            </Button>
          </div>
        </div>
      )}

      {ordering && (
        <CheckoutSheet
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          shopName={shop.name}
          lines={lines}
          total={total}
          onSetQuantity={setQuantity}
          fulfillment={fulfillment}
          onFulfillmentChange={setFulfillment}
          address={address}
          onAddressChange={setAddress}
          notes={notes}
          onNotesChange={setNotes}
          onSend={send}
          sending={placeOrder.isPending}
          error={placeOrder.error}
        />
      )}
    </div>
  );
}
