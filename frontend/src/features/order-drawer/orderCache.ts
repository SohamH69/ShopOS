// Small helpers over the TanStack cache so order screens feel instant:
// - findCachedOrder: the drawer can draw an order it has already seen in a list while the full
//   record (payments, allowed moves) loads.
// - syncOpenOrderLists: a status change moves the card on the pickups board right away instead of
//   waiting for the refetch.

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { isOpenStatus } from "../../lib/constants";
import { queryKeys } from "../../lib/queries";
import type { Fulfillment, Order } from "../../lib/types";

// Queries whose data can contain orders: order lists and details, Today, global search, customer orders.
const ORDER_SOURCES = [["orders"], ["dashboard"], ["search"], ["customers"]] as const;
const MAX_DEPTH = 4;

function isOrder(value: unknown): value is Order {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "number" &&
    typeof record.number === "number" &&
    typeof record.status === "string" &&
    typeof record.payment_status === "string" &&
    Array.isArray(record.items)
  );
}

function findOrderIn(value: unknown, id: number, depth: number): Order | undefined {
  if (depth > MAX_DEPTH || typeof value !== "object" || value === null) return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findOrderIn(entry, id, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  // An order is a leaf: its lines are not orders.
  if (isOrder(value)) return value.id === id ? value : undefined;
  for (const entry of Object.values(value)) {
    const found = findOrderIn(entry, id, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** The most recent copy of an order anywhere in the cache (lists, Today, search), if any. */
export function findCachedOrder(client: QueryClient, id: number): Order | undefined {
  for (const queryKey of ORDER_SOURCES) {
    for (const [, data] of client.getQueriesData({ queryKey })) {
      const found = findOrderIn(data, id, 0);
      if (found) return found;
    }
  }
  return undefined;
}

/** findCachedOrder as a hook; looks once per order id. */
export function useCachedOrder(id: number | null, enabled: boolean): Order | undefined {
  const client = useQueryClient();
  return useMemo(() => (enabled && id !== null ? findCachedOrder(client, id) : undefined), [client, id, enabled]);
}

const OPEN_LISTS: ReadonlyArray<readonly [Fulfillment, readonly unknown[]]> = [
  ["pickup", queryKeys.pickups],
  ["delivery", queryKeys.deliveries],
];

/**
 * Puts a changed order into the cached pickups / deliveries lists (or takes it out once it's no
 * longer open). New orders are left to the refetch that follows every mutation.
 */
export function syncOpenOrderLists(client: QueryClient, order: Order): void {
  for (const [fulfillment, queryKey] of OPEN_LISTS) {
    client.setQueryData<Order[]>(queryKey, (list) => {
      if (!list) return list;
      const index = list.findIndex((entry) => entry.id === order.id);
      if (index === -1) return list;
      if (!isOpenStatus(order.status) || order.fulfillment !== fulfillment) {
        return list.filter((entry) => entry.id !== order.id);
      }
      const next = list.slice();
      next[index] = order;
      return next;
    });
  }
}
