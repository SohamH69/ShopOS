import { Pencil, Plus, ReceiptIndianRupee, Trash2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  Badge,
  BarList,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  LoadMore,
  Menu,
  Money,
  PageHeader,
  SegmentedControl,
  Select,
  SkeletonText,
  StatStrip,
  type BarListItem,
  type DataColumn,
  type SegmentedOption,
  type StatItem,
} from "../../../components/ui";
import { EXPENSE_CATEGORY_LABEL, toOptions } from "../../../lib/constants";
import { dateRange, formatDate, formatMoney, formatPercent, pluralize, type DatePreset } from "../../../lib/format";
import { MEDIA, useDocumentTitle, useMediaQuery } from "../../../lib/hooks";
import { useExpenseSummary, useInfiniteExpenses } from "../../../lib/queries";
import type { Expense, ExpenseCategory, ExpenseSummary } from "../../../lib/types";
import { setParam, useUpdateSearchParams } from "../products/urlState";
import { useDialogState } from "../products/useDialogState";
import { DeleteExpenseDialog } from "./DeleteExpenseDialog";
import { ExpenseFormModal } from "./ExpenseFormModal";
import styles from "./ExpensesPage.module.css";

type Period = Extract<DatePreset, "this_month" | "last_month" | "30d" | "all">;

interface PeriodInfo {
  label: string;
  /** Label of the total in the stat strip. */
  totalLabel: string;
  /** Completes "No rent expenses …". */
  phrase: string;
}

const PERIODS: Readonly<Record<Period, PeriodInfo>> = {
  this_month: { label: "This month", totalLabel: "Spent this month", phrase: "this month" },
  last_month: { label: "Last month", totalLabel: "Spent last month", phrase: "last month" },
  "30d": { label: "Last 30 days", totalLabel: "Spent in the last 30 days", phrase: "in the last 30 days" },
  all: { label: "All time", totalLabel: "Spent in total", phrase: "so far" },
};

const PERIOD_ORDER: readonly Period[] = ["this_month", "last_month", "30d", "all"];
const PERIOD_OPTIONS: readonly SegmentedOption<Period>[] = PERIOD_ORDER.map((value) => ({ value, label: PERIODS[value].label }));
const DEFAULT_PERIOD: Period = "this_month";

const CATEGORY_OPTIONS = toOptions(EXPENSE_CATEGORY_LABEL);
const CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORY_LABEL);

type ExpenseDialog = { kind: "create" } | { kind: "edit"; expense: Expense } | { kind: "delete"; expense: Expense };

function isPeriod(value: string | null): value is Period {
  return value !== null && (PERIOD_ORDER as readonly string[]).includes(value);
}

function isCategory(value: string | null): value is ExpenseCategory {
  return value !== null && CATEGORY_KEYS.includes(value);
}

/** "42%", or "<1%" for a sliver. */
function shareText(amount: number, total: number): string {
  if (total <= 0) return "0%";
  const percent = (amount / total) * 100;
  return percent > 0 && percent < 1 ? "<1%" : formatPercent(percent);
}

function countEntries(summary: ExpenseSummary | undefined): number {
  return summary ? summary.by_category.reduce((sum, item) => sum + item.count, 0) : 0;
}

