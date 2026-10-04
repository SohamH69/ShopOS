import { useAuth } from "../../lib/auth";
import { useDeliveries, usePickups } from "../../lib/queries";

/** Open pickup + delivery orders, for the count next to "Pickups". Undefined until known (or without access). */
export function useOpenOrdersCount(): number | undefined {
  const { can } = useAuth();
  const enabled = can("orders");
  const pickups = usePickups({ enabled, refetchInterval: 60_000 });
  const deliveries = useDeliveries({ enabled, refetchInterval: 60_000 });
  if (!enabled || !pickups.data || !deliveries.data) return undefined;
  return pickups.data.length + deliveries.data.length;
}
