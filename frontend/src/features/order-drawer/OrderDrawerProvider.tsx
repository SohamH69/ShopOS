// The order drawer is global: any app page can call useOrderDrawer().openOrder(id).
// Its state lives in the URL (?order=<id>) so it is linkable and survives a refresh;
// opening pushes a history entry, so the phone's back button closes it.

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Drawer, Skeleton } from "../../components/ui";
import { onIdle } from "../../lib/hooks";

const loadOrderDrawer = () => import("./OrderDrawer");
const OrderDrawer = lazy(loadOrderDrawer);

export interface OrderDrawerContextValue {
  /** The order shown in the drawer, or null when it is closed. */
  orderId: number | null;
  openOrder: (id: number) => void;
  closeOrder: () => void;
}

const OrderDrawerContext = createContext<OrderDrawerContextValue | null>(null);

const PARAM = "order";
// Marks history entries created by openOrder, so closing can step back instead of stacking entries.
const PUSHED_FLAG = "shoposOrderDrawer";

function parseOrderId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function OrderDrawerProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const orderId = parseOrderId(new URLSearchParams(location.search).get(PARAM));

  const openOrder = useCallback(
    (id: number) => {
      const params = new URLSearchParams(location.search);
      const alreadyOpen = params.has(PARAM);
      if (params.get(PARAM) === String(id)) return;
      params.set(PARAM, String(id));
      const baseState = isRecord(location.state) ? location.state : {};
      navigate(
        { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
        alreadyOpen ? { replace: true, state: location.state } : { state: { ...baseState, [PUSHED_FLAG]: true } },
      );
    },
    [location, navigate],
  );

  const closeOrder = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has(PARAM)) return;
    if (isRecord(location.state) && location.state[PUSHED_FLAG] === true) {
      navigate(-1);
      return;
    }
    params.delete(PARAM);
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash },
      { replace: true, state: location.state },
    );
  }, [location, navigate]);

  // Fetch the drawer's code in the background so the first open is instant.
  useEffect(
    () =>
      onIdle(() => {
        void loadOrderDrawer();
      }),
    [],
  );

  const value = useMemo<OrderDrawerContextValue>(() => ({ orderId, openOrder, closeOrder }), [orderId, openOrder, closeOrder]);
  return <OrderDrawerContext.Provider value={value}>{children}</OrderDrawerContext.Provider>;
}

/** `const { openOrder } = useOrderDrawer(); openOrder(order.id)`. Available on every page inside the app shell. */
export function useOrderDrawer(): OrderDrawerContextValue {
  const context = useContext(OrderDrawerContext);
  if (!context) throw new Error("useOrderDrawer must be used inside the app shell (OrderDrawerProvider).");
  return context;
}

function OrderDrawerFallback({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title="Order">
      <div style={{ display: "grid", gap: 14 }} aria-busy="true">
        <Skeleton width="45%" height={22} />
        <Skeleton height={56} />
        <Skeleton width="70%" />
        <Skeleton width="55%" />
        <Skeleton height={120} />
      </div>
    </Drawer>
  );
}

/** Renders the drawer. Mounted once by AppShell inside both overlay providers. */
export function OrderDrawerHost() {
  const { orderId, closeOrder } = useOrderDrawer();
  // Load the drawer only after it is first needed, then keep it mounted so it can animate out.
  const [activated, setActivated] = useState(orderId !== null);
  if (orderId !== null && !activated) setActivated(true);
  if (!activated) return null;
  return (
    <Suspense fallback={<OrderDrawerFallback open={orderId !== null} onClose={closeOrder} />}>
      <OrderDrawer orderId={orderId} onClose={closeOrder} />
    </Suspense>
  );
}
