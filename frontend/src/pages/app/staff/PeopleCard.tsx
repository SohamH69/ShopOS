import { KeyRound, PencilLine, Power, UserCog, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Menu,
  useToast,
  type DataColumn,
} from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { ROLE_LABEL } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { formatDateTime, formatPhone, formatRelative, pluralize } from "../../../lib/format";
import { useUpdateUser, useUsers } from "../../../lib/queries";
import type { User } from "../../../lib/types";
import { ChangeRoleModal, EditNameModal, ResetPasswordModal } from "./StaffActionModals";
import styles from "./StaffPage.module.css";

type StaffActionKind = "role" | "name" | "password" | "turnOff";

interface StaffAction {
  kind: StaffActionKind;
  user: User;
  /** Remounts the dialog on every open so its form starts fresh. */
  key: number;
}

function PersonCell({ user, isYou }: { user: User; isYou: boolean }) {
  const contact = [user.phone ? formatPhone(user.phone) : null, user.email].filter(Boolean).join(" · ");
  return (
    <span className={styles.person}>
      <Avatar name={user.name} />
      <span className={styles.personText}>
        <span className={styles.personName}>
          <span className={styles.personNameText}>{user.name}</span>
          {isYou && (
            <Badge size="sm" tone="pen">
              You
            </Badge>
          )}
        </span>
        {contact && <span className={styles.personMeta}>{contact}</span>}
      </span>
    </span>
  );
}

function StatusText({ active }: { active: boolean }) {
  return (
    <span className={cx(styles.status, !active && styles.statusOff)}>
      <span className={styles.dot} aria-hidden="true" />
      {active ? "Active" : "Turned off"}
    </span>
  );
}

function LastSignIn({ value }: { value: string | null }) {
  if (!value) return <span className={styles.never}>Never</span>;
  return (
    <time dateTime={value} title={formatDateTime(value)}>
      {formatRelative(value)}
    </time>
  );
}

export interface PeopleCardProps {
  onAdd: () => void;
}

/** Everyone who can sign in, with role, status and last sign-in, plus per-person actions. */
export function PeopleCard({ onAdd }: PeopleCardProps) {
  const users = useUsers();
  const { user: me } = useAuth();
  const toast = useToast();
  const update = useUpdateUser();
  const [action, setAction] = useState<StaffAction | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [turnOffError, setTurnOffError] = useState<string | null>(null);

  const openAction = (kind: StaffActionKind, user: User) => {
    setTurnOffError(null);
    setAction({ kind, user, key: Date.now() });
    setActionOpen(true);
  };
  // The action stays set while its dialog animates out.
  const closeAction = () => setActionOpen(false);

  const turnOn = (user: User) => {
    update.mutate(
      { id: user.id, is_active: true },
      {
        onSuccess: (saved) => toast.success("Login turned on", { description: `${saved.name} can sign in again.` }),
        onError: (error) => toast.error("Login wasn't turned on", { description: errorMessage(error) }),
      },
    );
  };

  const turnOff = (user: User) => {
    setTurnOffError(null);
    update.mutate(
      { id: user.id, is_active: false },
      {
        onSuccess: (saved) => {
          toast.success("Login turned off", { description: `${saved.name} is signed out everywhere.` });
          closeAction();
        },
        onError: (error) => setTurnOffError(errorMessage(error)),
      },
    );
  };

  const columns = useMemo<DataColumn<User>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        cell: (user) => <PersonCell user={user} isYou={user.id === me?.id} />,
        mobile: "title",
      },
      {
        key: "role",
        header: "Role",
        cell: (user) => <Badge tone={user.role === "owner" ? "pen" : "neutral"}>{ROLE_LABEL[user.role]}</Badge>,
        mobile: "aside",
        width: "140px",
      },
      {
        key: "status",
        header: "Status",
        cell: (user) => <StatusText active={user.is_active} />,
        width: "140px",
      },
      {
        key: "last",
        header: "Last sign-in",
        cell: (user) => <LastSignIn value={user.last_login_at} />,
        width: "160px",
      },
    ],
    [me?.id],
  );

  // The owner's account and your own can't be changed here (the API refuses both).
  const rowActions = (user: User) => {
    if (user.role === "owner" || user.id === me?.id) return null;
    return (
      <Menu
        label={`Actions for ${user.name}`}
        items={[
          { key: "role", label: "Change role", icon: <UserCog aria-hidden="true" />, onSelect: () => openAction("role", user) },
          { key: "name", label: "Edit name", icon: <PencilLine aria-hidden="true" />, onSelect: () => openAction("name", user) },
          {
            key: "password",
            label: "Reset password",
            icon: <KeyRound aria-hidden="true" />,
            onSelect: () => openAction("password", user),
          },
          { type: "separator" },
          user.is_active
            ? {
                key: "off",
                label: "Turn off login",
                icon: <Power aria-hidden="true" />,
                tone: "danger",
                onSelect: () => openAction("turnOff", user),
              }
            : { key: "on", label: "Turn on login", icon: <Power aria-hidden="true" />, onSelect: () => turnOn(user) },
        ]}
      />
    );
  };

  const list = users.data;
  const activeCount = list?.filter((user) => user.is_active).length ?? 0;
  const offCount = (list?.length ?? 0) - activeCount;
  const description = list
    ? `${pluralize(activeCount, "person", "people")} can sign in${offCount > 0 ? ` · ${offCount} turned off` : ""}`
    : "Everyone who signs in to your shop";

  return (
    <>
      <Card
        padding="none"
        title="People"
        description={description}
        footer={
          list && list.length === 1 ? (
            <div className={styles.footerHint}>
              <span>Only you can sign in so far. Give each person their own login so you know who did what.</span>
              <Button size="sm" icon={<UserPlus aria-hidden="true" />} onClick={onAdd}>
                Add staff
              </Button>
            </div>
          ) : undefined
        }
      >
        <DataTable
          framed={false}
          columns={columns}
          rows={list}
          rowKey={(user) => user.id}
          rowActions={rowActions}
          isRowMuted={(user) => !user.is_active}
          loading={users.isPending}
          error={users.error}
          onRetry={() => void users.refetch()}
          caption="People who can sign in to your shop"
          skeletonRows={3}
          empty={
            <EmptyState
              title="No one has a login yet."
              description="Add your staff so each person signs in with their own login."
              action={
                <Button variant="primary" icon={<UserPlus aria-hidden="true" />} onClick={onAdd}>
                  Add staff
                </Button>
              }
            />
          }
        />
      </Card>

      {action?.kind === "role" && (
        <ChangeRoleModal key={action.key} user={action.user} open={actionOpen} onClose={closeAction} />
      )}
      {action?.kind === "name" && <EditNameModal key={action.key} user={action.user} open={actionOpen} onClose={closeAction} />}
      {action?.kind === "password" && (
        <ResetPasswordModal key={action.key} user={action.user} open={actionOpen} onClose={closeAction} />
      )}
      {action?.kind === "turnOff" && (
        <ConfirmDialog
          open={actionOpen}
          onClose={closeAction}
          onConfirm={() => turnOff(action.user)}
          title={`Turn off ${action.user.name}'s login?`}
          description="They're signed out on every device and can't sign in until you turn it back on. Their orders and payments stay as they are."
          confirmLabel="Turn off login"
          loading={update.isPending}
          error={turnOffError}
        />
      )}
    </>
  );
}
