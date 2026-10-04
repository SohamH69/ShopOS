import { Plus, Truck } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  DataTable,
  EmptyState,
  Money,
  PageHeader,
  SegmentedControl,
  StatStrip,
  type DataColumn,
  type SegmentedOption,
  type StatItem,
} from "../../../components/ui";
import { formatCount, formatMoney, formatPhone, formatRelative, pluralize, telHref } from "../../../lib/format";
import { MEDIA, useDocumentTitle, useMediaQuery, useSearchParam } from "../../../lib/hooks";
import { sumMoney } from "../../../lib/money";
import { useSuppliers } from "../../../lib/queries";
import type { Supplier } from "../../../lib/types";
import { useDialogState } from "../products/useDialogState";
import { SupplierFormModal } from "./SupplierFormModal";
import styles from "./SuppliersPage.module.css";

type SupplierFilter = "all" | "due";

function latestPurchase(suppliers: readonly Supplier[]): string | null {
  let latest: string | null = null;
  for (const supplier of suppliers) {
    const at = supplier.last_purchase_at;
    if (at && (latest === null || new Date(at).getTime() > new Date(latest).getTime())) latest = at;
  }
  return latest;
}

export default function SuppliersPage() {
  useDocumentTitle("Suppliers");
  const navigate = useNavigate();
  const isPhone = useMediaQuery(MEDIA.mobile);
  const [filterParam, setFilterParam] = useSearchParam("filter", "all");
  const filter: SupplierFilter = filterParam === "due" ? "due" : "all";
  const suppliersQuery = useSuppliers();
  const dialog = useDialogState<"create">();

  const suppliers = suppliersQuery.data;
  const withDues = useMemo(() => (suppliers ?? []).filter((supplier) => supplier.outstanding > 0), [suppliers]);
  const totalOwed = sumMoney(withDues.map((supplier) => supplier.outstanding));
  const rows = useMemo(() => {
    if (!suppliers) return undefined;
    if (filter === "all") return suppliers;
    return [...withDues].sort((a, b) => b.outstanding - a.outstanding);
  }, [suppliers, withDues, filter]);

  const lastPurchase = suppliers ? latestPurchase(suppliers) : null;
  const stats: StatItem[] = [
    {
      key: "count",
      label: "Suppliers",
      value: suppliers ? formatCount(suppliers.length) : "—",
      hint: suppliers ? (lastPurchase ? `Last purchase ${formatRelative(lastPurchase)}` : "No purchases yet") : undefined,
    },
    {
      key: "owe",
      label: "You owe",
      value: suppliers ? formatMoney(totalOwed) : "—",
      tone: totalOwed > 0 ? "margin" : "default",
      hint: suppliers ? (totalOwed > 0 ? `To ${pluralize(withDues.length, "supplier")}` : "All settled") : undefined,
    },
  ];

  const filterOptions: readonly SegmentedOption<SupplierFilter>[] = [
    { value: "all", label: "All suppliers" },
    { value: "due", label: "With dues", count: suppliers ? withDues.length : undefined },
  ];

  const addSupplier = () => dialog.show("create");

  let empty: ReactNode;
  if (filter === "due" && (suppliers?.length ?? 0) > 0) {
    empty = (
      <EmptyState
        title="You don't owe any supplier right now."
        description="Suppliers you still have to pay show up here, biggest dues first."
        action={<Button onClick={() => setFilterParam(null)}>Show all suppliers</Button>}
      />
    );
  } else {
    empty = (
      <EmptyState
        icon={<Truck />}
        title="Add your first supplier"
        description="Record what you buy from each wholesaler. Stock goes up in one step and you always know what you owe them."
        action={
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={addSupplier}>
            Add supplier
          </Button>
        }
      />
    );
  }

  const current = dialog.state;

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who you buy from and what you owe them."
        actions={
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={addSupplier}>
            Add supplier
          </Button>
        }
      />

      <div className={styles.body}>
        <StatStrip items={stats} loading={suppliersQuery.isPending} />

        <div className={styles.toolbar}>
          <SegmentedControl
            label="Which suppliers"
            value={filter}
            onChange={(value) => setFilterParam(value)}
            options={filterOptions}
            block={isPhone}
          />
        </div>

        <DataTable
          caption="Suppliers"
          columns={COLUMNS}
          rows={rows}
          rowKey={(supplier) => supplier.id}
          onRowClick={(supplier) => navigate(`/app/suppliers/${supplier.id}`)}
          loading={suppliersQuery.isPending}
          error={suppliersQuery.isError ? suppliersQuery.error : undefined}
          onRetry={() => void suppliersQuery.refetch()}
          empty={empty}
        />
      </div>

      {current && (
        <SupplierFormModal
          key={current.key}
          open={current.open}
          onClose={dialog.close}
          onSaved={(supplier) => navigate(`/app/suppliers/${supplier.id}`)}
        />
      )}
    </>
  );
}

function SupplierCell({ supplier }: { supplier: Supplier }) {
  return (
    <span className={styles.nameCell}>
      <span className={styles.name}>{supplier.name}</span>
      {supplier.contact_person && <span className={styles.contact}>{supplier.contact_person}</span>}
    </span>
  );
}

function OweCell({ value }: { value: number }) {
  if (value > 0) return <Money value={value} tone="margin" />;
  return <span className={styles.settled}>Settled</span>;
}

const COLUMNS: readonly DataColumn<Supplier>[] = [
  { key: "name", header: "Supplier", cell: (supplier) => <SupplierCell supplier={supplier} />, mobile: "title" },
  {
    key: "phone",
    header: "Phone",
    cell: (supplier) => (
      <a className={styles.phone} href={telHref(supplier.phone)}>
        {formatPhone(supplier.phone)}
      </a>
    ),
    width: "170px",
  },
  {
    key: "supplies",
    header: "Supplies",
    cell: (supplier) =>
      supplier.supplies ? (
        <span className={styles.supplies} title={supplier.supplies}>
          {supplier.supplies}
        </span>
      ) : (
        <span className={styles.none}>—</span>
      ),
  },
  {
    key: "last",
    header: "Last purchase",
    cell: (supplier) =>
      supplier.last_purchase_at ? (
        <span className={styles.when}>{formatRelative(supplier.last_purchase_at)}</span>
      ) : (
        <span className={styles.none}>None yet</span>
      ),
    width: "150px",
  },
  {
    key: "owe",
    header: "You owe",
    cell: (supplier) => <OweCell value={supplier.outstanding} />,
    align: "right",
    width: "130px",
    mobile: "aside",
  },
];
