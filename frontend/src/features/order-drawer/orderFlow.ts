// Order actions shared by the order drawer, the pickups board and the new order sheet:
// the next step for an order, status changes (toast + Undo), opening an order straight at its
// payment form, and the payment method this device used last.

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useToast } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { completedStatusFor, ORDER_STATUS_ACTION, ORDER_STATUS_DONE } from "../../lib/constants";
import { formatMoney, orderNo } from "../../lib/format";
import { useUpdateOrderStatus } from "../../lib/queries";
import type { Fulfillment, Order, OrderDetail, OrderStatus, PaymentMethod } from "../../lib/types";
import { syncOpenOrderLists } from "./orderCache";
import { useOrderDrawer } from "./OrderDrawerProvider";

// ---------------------------------------------------------------------------
// What happens next
// ---------------------------------------------------------------------------

export type NextAction =
  | { kind: "status"; status: OrderStatus; label: string }
  | { kind: "collect"; amount: number; label: string };

type ActionSubject = Pick<Order, "status" | "fulfillment" | "outstanding">;

/**
 * The one obvious next step for an open order: start preparing, mark ready, then either collect
 * what's due or hand it over. Null for completed and cancelled orders.
 */
export function nextActionFor(order: ActionSubject): NextAction | null {
  switch (order.status) {
    case "new":
      return { kind: "status", status: "preparing", label: ORDER_STATUS_ACTION.preparing };
    case "preparing":
      return { kind: "status", status: "ready", label: ORDER_STATUS_ACTION.ready };
    case "ready": {
      if (order.outstanding > 0) {
        return { kind: "collect", amount: order.outstanding, label: `Collect ${formatMoney(order.outstanding)}` };
      }
      const done = completedStatusFor(order.fulfillment);
      return { kind: "status", status: done, label: ORDER_STATUS_ACTION[done] };
    }
    default:
      return null;
  }
}

/** Mirrors the server's allowed moves (SPEC §2) for when OrderDetail.next_statuses hasn't loaded yet. */
export function allowedNextStatuses(status: OrderStatus, fulfillment: Fulfillment): OrderStatus[] {
  const done = completedStatusFor(fulfillment);
  switch (status) {
    case "new":
      return ["preparing", "ready", done, "cancelled"];
    case "preparing":
      return ["new", "ready", done, "cancelled"];
    case "ready":
      return ["preparing", done, "cancelled"];
    case "collected":
    case "delivered":
      return ["ready"];
    case "cancelled":
      return ["new"];
  }
}

const PREVIOUS_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  preparing: "new",
  ready: "preparing",
  collected: "ready",
  delivered: "ready",
};

/** One step back along the track, to undo a mistaken tap. */
export function previousStatusFor(status: OrderStatus): OrderStatus | null {
  return PREVIOUS_STATUS[status] ?? null;
}

/** "#1045 · Rahul Sharma" (or "Walk-in"). */
export function orderLabel(order: Pick<Order, "number" | "customer_name">): string {
  return `${orderNo(order.number)} · ${order.customer_name ?? "Walk-in"}`;
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

export interface ChangeStatusOptions {
  /** Offer "Undo" in the success toast when the move can be reversed. Default true. */
  undoable?: boolean;
  /** Report a failure here (e.g. inside a confirm dialog) instead of in a toast. */
  onError?: (message: string) => void;
}

type StatusSubject = Pick<Order, "id" | "number" | "status" | "customer_name">;

/**
 * Moves orders between statuses with a toast that reuses the button's verb ("Marked ready") and an
 * Undo. The pickups board and deliveries list update at once, before the refetch lands.
 */
export function useChangeOrderStatus() {
  const { mutateAsync } = useUpdateOrderStatus();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Readonly<Record<number, OrderStatus>>>({});

  async function change(order: StatusSubject, status: OrderStatus, options: ChangeStatusOptions = {}): Promise<OrderDetail | null> {
    const from = order.status;
    setPending((current) => ({ ...current, [order.id]: status }));
    try {
      const updated = await mutateAsync({ orderId: order.id, status });
      syncOpenOrderLists(queryClient, updated);
      const canUndo = options.undoable !== false && updated.next_statuses.includes(from);
      toast.success(ORDER_STATUS_DONE[status], {
        description: orderLabel(updated),
        action: canUndo
          ? {
              label: "Undo",
              onClick: () => {
                void change(updated, from, { undoable: false });
              },
            }
          : undefined,
      });
      return updated;
    } catch (error) {
      const message = errorMessage(error);
      if (options.onError) options.onError(message);
      else toast.error(message, { description: orderLabel(order) });
      return null;
    } finally {
      setPending((current) => {
        const next: Record<number, OrderStatus> = { ...current };
        delete next[order.id];
        return next;
      });
    }
  }

  return {
    change,
    /** The status an order is being moved to right now, if any. */
    pendingStatus: (orderId: number): OrderStatus | undefined => pending[orderId],
  };
}

// ---------------------------------------------------------------------------
// "Collect ₹X" on the pickups board → the drawer opens on its payment form
// ---------------------------------------------------------------------------

let paymentFocusRequest: number | null = null;

/** Opens the order drawer with the "Collect payment" amount focused and ready to type. */
export function useOpenOrderAtPayment(): (orderId: number) => void {
  const { openOrder } = useOrderDrawer();
  return useCallback(
    (orderId: number) => {
      paymentFocusRequest = orderId;
      openOrder(orderId);
    },
    [openOrder],
  );
}

/** True once for the order that was opened with useOpenOrderAtPayment. */
export function takePaymentFocusRequest(orderId: number): boolean {
  const requested = paymentFocusRequest === orderId;
  paymentFocusRequest = null;
  return requested;
}

// ---------------------------------------------------------------------------
// Payment method memory (a per-device convenience: most counters mostly take one method)
// ---------------------------------------------------------------------------

const METHOD_STORAGE_KEY = "shopos.lastPaymentMethod";
const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "upi", "card", "bank_transfer"];

function isPaymentMethod(value: string | null): value is PaymentMethod {
  return value !== null && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function lastPaymentMethod(): PaymentMethod {
  try {
    const stored = window.localStorage.getItem(METHOD_STORAGE_KEY);
    return isPaymentMethod(stored) ? stored : "cash";
  } catch {
    return "cash";
  }
}

export function rememberPaymentMethod(method: PaymentMethod): void {
  try {
    window.localStorage.setItem(METHOD_STORAGE_KEY, method);
  } catch {
    // Storage blocked: the next form simply starts on Cash.
  }
}