export default function ExpensesPage() {
  useDocumentTitle("Expenses");
  const location = useLocation();
  const [params] = useSearchParams();
  const update = useUpdateSearchParams();
  const isPhone = useMediaQuery(MEDIA.mobile);
  const asCards = useMediaQuery("(max-width: 719px)");
  const dialog = useDialogState<ExpenseDialog>();

  const periodParam = params.get("period");
  const period: Period = isPeriod(periodParam) ? periodParam : DEFAULT_PERIOD;
  const categoryParam = params.get("category");
  const category: ExpenseCategory | "" = isCategory(categoryParam) ? categoryParam : "";
  const info = PERIODS[period];

  const range = useMemo(() => dateRange(period), [period]);
  const summaryQuery = useExpenseSummary(range);
  const list = useInfiniteExpenses({ ...range, category: category || undefined });
  const summary = summaryQuery.data;

  const setPeriod = (value: Period) => update((next) => setParam(next, "period", value === DEFAULT_PERIOD ? null : value));
  const setCategory = (value: ExpenseCategory | "") => update((next) => setParam(next, "category", value));

  /** Link for a category bar: filters the list, or clears the filter when it's already on. */
  const categoryLink = (value: ExpenseCategory): string => {
    const next = new URLSearchParams(location.search);
    setParam(next, "category", value === category ? null : value);
    const search = next.toString();
    return `${location.pathname}${search ? `?${search}` : ""}`;
  };

  const addExpense = () => dialog.show({ kind: "create" });

  const entries = countEntries(summary);
  const top = summary?.by_category[0];
  const stats: StatItem[] = [
    {
      key: "total",
      label: info.totalLabel,
      value: summary ? formatMoney(summary.total) : "—",
      hint: summary ? (entries > 0 ? pluralize(entries, "expense") : "Nothing recorded") : undefined,
    },
    {
      key: "top",
      label: "Largest category",
      value: top ? EXPENSE_CATEGORY_LABEL[top.category] : "—",
      hint:
        top && summary
          ? `${formatMoney(top.amount)} · ${shareText(top.amount, summary.total)} of the total`
          : summary
            ? "No expenses in this period"
            : undefined,
    },
  ];

  const barItems: BarListItem[] = (summary?.by_category ?? []).map((item) => ({
    key: item.category,
    label: EXPENSE_CATEGORY_LABEL[item.category],
    value: item.amount,
    hint: `${pluralize(item.count, "entry", "entries")} · ${shareText(item.amount, summary?.total ?? 0)}${
      item.category === category ? " · listed below" : ""
    }`,
    to: categoryLink(item.category),
  }));

  let breakdown: ReactNode;
  if (summary) {
    breakdown = (
      <BarList
        items={barItems}
        label={`Expenses by category, ${info.label.toLowerCase()}`}
        empty={`No expenses ${info.phrase}.`}
        className={summaryQuery.isPlaceholderData ? styles.dimmed : undefined}
      />
    );
  } else if (summaryQuery.isError) {
    breakdown = <ErrorState compact error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />;
  } else {
    breakdown = <SkeletonText lines={6} />;
  }

  let empty: ReactNode;
  if (category) {
    empty = (
      <EmptyState
        compact
        title={`No ${EXPENSE_CATEGORY_LABEL[category].toLowerCase()} expenses ${info.phrase}.`}
        description="Pick another category or period."
        action={<Button onClick={() => setCategory("")}>Show all categories</Button>}
      />
    );
  } else if (period === "all") {
    empty = (
      <EmptyState
        icon={<ReceiptIndianRupee />}
        title="Record your first expense"
        description="Rent, electricity, salaries and other running costs, so your reports show real profit."
        action={
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={addExpense}>
            Add expense
          </Button>
        }
      />
    );
  } else {
    empty = (
      <EmptyState
        compact
        title={`No expenses ${info.phrase}.`}
        description="Pick another period, or add an expense."
        action={
          <Button icon={<Plus aria-hidden="true" />} onClick={addExpense}>
            Add expense
          </Button>
        }
      />
    );
  }

  const current = dialog.state;
  const dialogValue = current?.value;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Rent, bills, salaries and other running costs."
        actions={
          <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={addExpense}>
            Add expense
          </Button>
        }
      />

      <div className={styles.body}>
        <div className={styles.toolbar}>
          <SegmentedControl label="Period" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} block={isPhone} />
        </div>

        <StatStrip items={stats} loading={summaryQuery.isPending} refreshing={summaryQuery.isPlaceholderData} />

        <div className={styles.grid}>
          <Card title="By category" description="Pick one to list only those expenses." className={styles.breakdown}>
            {breakdown}
          </Card>

          <Card
            padding="none"
            title={category ? `${EXPENSE_CATEGORY_LABEL[category]} expenses` : "All expenses"}
            description={info.label}
            actions={
              <Select
                size="sm"
                aria-label="Category"
                value={category}
                onValueChange={setCategory}
                placeholder="All categories"
                options={CATEGORY_OPTIONS}
                wrapperClassName={styles.categorySelect}
              />
            }
          >
            <DataTable
              framed={false}
              caption={`${category ? EXPENSE_CATEGORY_LABEL[category] : "All"} expenses, ${info.label.toLowerCase()}`}
              columns={asCards ? CARD_COLUMNS : TABLE_COLUMNS}
              rows={list.isPending ? undefined : list.items}
              rowKey={(expense) => expense.id}
              onRowClick={(expense) => dialog.show({ kind: "edit", expense })}
              rowActions={(expense) => (
                <Menu
                  label={`Actions for the ${formatMoney(expense.amount)} ${EXPENSE_CATEGORY_LABEL[expense.category].toLowerCase()} expense`}
                  items={[
                    { label: "Edit expense", icon: <Pencil />, onSelect: () => dialog.show({ kind: "edit", expense }) },
                    { type: "separator" },
                    {
                      label: "Delete expense",
                      icon: <Trash2 />,
                      tone: "danger",
                      onSelect: () => dialog.show({ kind: "delete", expense }),
                    },
                  ]}
                />
              )}
              loading={list.isPending}
              refreshing={list.isPlaceholderData}
              error={list.isError ? list.error : undefined}
              onRetry={list.refetch}
              empty={empty}
              footer={
                list.items.length > 0 ? (
                  <LoadMore
                    shown={list.items.length}
                    total={list.total}
                    hasMore={list.hasMore}
                    loading={list.isLoadingMore}
                    onLoadMore={list.loadMore}
                    noun="expenses"
                  />
                ) : undefined
              }
            />
          </Card>
        </div>
      </div>

      {current && dialogValue?.kind === "create" && (
        <ExpenseFormModal
          key={current.key}
          open={current.open}
          onClose={dialog.close}
          defaultCategory={category || undefined}
        />
      )}
      {current && dialogValue?.kind === "edit" && (
        <ExpenseFormModal key={current.key} open={current.open} onClose={dialog.close} expense={dialogValue.expense} />
      )}
      {current && dialogValue?.kind === "delete" && (
        <DeleteExpenseDialog key={current.key} open={current.open} onClose={dialog.close} expense={dialogValue.expense} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Table columns: a full table on wide screens, a compact card on phones
// ---------------------------------------------------------------------------

function ExpenseDate({ expense }: { expense: Expense }) {
  return <span className={styles.date}>{formatDate(expense.spent_at)}</span>;
}

function AddedBy({ expense }: { expense: Expense }) {
  return expense.created_by_name ? <>{expense.created_by_name}</> : <span className={styles.none}>—</span>;
}

const TABLE_COLUMNS: readonly DataColumn<Expense>[] = [
  { key: "date", header: "Date", cell: (expense) => <ExpenseDate expense={expense} />, width: "92px" },
  {
    key: "category",
    header: "Category",
    cell: (expense) => <Badge>{EXPENSE_CATEGORY_LABEL[expense.category]}</Badge>,
    width: "140px",
  },
  {
    key: "note",
    header: "Note",
    cell: (expense) =>
      expense.note ? (
        <span className={styles.note} title={expense.note}>
          {expense.note}
        </span>
      ) : (
        <span className={styles.none}>—</span>
      ),
  },
  { key: "by", header: "Added by", cell: (expense) => <AddedBy expense={expense} />, width: "150px" },
  {
    key: "amount",
    header: "Amount",
    cell: (expense) => <Money value={expense.amount} />,
    align: "right",
    width: "120px",
  },
];

const CARD_COLUMNS: readonly DataColumn<Expense>[] = [
  {
    key: "expense",
    header: "Expense",
    cell: (expense) => (
      <span className={styles.cardTitle}>
        <span>{EXPENSE_CATEGORY_LABEL[expense.category]}</span>
        {expense.note && <span className={styles.cardNote}>{expense.note}</span>}
      </span>
    ),
    mobile: "title",
  },
  { key: "amount", header: "Amount", cell: (expense) => <Money value={expense.amount} />, mobile: "aside" },
  { key: "date", header: "Date", cell: (expense) => <ExpenseDate expense={expense} /> },
  { key: "by", header: "Added by", cell: (expense) => <AddedBy expense={expense} /> },
];
