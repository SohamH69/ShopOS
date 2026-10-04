// The new order sheet is global: open it with useNewOrder().openNewOrder(initial?) from anywhere in
// the app shell, with the N key, or by visiting /app?new=1 (the PWA "New order" shortcut).

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Drawer, isAnyOverlayOpen, Skeleton } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { onIdle, useHotkey } from "../../lib/hooks";
import type { Channel, Fulfillment, OrderItemInput } from "../../lib/types";

const loadNewOrderSheet = () => import("./NewOrderSheet");
const NewOrderSheet = lazy(loadNewOrderSheet);

/** Prefill for the sheet, e.g. from a customer page ("New order") or "Repeat order". */
export type NewOrderInitial = {
  customerId?: number;
  items?: OrderItemInput[];
  fulfillment?: Fulfillment;
  channel?: Channel;
};

export interface NewOrderContextValue {
  isOpen: boolean;
  openNewOrder: (initial?: NewOrderInitial) => void;
  closeNewOrder: () => void;
}

interface SheetState {
  open: boolean;
  initial?: NewOrderInitial;
  /** Bumped on every open; the sheet is remounted per session so its form starts fresh. */
  session: number;
}

const NewOrderContext = createContext<NewOrderContextValue | null>(null);
const SheetStateContext = createContext<SheetState | null>(null);

export function NewOrderProvider({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const canOrder = can("orders");
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<SheetState>({ open: false, session: 0 });

  const openNewOrder = useCallback((initial?: NewOrderInitial) => {
    setState((previous) => ({ open: true, initial, session: previous.session + 1 }));
  }, []);

  const closeNewOrder = useCallback(() => {
    setState((previous) => (previous.open ? { ...previous, open: false } : previous));
  }, []);

  // /app?new=1 opens the sheet once, then the param is removed so a refresh doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("new") !== "1") return;
    params.delete("new");
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash },
      { replace: true, state: location.state },
    );
    if (canOrder) openNewOrder();
  }, [location, navigate, canOrder, openNewOrder]);

  // N starts a new order — not while typing, and not over another dialog.
  useHotkey(
    "n",
    () => {
      if (!isAnyOverlayOpen()) openNewOrder();
    },
    { enabled: canOrder },
  );

  useEffect(() => {
    if (!canOrder) return undefined;
    return onIdle(() => {
      void loadNewOrderSheet();
    });
  }, [canOrder]);

  const value = useMemo<NewOrderContextValue>(
    () => ({ isOpen: state.open, openNewOrder, closeNewOrder }),
    [state.open, openNewOrder, closeNewOrder],
  );

  return (
    <NewOrderContext.Provider value={value}>
      <SheetStateContext.Provider value={state}>{children}</SheetStateContext.Provider>
    </NewOrderContext.Provider>
  );
}

/** `const { openNewOrder } = useNewOrder(); openNewOrder({ customerId: 12 })`. Available inside the app shell. */
export function useNewOrder(): NewOrderContextValue {
  const context = useContext(NewOrderContext);
  if (!context) throw new Error("useNewOrder must be used inside the app shell (NewOrderProvider).");
  return context;
}

function NewOrderFallback({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title="New order" width={640}>
      <div style={{ display: "grid", gap: 14 }} aria-busy="true">
        <Skeleton height={40} />
        <Skeleton height={40} />
        <Skeleton height={120} />
      </div>
    </Drawer>
  );
}

/** Renders the sheet. Mounted once by AppShell inside both overlay providers. */
export function NewOrderHost() {
  const state = useContext(SheetStateContext);
  const { closeNewOrder } = useNewOrder();
  const open = state?.open ?? false;
  const [activated, setActivated] = useState(open);
  if (open && !activated) setActivated(true);
  if (!state || !activated) return null;
  return (
    <Suspense fallback={<NewOrderFallback open={open} onClose={closeNewOrder} />}>
      <NewOrderSheet key={state.session} open={open} initial={state.initial} onClose={closeNewOrder} />
    </Suspense>
  );
}
