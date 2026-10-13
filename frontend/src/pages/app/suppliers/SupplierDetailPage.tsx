import { HandCoins, PackagePlus, Pencil, Phone } from "lucide-react";
import { useParams } from "react-router-dom";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorState,
  Menu,
  Money,
  PageHeader,
  Skeleton,
  TabPanel,
  Tabs,
  type DataColumn,
  type DescriptionItem,
} from "../../../components/ui";
import { METHOD_LABEL } from "../../../lib/constants";
import { formatDate, formatPhone, formatTime, telHref } from "../../../lib/format";
import { useDocumentTitle, useSearchParam } from "../../../lib/hooks";
import { roundMoney } from "../../../lib/money";
import { useSupplier } from "../../../lib/queries";
import type { SupplierDetail, SupplierPayment } from "../../../lib/types";
import { parseId } from "../products/urlState";
import { useDialogState } from "../products/useDialogState";
import { PaySupplierModal } from "./PaySupplierModal";
import { PurchaseList } from "./PurchaseList";
import { RecordPurchaseDrawer } from "./RecordPurchaseDrawer";
import styles from "./SupplierDetailPage.module.css";
import { SupplierFormModal } from "./SupplierFormModal";

type SupplierDialog = "purchase" | "pay" | "edit";
type SupplierTab = "purchases" | "payments";

const TABS_ID = "supplier-history";
const BACK = { to: "/app/suppliers", label: "Suppliers" };

export default function SupplierDetailPage() {
  const params = useParams();
  const supplierId = parseId(params.id);
  const supplierQuery = useSupplier(supplierId);
  const supplier = supplierQuery.data;
  const [tabParam, setTab] = useSearchParam("tab", "purchases");
  const tab: SupplierTab = tabParam === "payments" ? "payments" : "purchases";
  const dialog = useDialogState<SupplierDialog>();
  useDocumentTitle(supplier?.name ?? "Supplier");

  if (supplierId === null) {
    return (
      <>
        <PageHeader back={BACK} title="Supplier not found" />
        <Card padding="none">
          <EmptyState
            title="This supplier doesn't exist."
            description="The link may be wrong. Pick the supplier from your list instead."
            action={<ButtonLink to="/app/suppliers">Back to suppliers</ButtonLink>}
          />
        </Card>
      </>
    );
  }

  if (!supplier) {
    if (supplierQuery.isError) {
      return (
        <>
          <PageHeader back={BACK} title="Supplier" />
          <Card padding="none">
            <ErrorState
              error={supplierQuery.error}
              onRetry={() => void supplierQuery.refetch()}
              retrying={supplierQuery.isFetching}
            />
          </Card>
        </>
      );
    }
    return <DetailSkeleton />;
  }

  const owes = supplier.outstanding > 0;
  const current = dialog.state;

  return (
    <>
      <PageHeader
        back={BACK}
        title={supplier.name}
        description={<SupplierLine supplier={supplier} />}
        actions={
          <>
            <Button variant="primary" icon={<PackagePlus aria-hidden="true" />} onClick={() => dialog.show("purchase")}>
              Record purchase
            </Button>
            <Button
              icon={<HandCoins aria-hidden="true" />}
              onClick={() => dialog.show("pay")}
              disabled={!owes}
              title={owes ? undefined : "You don't owe this supplier anything right now"}
            >
              Pay supplier
            </Button>
            <Menu
              label="More actions"
              items={[
                { label: "Edit details", icon: <Pencil />, onSelect: () => dialog.show("edit") },
                { label: `Call ${formatPhone(supplier.phone)}`, icon: <Phone />, href: telHref(supplier.phone) },
              ]}
            />
          </>
        }
      />

      <div className={styles.body}>
        <div className={styles.top}>
          <BalanceCard supplier={supplier} />
          <DetailsCard supplier={supplier} />
        </div>

        <section className={styles.history} aria-label="Purchases and payments">
          <Tabs
            id={TABS_ID}
            label="Purchases and payments"
            value={tab}
            onChange={(value) => setTab(value)}
            tabs={[
              { value: "purchases", label: "Purchases", count: supplier.purchases.length },
              { value: "payments", label: "Payments", count: supplier.payments.length },
            ]}
          />
          <TabPanel tabsId={TABS_ID} value="purchases" current={tab}>
            <PurchaseList
              purchases={supplier.purchases}
              supplierName={supplier.name}
              onRecordPurchase={() => dialog.show("purchase")}
            />
          </TabPanel>
          <TabPanel tabsId={TABS_ID} value="payments" current={tab}>
            <Card padding="none">
              <DataTable
                framed={false}
                caption={`Payments to ${supplier.name}`}
                columns={PAYMENT_COLUMNS}
                rows={supplier.payments}
                rowKey={(payment) => payment.id}
                empty={
                  <EmptyState
                    title="No payments yet."
                    description={`Money you pay ${supplier.name} shows up here.`}
                    action={
                      owes ? (
                        <Button icon={<HandCoins aria-hidden="true" />} onClick={() => dialog.show("pay")}>
                          Pay supplier
                        </Button>
                      ) : undefined
                    }
                  />
                }
              />
            </Card>
          </TabPanel>
        </section>
      </div>

      {current?.value === "purchase" && (
        <RecordPurchaseDrawer key={current.key} open={current.open} onClose={dialog.close} supplier={supplier} />
      )}
      {current?.value === "pay" && (
        <PaySupplierModal key={current.key} open={current.open} onClose={dialog.close} supplier={supplier} />
      )}
      {current?.value === "edit" && (
        <SupplierFormModal key={current.key} open={current.open} onClose={dialog.close} supplier={supplier} />
      )}
    </>
  );
}

