import { Archive, Copy, IndianRupee, Link2, MessageCircle, Pencil, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Menu,
  PageHeader,
  Skeleton,
  TabPanel,
  Tabs,
  useToast,
  type MenuEntry,
} from "../../../components/ui";
import { useNewOrder } from "../../../features/new-order/NewOrderProvider";
import { useOrderDrawer } from "../../../features/order-drawer/OrderDrawerProvider";
import { errorMessage, isApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { formatPhone, formatRelative, telHref } from "../../../lib/format";
import { useCopyToClipboard, useDocumentTitle, useSearchParam } from "../../../lib/hooks";
import {
  useArchiveCustomer,
  useCustomer,
  useCustomerLedger,
  useCustomerOrders,
  useCustomerPayments,
  usePortalLink,
  useResetPortalLink,
} from "../../../lib/queries";
import type { Customer, CustomerPaymentResult } from "../../../lib/types";
import { hasWhatsAppNumber, khataLinkMessage, paymentReminderMessage, waLink } from "../../../lib/whatsapp";
import { BalanceCard } from "./BalanceCard";
import styles from "./CustomerDetailPage.module.css";
import { CustomerFormModal } from "./CustomerFormModal";
import { CustomerOrdersTable, CustomerPaymentsTable } from "./CustomerRecords";
import { KhataLedger } from "./KhataLedger";
import { PromiseModal } from "./PromiseModal";
import { RecordPaymentModal } from "./RecordPaymentModal";

type RecordsTab = "khata" | "orders" | "payments";

const TABS_ID = "customer-records";
const BACK = { to: "/app/customers", label: "Customers" } as const;

function parseCustomerId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseTab(value: string): RecordsTab {
  return value === "orders" || value === "payments" ? value : "khata";
}

function CustomerNotFound() {
  useDocumentTitle("Customer not found");
  return (
    <>
      <PageHeader back={BACK} title="Customer not found" />
      <Card padding="none">
        <EmptyState
          title="We couldn't find this customer."
          description="The link may be wrong. Find them in your customer list instead."
          action={
            <ButtonLink to="/app/customers" variant="primary">
              Go to customers
            </ButtonLink>
          }
        />
      </Card>
    </>
  );
}

function CustomerSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading customer">
      <div className={styles.skeletonHeader}>
        <Skeleton width={90} height={14} />
        <Skeleton width={260} height={32} />
        <Skeleton width={220} height={14} />
      </div>
      <div className={styles.stack}>
        <div className={styles.skeletonCard}>
          <Skeleton width={90} height={13} />
          <Skeleton width={180} height={44} />
          <Skeleton width="70%" height={14} />
        </div>
        <Skeleton height={44} />
        <Skeleton height={240} radius={10} />
      </div>
    </div>
  );
}

/** The digital khata for one customer: balance, promise, ledger, orders and payments. */
export default function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = parseCustomerId(id);
  if (customerId === null) return <CustomerNotFound />;
  // A fresh view per customer, so dialogs and the khata's paging never carry over.
  return <CustomerView key={customerId} customerId={customerId} />;
}

function CustomerView({ customerId }: { customerId: number }) {
  const customerQuery = useCustomer(customerId);
  const customer = customerQuery.data;
  useDocumentTitle(customer?.name ?? "Customer");

  if (!customer) {
    if (customerQuery.isError) {
      if (isApiError(customerQuery.error) && customerQuery.error.status === 404) return <CustomerNotFound />;
      return (
        <>
          <PageHeader back={BACK} title="Customer" />
          <Card padding="none">
            <ErrorState
              title="This customer didn't load"
              error={customerQuery.error}
              onRetry={() => void customerQuery.refetch()}
              retrying={customerQuery.isFetching}
            />
          </Card>
        </>
      );
    }
    return <CustomerSkeleton />;
  }

  return <CustomerKhata customer={customer} />;
}

