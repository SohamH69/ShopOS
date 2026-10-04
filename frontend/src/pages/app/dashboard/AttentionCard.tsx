import { ChevronRight, CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, EmptyState, Skeleton } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { SEVERITY_LABEL } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { formatCount, formatMoney, pluralize } from "../../../lib/format";
import type { AttentionItem, AttentionKey, Permission } from "../../../lib/types";
import styles from "./AttentionCard.module.css";

/** The module each item links into. Items the user can't open are listed without a link. */
const TARGET_PERMISSION: Readonly<Record<AttentionKey, Permission>> = {
  pickups: "orders",
  ready_unpaid: "orders",
  deliveries: "orders",
  customer_dues: "customers",
  promises: "customers",
  low_stock: "inventory",
  supplier_dues: "suppliers",
};

/** What `count` counts, for items whose headline figure is an amount rather than the count. */
const COUNT_NOUN: Readonly<Partial<Record<AttentionKey, readonly [singular: string, plural: string]>>> = {
  ready_unpaid: ["order", "orders"],
  customer_dues: ["customer", "customers"],
  promises: ["customer", "customers"],
  supplier_dues: ["supplier", "suppliers"],
};

function detailFor(item: AttentionItem): string | null {
  if (item.detail) return item.detail;
  const noun = COUNT_NOUN[item.key];
  return item.amount !== null && noun ? pluralize(item.count, noun[0], noun[1]) : null;
}

function AttentionRow({ item, linked }: { item: AttentionItem; linked: boolean }) {
  // Money items lead with the amount ("₹5,350 customer dues"), the rest with the count.
  const figure = item.amount !== null ? formatMoney(item.amount) : formatCount(item.count);
  const detail = detailFor(item);
  const content = (
    <>
      <span className={cx(styles.severity, styles[item.severity])} title={SEVERITY_LABEL[item.severity]} aria-hidden="true" />
      <span className={styles.figure}>{figure}</span>
      <span className={styles.text}>
        <span className={styles.label}>{item.label}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
        <span className="visually-hidden">. {SEVERITY_LABEL[item.severity]}.</span>
      </span>
      {linked ? <ChevronRight className={styles.chevron} aria-hidden="true" /> : <span aria-hidden="true" />}
    </>
  );
  return linked ? (
    <Link to={item.href} className={cx(styles.row, styles.link)}>
      {content}
    </Link>
  ) : (
    <div className={styles.row}>{content}</div>
  );
}

export interface AttentionCardProps {
  /** Undefined while the dashboard loads. Already sorted most severe first. */
  items: readonly AttentionItem[] | undefined;
  className?: string;
}

/** "Needs attention": what to handle first, most urgent at the top. */
export function AttentionCard({ items, className }: AttentionCardProps) {
  const { can } = useAuth();

  let body: ReactNode;
  if (!items) {
    body = (
      <ul className={styles.list} aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <li key={index} className={styles.item}>
            <div className={styles.row}>
              <Skeleton width={8} height={8} radius={2} />
              <Skeleton width={56} height={24} />
              <span className={styles.text}>
                <Skeleton width="70%" height={14} />
                <Skeleton width="40%" height={12} />
              </span>
              <span />
            </div>
          </li>
        ))}
      </ul>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        compact
        icon={<CircleCheck className={styles.clearIcon} />}
        title="All clear."
        description="Nothing needs your attention right now."
      />
    );
  } else {
    body = (
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.key} className={styles.item}>
            <AttentionRow item={item} linked={can(TARGET_PERMISSION[item.key])} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card className={className} title="Needs attention" padding="none">
      <div aria-busy={!items || undefined}>{body}</div>
    </Card>
  );
}