function SupplierLine({ supplier }: { supplier: SupplierDetail }) {
  return (
    <>
      <a href={telHref(supplier.phone)} className={styles.phone}>
        {formatPhone(supplier.phone)}
      </a>
      {supplier.supplies && <> · {supplier.supplies}</>}
    </>
  );
}

function BalanceCard({ supplier }: { supplier: SupplierDetail }) {
  // Whatever isn't explained by purchases and payments was owed before (the opening balance).
  const opening = roundMoney(supplier.outstanding - supplier.total_purchased + supplier.total_paid);
  return (
    <Card>
      <div className={styles.balanceMain}>
        <span className={styles.label}>You owe</span>
        {supplier.outstanding > 0 ? (
          <Money value={supplier.outstanding} tone="margin" display />
        ) : (
          <span className={styles.settled}>Settled</span>
        )}
        <span className={styles.balanceHint}>
          {supplier.outstanding > 0 ? "Pay it all at once or in parts." : "Nothing to pay right now."}
        </span>
      </div>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Total purchased</dt>
          <dd>
            <Money value={supplier.total_purchased} />
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Paid</dt>
          <dd>
            <Money value={supplier.total_paid} />
          </dd>
        </div>
        {opening > 0 && (
          <div className={styles.fact}>
            <dt>Opening balance</dt>
            <dd>
              <Money value={opening} />
            </dd>
          </div>
        )}
        <div className={styles.fact}>
          <dt>Last purchase</dt>
          <dd className={styles.factText}>{supplier.last_purchase_at ? formatDate(supplier.last_purchase_at) : "None yet"}</dd>
        </div>
      </dl>
    </Card>
  );
}

function DetailsCard({ supplier }: { supplier: SupplierDetail }) {
  const items: DescriptionItem[] = [
    {
      key: "phone",
      label: "Phone",
      value: <a href={telHref(supplier.phone)}>{formatPhone(supplier.phone)}</a>,
    },
  ];
  if (supplier.contact_person) items.push({ key: "contact", label: "Contact person", value: supplier.contact_person });
  if (supplier.supplies) items.push({ key: "supplies", label: "Supplies", value: supplier.supplies });
  if (supplier.address) items.push({ key: "address", label: "Address", value: <span className={styles.multiline}>{supplier.address}</span> });
  if (supplier.notes) items.push({ key: "notes", label: "Notes", value: <span className={styles.multiline}>{supplier.notes}</span> });
  items.push({ key: "added", label: "Added", value: formatDate(supplier.created_at, { year: "always" }) });

  return (
    <Card title="Details" headingLevel={2} className={styles.details}>
      <DescriptionList stacked items={items} />
    </Card>
  );
}

const PAYMENT_COLUMNS: readonly DataColumn<SupplierPayment>[] = [
  {
    key: "date",
    header: "Date",
    cell: (payment) => (
      <span className={styles.when}>
        <span className={styles.date}>{formatDate(payment.paid_at)}</span>
        <span className={styles.time}>{formatTime(payment.paid_at)}</span>
      </span>
    ),
    width: "150px",
    mobile: "title",
  },
  { key: "method", header: "Method", cell: (payment) => METHOD_LABEL[payment.method], width: "150px" },
  {
    key: "note",
    header: "Note",
    cell: (payment) => (payment.note ? payment.note : <span className={styles.none}>–</span>),
  },
  {
    key: "amount",
    header: "Amount",
    cell: (payment) => <Money value={payment.amount} tone="leaf" />,
    align: "right",
    width: "130px",
    mobile: "aside",
  },
];

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading supplier">
      <PageHeader back={BACK} title={<Skeleton width={220} height={30} />} description={<Skeleton width={180} height={14} />} />
      <div className={styles.body}>
        <div className={styles.top}>
          <Card>
            <div className={styles.skeletonStack}>
              <Skeleton width={70} height={12} />
              <Skeleton width={160} height={32} />
              <Skeleton width="70%" height={12} />
            </div>
          </Card>
          <Card>
            <div className={styles.skeletonStack}>
              <Skeleton width="50%" height={12} />
              <Skeleton width="80%" height={12} />
              <Skeleton width="60%" height={12} />
            </div>
          </Card>
        </div>
        <Skeleton height={44} />
        <Skeleton height={220} radius={10} />
      </div>
    </div>
  );
}