function CustomerKhata({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { can, shop } = useAuth();
  const { openOrder } = useOrderDrawer();
  const { openNewOrder } = useNewOrder();
  const ledgerQuery = useCustomerLedger(customer.id);
  const ordersQuery = useCustomerOrders(customer.id);
  const paymentsQuery = useCustomerPayments(customer.id);
  const archive = useArchiveCustomer();
  const portalLink = usePortalLink(customer.id);
  const resetLink = useResetPortalLink();
  const { copy } = useCopyToClipboard();
  const [resetOpen, setResetOpen] = useState(false);
  const khataUrl = portalLink.data ? `${window.location.origin}${portalLink.data.path}` : undefined;
  const lastSeen = portalLink.data?.last_seen_at;

  const [tabParam, setTabParam] = useSearchParam("tab", "khata");
  const tab = parseTab(tabParam);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [promiseOpen, setPromiseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [settleKey, setSettleKey] = useState(0);

  const canOrder = can("orders");
  const onOpenOrder = canOrder ? openOrder : undefined;
  const hasDues = customer.outstanding > 0;
  const newOrder = () => openNewOrder({ customerId: customer.id });

  let reminderBlocked: string | null = null;
  if (!hasDues) reminderBlocked = "Nothing is due";
  else if (!hasWhatsAppNumber(customer.phone)) reminderBlocked = "No WhatsApp number saved";

  const menuItems: MenuEntry[] = [
    { label: "Edit details", icon: <Pencil />, onSelect: () => setEditOpen(true) },
    {
      label: "Send payment reminder",
      icon: <MessageCircle />,
      href: shop && !reminderBlocked ? waLink(customer.phone, paymentReminderMessage(customer, shop, khataUrl)) : undefined,
      newTab: true,
      disabled: reminderBlocked !== null || !shop,
      hint: reminderBlocked ?? "Opens WhatsApp with the message ready",
    },
    { type: "separator" },
    { type: "label", label: lastSeen ? `Khata link opened ${formatRelative(lastSeen)}` : "Khata link not opened yet" },
    {
      label: "Share khata link",
      icon: <Link2 />,
      href:
        shop && khataUrl && hasWhatsAppNumber(customer.phone)
          ? waLink(customer.phone, khataLinkMessage(customer.name, shop, khataUrl))
          : undefined,
      newTab: true,
      disabled: !khataUrl || !hasWhatsAppNumber(customer.phone),
      hint: !hasWhatsAppNumber(customer.phone) ? "No WhatsApp number saved" : "Their dues, orders and a UPI Pay button",
    },
    {
      label: "Copy khata link",
      icon: <Copy />,
      disabled: !khataUrl,
      onSelect: () => {
        if (!khataUrl) return;
        void copy(khataUrl).then((ok) =>
          ok ? toast.success("Khata link copied") : toast.error("Couldn't copy the link"),
        );
      },
    },
    { label: "Reset khata link", icon: <RotateCcw />, onSelect: () => setResetOpen(true) },
    { type: "separator" },
    {
      label: "Archive customer",
      icon: <Archive />,
      tone: "danger",
      onSelect: () => {
        setArchiveError(null);
        setArchiveOpen(true);
      },
    },
  ];

  const handleRecorded = (result: CustomerPaymentResult) => {
    if (result.outstanding <= 0) setSettleKey((key) => key + 1);
  };

  const handleArchive = () => {
    archive.mutate(customer.id, {
      onSuccess: () => {
        toast.success("Customer archived", { description: `${customer.name} is hidden from your customer list.` });
        setArchiveOpen(false);
        navigate("/app/customers", { replace: true });
      },
      onError: (error) => setArchiveError(errorMessage(error)),
    });
  };

  const newOrderButton = canOrder ? (
    <Button icon={<Plus aria-hidden="true" />} onClick={newOrder}>
      New order
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader
        back={BACK}
        title={customer.name}
        description={
          <span className={styles.contact}>
            <a href={telHref(customer.phone)} className={styles.phone}>
              {formatPhone(customer.phone)}
            </a>
            {customer.address && (
              <>
                <span aria-hidden="true" className={styles.dot}>
                  ·
                </span>
                <span className={styles.address}>{customer.address}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Button
              variant="primary"
              icon={<IndianRupee aria-hidden="true" />}
              disabled={!hasDues}
              onClick={() => setPaymentOpen(true)}
            >
              Record payment
            </Button>
            {newOrderButton}
            <Menu label={`More actions for ${customer.name}`} items={menuItems} />
          </>
        }
      />

      <div className={styles.stack}>
        <BalanceCard customer={customer} settleKey={settleKey} onEditPromise={() => setPromiseOpen(true)} />

        <div className={styles.records}>
          <Tabs<RecordsTab>
            id={TABS_ID}
            label="Customer records"
            value={tab}
            onChange={(next) => setTabParam(next)}
            tabs={[
              { value: "khata", label: "Khata" },
              { value: "orders", label: "Orders", count: ordersQuery.data?.length },
              { value: "payments", label: "Payments", count: paymentsQuery.data?.length },
            ]}
          />
          <TabPanel tabsId={TABS_ID} value="khata" current={tab} className={styles.panel}>
            <KhataLedger
              ledger={ledgerQuery.data}
              error={ledgerQuery.error}
              onRetry={() => void ledgerQuery.refetch()}
              customerName={customer.name}
              onOpenOrder={onOpenOrder}
              emptyAction={newOrderButton}
            />
          </TabPanel>
          <TabPanel tabsId={TABS_ID} value="orders" current={tab} className={styles.panel}>
            <CustomerOrdersTable
              orders={ordersQuery.data}
              error={ordersQuery.error}
              onRetry={() => void ordersQuery.refetch()}
              onOpenOrder={onOpenOrder}
              emptyAction={newOrderButton}
            />
          </TabPanel>
          <TabPanel tabsId={TABS_ID} value="payments" current={tab} className={styles.panel}>
            <CustomerPaymentsTable
              payments={paymentsQuery.data}
              error={paymentsQuery.error}
              onRetry={() => void paymentsQuery.refetch()}
              onOpenOrder={onOpenOrder}
            />
          </TabPanel>
        </div>
      </div>

      <RecordPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        customer={customer}
        orders={ordersQuery.data}
        onRecorded={handleRecorded}
      />
      <PromiseModal open={promiseOpen} onClose={() => setPromiseOpen(false)} customer={customer} />
      <CustomerFormModal open={editOpen} onClose={() => setEditOpen(false)} customer={customer} />
      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the khata link?"
        description={`Links you sent ${customer.name} before stop working. Share the new link with them.`}
        confirmLabel="Reset link"
        loading={resetLink.isPending}
        error={resetLink.isError ? errorMessage(resetLink.error) : undefined}
        onConfirm={() =>
          resetLink.mutate(customer.id, {
            onSuccess: () => {
              setResetOpen(false);
              toast.success("New khata link ready", { description: "Share it from this page's menu." });
            },
          })
        }
      />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
        title={`Archive ${customer.name}?`}
        description="They will be hidden from your customer list and search. Their past orders stay as they are."
        confirmLabel="Archive customer"
        loading={archive.isPending}
        error={archiveError}
      />
    </>
  );
}
