import { ArrowRightLeft, History, ShieldCheck, ShieldOff } from "lucide-react";
import { useMemo } from "react";
import { Avatar, Badge, Card, DataTable, EmptyState, type DataColumn } from "../../components/ui";
import { ROLE_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatDateTime, formatPhone, formatRelative, pluralize } from "../../lib/format";
import type { AdminActionEntry, AdminShopDetail, User } from "../../lib/types";
import { describePlanChange } from "./adminBits";
import styles from "./ShopRecords.module.css";

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Everyone with a sign-in at this shop: the owner first, then staff. */
export function PeopleCard({ shop, className }: { shop: AdminShopDetail; className?: string }) {
  const columns = useMemo<DataColumn<User>[]>(
    () => [
      {
        key: "person",
        header: "Name",
        mobile: "title",
        cell: (user) => {
          const contact = [user.email, user.phone ? formatPhone(user.phone) : null].filter(Boolean).join(" · ");
          return (
            <span className={styles.person}>
              <Avatar name={user.name} />
              <span className={styles.personText}>
                <span className={styles.personName}>{user.name}</span>
                {contact && <span className={styles.personMeta}>{contact}</span>}
              </span>
            </span>
          );
        },
      },
      {
        key: "role",
        header: "Role",
        mobile: "aside",
        cell: (user) => (
          <Badge size="sm" tone={user.role === "owner" ? "pen" : "neutral"}>
            {ROLE_LABEL[user.role]}
          </Badge>
        ),
      },
      {
        key: "status",
        header: "Sign-in",
        cell: (user) => (
          <span className={cx(styles.status, !user.is_active && styles.statusOff)}>
            <span className={styles.dot} aria-hidden="true" />
            {user.is_active ? "Active" : "Turned off"}
          </span>
        ),
      },
      {
        key: "last",
        header: "Last sign-in",
        cell: (user) =>
          user.last_login_at ? (
            <span className={styles.when} title={formatDateTime(user.last_login_at)}>
              {formatRelative(user.last_login_at)}
            </span>
          ) : (
            <span className="muted">Never</span>
          ),
      },
    ],
    [],
  );

  return (
    <Card title="People" description={pluralize(shop.users.length, "person", "people") + " can sign in"} padding="none" className={className}>
      <DataTable
        caption={`People at ${shop.name}`}
        framed={false}
        columns={columns}
        rows={shop.users}
        rowKey={(user) => user.id}
        isRowMuted={(user) => !user.is_active}
        empty={<EmptyState compact title="No one can sign in to this shop." />}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Admin history
// ---------------------------------------------------------------------------

function actionCopy(entry: AdminActionEntry): { title: string; detail: string | null; tone: "off" | "on" | "plan" | "other" } {
  switch (entry.action) {
    case "suspend":
      return { title: "Suspended", detail: entry.detail ? `“${entry.detail}”` : null, tone: "off" };
    case "reactivate":
      return { title: "Reactivated", detail: entry.detail || null, tone: "on" };
    case "plan":
      return { title: "Plan changed", detail: entry.detail ? describePlanChange(entry.detail) : null, tone: "plan" };
    default:
      return { title: entry.action, detail: entry.detail || null, tone: "other" };
  }
}

const ICONS = { off: ShieldOff, on: ShieldCheck, plan: ArrowRightLeft, other: History } as const;

/** What the ShopOS team has done to this shop, newest first. */
export function HistoryCard({ shop, className }: { shop: AdminShopDetail; className?: string }) {
  return (
    <Card title="Admin history" description="Suspensions and plan changes, newest first" className={className}>
      {shop.actions.length === 0 ? (
        <EmptyState compact icon={<History />} title="No admin actions yet." description="Suspensions and plan changes show up here." />
      ) : (
        <ol className={styles.history}>
          {shop.actions.map((entry) => {
            const copy = actionCopy(entry);
            const Icon = ICONS[copy.tone];
            return (
              <li key={entry.id} className={styles.entry}>
                <span className={cx(styles.entryIcon, styles[`tone_${copy.tone}`])} aria-hidden="true">
                  <Icon />
                </span>
                <div className={styles.entryText}>
                  <p className={styles.entryTitle}>{copy.title}</p>
                  {copy.detail && <p className={styles.entryDetail}>{copy.detail}</p>}
                  <p className={styles.entryMeta}>
                    {entry.admin_name} · <time dateTime={entry.created_at}>{formatDateTime(entry.created_at, { year: "auto" })}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
