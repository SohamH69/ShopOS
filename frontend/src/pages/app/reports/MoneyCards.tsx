import { BarList, ButtonLink, Card, type BarListItem } from "../../../components/ui";
import { EXPENSE_CATEGORY_LABEL, METHOD_LABEL } from "../../../lib/constants";
import { formatCount, formatMoney, pluralize } from "../../../lib/format";
import type { Report } from "../../../lib/types";
import { Facts } from "./Facts";
import { shareText } from "./reportData";
import styles from "./ReportsPage.module.css";

export interface PaymentsCardProps {
  payments: Report["payments"];
  /** Link to the payments page (needs the payments permission). */
  linkPayments: boolean;
  className?: string;
}

/** Money received in the period, what's owed right now, and how customers paid. */
export function PaymentsCard({ payments, linkPayments, className }: PaymentsCardProps) {
  const methods: BarListItem[] = [...payments.by_method]
    .sort((a, b) => b.amount - a.amount)
    .map((entry) => {
      const share = shareText(entry.amount, payments.received);
      return {
        key: entry.method,
        label: METHOD_LABEL[entry.method],
        value: entry.amount,
        hint: `${pluralize(entry.count, "payment")}${share ? ` · ${share}` : ""}`,
      };
    });

  return (
    <Card
      title="Payments"
      description="Received in this period and owed right now"
      className={className}
      actions={
        linkPayments ? (
          <ButtonLink to="/app/payments" variant="ghost" size="sm" className={styles.cardLink}>
            Open payments
          </ButtonLink>
        ) : undefined
      }
    >
      <Facts
        items={[
          { key: "received", label: "Received", value: formatMoney(payments.received), tone: "leaf" },
          {
            key: "owed",
            label: "Owed to you",
            value: formatMoney(payments.outstanding),
            tone: payments.outstanding > 0 ? "margin" : "default",
            hint: "all dues today",
          },
          {
            key: "partial",
            label: "Part-paid orders",
            value: formatCount(payments.partial_orders),
            hint: payments.partial_orders > 0 ? "still have something due" : "none right now",
          },
        ]}
      />
      <h3 className={styles.subhead}>By method</h3>
      <BarList items={methods} label="Payments received by method" empty="No payments received in this period." />
    </Card>
  );
}

export interface ExpensesCardProps {
  expenses: Report["expenses"];
  /** Link to the expenses page (needs the expenses permission). */
  linkExpenses: boolean;
  className?: string;
}

/** Running costs in the period, by category. */
export function ExpensesCard({ expenses, linkExpenses, className }: ExpensesCardProps) {
  const items: BarListItem[] = expenses.by_category.map((entry) => ({
    key: entry.category,
    label: EXPENSE_CATEGORY_LABEL[entry.category],
    value: entry.amount,
    hint: pluralize(entry.count, "entry", "entries"),
  }));
  return (
    <Card
      title="Expenses by category"
      description={expenses.total > 0 ? `${formatMoney(expenses.total)} in this period` : "Rent, bills, salaries and other costs"}
      className={className}
      actions={
        linkExpenses ? (
          <ButtonLink to="/app/expenses" variant="ghost" size="sm" className={styles.cardLink}>
            Open expenses
          </ButtonLink>
        ) : undefined
      }
    >
      <BarList items={items} label="Expenses by category" empty="No expenses recorded in this period." />
    </Card>
  );
}
