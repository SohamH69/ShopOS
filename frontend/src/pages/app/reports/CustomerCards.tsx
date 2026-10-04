import { Link } from "react-router-dom";
import { ButtonLink, Card, EmptyState, Money } from "../../../components/ui";
import { formatCount, formatPhone, pluralize } from "../../../lib/format";
import type { Report } from "../../../lib/types";
import { Facts } from "./Facts";
import styles from "./ReportsPage.module.css";

const DUES_SHOWN = 5;

function CustomerName({ id, name, link }: { id: number; name: string; link: boolean }) {
  return link ? (
    <Link to={`/app/customers/${id}`} className={styles.itemName}>
      {name}
    </Link>
  ) : (
    <span className={styles.itemName}>{name}</span>
  );
}

export interface TopCustomersCardProps {
  customers: Report["customers"]["top"];
  /** Link names to the customer's khata (needs the customers permission). */
  linkCustomers: boolean;
  className?: string;
}

/** The customers who bought the most in the period, ranked. */
export function TopCustomersCard({ customers, linkCustomers, className }: TopCustomersCardProps) {
  return (
    <Card title="Top customers" description="By purchases in this period" className={className}>
      {customers.length === 0 ? (
        <EmptyState
          compact
          title="No customer orders in this period."
          description="Orders for walk-in customers without a name don't count here."
        />
      ) : (
        <ol className={styles.list} aria-label="Top customers by purchases">
          {customers.map((customer, index) => (
            <li key={customer.id} className={styles.listItem}>
              <span className={styles.rankRow}>
                <span className={styles.rank} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.itemMain}>
                  <CustomerName id={customer.id} name={customer.name} link={linkCustomers} />
                  <span className={styles.itemMeta}>{pluralize(customer.orders, "order")}</span>
                </span>
              </span>
              <span className={styles.itemAside}>
                <Money value={customer.total} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export interface CustomersCardProps {
  customers: Report["customers"];
  linkCustomers: boolean;
  className?: string;
}

/** Active, new and repeat customers in the period, plus who owes the most right now. */
export function CustomersCard({ customers, linkCustomers, className }: CustomersCardProps) {
  const dues = customers.with_dues.slice(0, DUES_SHOWN);
  return (
    <Card
      title="Customers"
      description="Who bought in this period"
      className={className}
      actions={
        linkCustomers && customers.with_dues.length > 0 ? (
          <ButtonLink to="/app/customers?filter=dues" variant="ghost" size="sm" className={styles.cardLink}>
            All dues
          </ButtonLink>
        ) : undefined
      }
    >
      <Facts
        items={[
          { key: "active", label: "Active", value: formatCount(customers.active_count), hint: "bought something" },
          { key: "new", label: "New", value: formatCount(customers.new_count), hint: "added in this period" },
          { key: "repeat", label: "Repeat", value: formatCount(customers.repeat_count), hint: "2 or more orders" },
        ]}
      />
      <h3 className={styles.subhead}>Owe you the most right now</h3>
      {dues.length === 0 ? (
        <p className={styles.footnote}>No customer has dues. Every khata is settled.</p>
      ) : (
        <ul className={styles.list}>
          {dues.map((customer) => (
            <li key={customer.id} className={styles.listItem}>
              <span className={styles.itemMain}>
                <CustomerName id={customer.id} name={customer.name} link={linkCustomers} />
                <span className={styles.itemMeta}>{formatPhone(customer.phone)}</span>
              </span>
              <span className={styles.itemAside}>
                <Money value={customer.outstanding} tone="margin" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
