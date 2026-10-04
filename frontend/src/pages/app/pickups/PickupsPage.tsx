import { MapPin, MessageCircle, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  PaymentStatusBadge,
  Skeleton,
  TabPanel,
  Tabs,
} from "../../../components/ui";
import { useNewOrder } from "../../../features/new-order/NewOrderProvider";
import { useOrderDrawer } from "../../../features/order-drawer/OrderDrawerProvider";
import { nextActionFor, useChangeOrderStatus, useOpenOrderAtPayment } from "../../../features/order-drawer/orderFlow";
import { useAuth } from "../../../lib/auth";
import { ORDER_STATUS_LABEL } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { formatDue, formatItemsSummary, formatRelative, orderNo } from "../../../lib/format";
import { useDocumentTitle } from "../../../lib/hooks";
import { useDeliveries, usePickups } from "../../../lib/queries";
import type { Order, OrderStatus } from "../../../lib/types";
import { hasWhatsAppNumber, pickupReadyMessage, waLink } from "../../../lib/whatsapp";
import { useNow } from "../dashboard/useNow";
import styles from "./PickupsPage.module.css";

type Tab = "pickups" | "deliveries";

const TABS_ID = "fulfillment-tabs";
/** Most urgent first: ready orders are waiting on the customer right now. */
const COLUMNS: { status: OrderStatus; hint: string }[] = [
  { status: "ready", hint: "Packed and waiting" },
  { status: "preparing", hint: "Being packed" },
  { status: "new", hint: "Not started" },
];

function OrderCard({ order, now, kind }: { order: Order; now: number; kind: Tab }) {
  const { shop } = useAuth();
  const { openOrder } = useOrderDrawer();
  const openAtPayment = useOpenOrderAtPayment();
  const { change, pendingStatus } = useChangeOrderStatus();
  const action = nextActionFor(order);
  const due = formatDue(order.due_at, now);
  const pending = pendingStatus(order.id) !== undefined;
  const canMessage = order.status === "ready" && shop !== null && hasWhatsAppNumber(order.customer_phone);

  const runAction = () => {
    if (!action) return;
    if (action.kind === "collect") openAtPayment(order.id);
    else void change(order, action.status);
  };

  return (
    <article className={cx(styles.card, order.is_overdue && styles.cardOverdue)}>
      <button type="button" className={styles.open} onClick={() => openOrder(order.id)}>
        <span className={styles.cardHead}>
          <span className={styles.customer}>{order.customer_name ?? "Walk-in"}</span>
          <span className={cx(styles.number, "mono")}>{orderNo(order.number)}</span>
        </span>
        <span className={styles.items}>{formatItemsSummary(order.items)}</span>
        <span className={styles.money}>
          <Money value={order.total} />
          <PaymentStatusBadge status={order.payment_status} />
        </span>
        <span className={cx(styles.when, due?.overdue && styles.overdue)}>
          {due ? due.text : `Ordered ${formatRelative(order.created_at, now)}`}
        </span>
        {kind === "deliveries" && order.delivery_address && (
          <span className={styles.address}>
            <MapPin size={14} aria-hidden="true" />
            {order.delivery_address}
          </span>
        )}
      </button>
      {(action || canMessage) && (
        <div className={styles.actions}>
          {action && (
            <Button
              size="sm"
              variant={order.status === "ready" ? "primary" : "secondary"}
              loading={pending}
              onClick={runAction}
            >
              {action.label}
            </Button>
          )}
          {canMessage && shop && (
            <ButtonLink
              href={waLink(order.customer_phone, pickupReadyMessage(order, shop))}
              newTab
              size="sm"
              variant="ghost"
              icon={<MessageCircle aria-hidden="true" />}
            >
              Tell customer
            </ButtonLink>
          )}
        </div>
      )}
    </article>
  );
}

function Board({ orders, now, kind }: { orders: Order[]; now: number; kind: Tab }) {
  return (
    <div className={styles.board}>
      {COLUMNS.map(({ status, hint }) => {
        const group = orders.filter((order) => order.status === status);
        const headingId = `${kind}-${status}`;
        return (
          <section key={status} className={cx(styles.column, status === "ready" && styles.columnReady)} aria-labelledby={headingId}>
            <header className={styles.columnHead}>
              <h2 id={headingId} className={styles.columnTitle}>
                {ORDER_STATUS_LABEL[status]}
                <span className={styles.columnCount}>{group.length}</span>
              </h2>
              <span className={styles.columnHint}>{hint}</span>
            </header>
            {group.length === 0 ? (
              <p className={styles.columnEmpty}>Nothing here.</p>
            ) : (
              <ul className={styles.cards}>
                {group.map((order) => (
                  <li key={order.id}>
                    <OrderCard order={order} now={now} kind={kind} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className={styles.board} aria-hidden="true">
      {COLUMNS.map(({ status }) => (
        <div key={status} className={styles.column}>
          <Skeleton width={110} height={18} />
          {[0, 1].map((index) => (
            <div key={index} className={styles.card}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="85%" height={12} />
              <Skeleton width={90} height={12} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function PickupsPage() {
  useDocumentTitle("Pickups & deliveries");
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "deliveries" ? "deliveries" : "pickups";
  const pickups = usePickups();
  const deliveries = useDeliveries();
  const { openNewOrder } = useNewOrder();
  const now = useNow();

  const setTab = (next: Tab) => {
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        if (next === "deliveries") updated.set("tab", "deliveries");
        else updated.delete("tab");
        return updated;
      },
      { replace: true },
    );
  };

  const query = tab === "pickups" ? pickups : deliveries;

  return (
    <>
      <PageHeader
        title="Pickups & deliveries"
        description="Orders customers will collect, and orders going out."
        actions={
          <Button icon={<Plus aria-hidden="true" />} onClick={() => openNewOrder({ fulfillment: tab === "deliveries" ? "delivery" : "pickup" })}>
            New order
          </Button>
        }
      >
        <Tabs
          id={TABS_ID}
          label="Pickups or deliveries"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "pickups", label: "Pickups", count: pickups.data?.length },
            { value: "deliveries", label: "Deliveries", count: deliveries.data?.length },
          ]}
        />
      </PageHeader>

      <TabPanel tabsId={TABS_ID} value={tab} current={tab}>
        {query.isPending ? (
          <BoardSkeleton />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : query.data.length === 0 ? (
          <EmptyState
            title={tab === "pickups" ? "No pickups waiting." : "No deliveries pending."}
            description={
              tab === "pickups"
                ? "New orders marked for pickup show up here, ready first."
                : "Orders marked for delivery show up here until they're delivered."
            }
            action={
              <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => openNewOrder({ fulfillment: tab === "deliveries" ? "delivery" : "pickup" })}>
                New order
              </Button>
            }
          />
        ) : (
          <Board orders={query.data} now={now} kind={tab} />
        )}
      </TabPanel>
    </>
  );
}
