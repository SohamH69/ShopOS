import { useQueryClient } from "@tanstack/react-query";
import { Info, Lock, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Checkbox,
  ErrorState,
  SegmentedControl,
  Skeleton,
  SkeletonText,
  useToast,
} from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { ALL_PERMISSIONS, PERMISSION_DESCRIPTION, PERMISSION_LABEL, ROLE_LABEL, STAFF_ROLES } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { useMediaQuery } from "../../../lib/hooks";
import { queryKeys, useRoles, useUpdateRole } from "../../../lib/queries";
import type { Permission, RolePermissions, StaffRole } from "../../../lib/types";
import styles from "./PermissionMatrix.module.css";
import {
  PERMISSION_GROUPS,
  permissionsByRole,
  permissionSentence,
  samePermissions,
  SENSITIVE_PERMISSIONS,
  togglePermission,
} from "./staffUtils";

type Drafts = Partial<Record<StaffRole, Permission[]>>;

function roleList(roles: readonly StaffRole[]): string {
  const labels = roles.map((role) => ROLE_LABEL[role]);
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The role × permission grid. Owner is fixed (always everything); the three staff roles are
 * edited as a draft and saved together from a sticky bar.
 */
export function PermissionMatrix() {
  const roles = useRoles();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const updateRole = useUpdateRole();
  const wide = useMediaQuery("(min-width: 720px)");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [phoneRole, setPhoneRole] = useState<StaffRole>("manager");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saved = useMemo(() => permissionsByRole(roles.data), [roles.data]);
  // Nobody edits their own role's access (same rule as changing your own role).
  const lockedRole: StaffRole | null = user && user.role !== "owner" ? user.role : null;
  const dirtyRoles = STAFF_ROLES.filter((role) => drafts[role] !== undefined);
  const isDirty = dirtyRoles.length > 0;

  const current = (role: StaffRole): Permission[] => drafts[role] ?? saved[role] ?? [];
  const isChanged = (role: StaffRole, permission: Permission): boolean => {
    const draft = drafts[role];
    return draft !== undefined && draft.includes(permission) !== (saved[role] ?? []).includes(permission);
  };
  const editable = (role: StaffRole) => !saving && role !== lockedRole && roles.data !== undefined;

  // Warn before a reload or tab close throws away unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const setPermission = (role: StaffRole, permission: Permission, on: boolean) => {
    setSaveError(null);
    setDrafts((previous) => {
      const next = togglePermission(previous[role] ?? saved[role] ?? [], permission, on);
      const updated = { ...previous };
      if (samePermissions(next, saved[role] ?? [])) delete updated[role];
      else updated[role] = next;
      return updated;
    });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    const done: StaffRole[] = [];
    const failures: string[] = [];
    for (const role of dirtyRoles) {
      const permissions = drafts[role];
      if (!permissions) continue;
      try {
        const result = await updateRole.mutateAsync({ role, permissions });
        // Seed the cache so the boxes don't flick back while the list refetches.
        queryClient.setQueryData<RolePermissions[]>(queryKeys.roles, (list) =>
          list?.map((entry) => (entry.role === result.role ? result : entry)),
        );
        done.push(role);
      } catch (error) {
        failures.push(`${ROLE_LABEL[role]}: ${errorMessage(error)}`);
      }
    }
    setDrafts((previous) => {
      const next = { ...previous };
      for (const role of done) delete next[role];
      return next;
    });
    setSaving(false);
    if (failures.length === 0) {
      toast.success("Changes saved", { description: `${roleList(done)} updated. Changes apply straight away.` });
    } else {
      setSaveError(failures.join(" "));
      toast.error("Some changes weren't saved", { description: failures[0] });
    }
  };

  const discard = () => {
    setDrafts({});
    setSaveError(null);
  };

  // Granting Staff or Settings lets people change logins, roles and shop data: say so before saving.
  const sensitiveGrants = dirtyRoles.filter((role) =>
    SENSITIVE_PERMISSIONS.some((permission) => current(role).includes(permission) && !(saved[role] ?? []).includes(permission)),
  );

  let body: ReactNode;
  if (roles.isPending) {
    body = (
      <div className={styles.skeleton} aria-hidden="true">
        <Skeleton width="40%" height={14} />
        <SkeletonText lines={6} />
      </div>
    );
  } else if (roles.isError && !roles.data) {
    body = (
      <ErrorState
        title="Roles didn't load"
        error={roles.error}
        onRetry={() => void roles.refetch()}
        retrying={roles.isFetching}
      />
    );
  } else if (wide) {
    body = (
      <div className={styles.scroll}>
        <table className={styles.matrix}>
          <caption className="visually-hidden">
            What each role can open. Tick a box to allow it. The owner always has everything.
          </caption>
          <colgroup>
            <col />
            <col className={styles.roleCol} />
            {STAFF_ROLES.map((role) => (
              <col key={role} className={styles.roleCol} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.areaHead}>
                Area
              </th>
              <th scope="col">
                <span className={styles.roleHead}>
                  <span className={styles.roleName}>
                    <Lock aria-hidden="true" />
                    {ROLE_LABEL.owner}
                  </span>
                  <span className={styles.roleCount}>Everything</span>
                </span>
              </th>
              {STAFF_ROLES.map((role) => (
                <th key={role} scope="col">
                  <span className={styles.roleHead}>
                    <span className={styles.roleName}>{ROLE_LABEL[role]}</span>
                    {role === lockedRole ? (
                      <span className={styles.yours}>Your role</span>
                    ) : (
                      <span className={styles.roleCount}>
                        {current(role).length} of {ALL_PERMISSIONS.length}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {PERMISSION_GROUPS.map((group) => (
            <tbody key={group.key}>
              <tr className={styles.groupRow}>
                <th scope="rowgroup" colSpan={STAFF_ROLES.length + 2}>
                  {group.label}
                </th>
              </tr>
              {group.permissions.map((permission) => (
                <tr key={permission} className={styles.row}>
                  <th scope="row" className={styles.areaCell}>
                    <span className={styles.areaLabel}>{PERMISSION_LABEL[permission]}</span>
                    <span className={styles.areaDescription}>{PERMISSION_DESCRIPTION[permission]}</span>
                  </th>
                  <td className={cx(styles.cell, styles.ownerCell)}>
                    <Checkbox checked readOnly disabled aria-label={`${ROLE_LABEL.owner}: ${PERMISSION_LABEL[permission]}, always on`} />
                  </td>
                  {STAFF_ROLES.map((role) => {
                    const changed = isChanged(role, permission);
                    return (
                      <td key={role} className={cx(styles.cell, changed && styles.changed)}>
                        <Checkbox
                          checked={current(role).includes(permission)}
                          onCheckedChange={(on) => setPermission(role, permission, on)}
                          disabled={!editable(role)}
                          aria-label={`${ROLE_LABEL[role]}: ${PERMISSION_LABEL[permission]}${changed ? " (not saved yet)" : ""}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    );
  } else {
    const allowed = current(phoneRole);
    body = (
      <div className={styles.phone}>
        <SegmentedControl<StaffRole>
          block
          label="Role to show"
          options={STAFF_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
          value={phoneRole}
          onChange={setPhoneRole}
        />
        <p className={styles.phoneSummary} aria-live="polite">
          {ROLE_LABEL[phoneRole]} can open {allowed.length} of {ALL_PERMISSIONS.length} areas
          {allowed.length > 0 ? `: ${permissionSentence(allowed)}.` : "."}
          {phoneRole === lockedRole ? " This is your role." : ""}
        </p>
        {PERMISSION_GROUPS.map((group) => (
          <section key={group.key} className={styles.phoneGroup} aria-label={group.label}>
            <h3 className={styles.phoneGroupLabel}>{group.label}</h3>
            <ul className={styles.permList}>
              {group.permissions.map((permission) => (
                <li key={permission} className={cx(styles.permItem, isChanged(phoneRole, permission) && styles.changed)}>
                  <Checkbox
                    label={PERMISSION_LABEL[permission]}
                    description={PERMISSION_DESCRIPTION[permission]}
                    checked={allowed.includes(permission)}
                    onCheckedChange={(on) => setPermission(phoneRole, permission, on)}
                    disabled={!editable(phoneRole)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <Card
      padding="none"
      title="What each role can do"
      description="Tick what each role can open. Changes apply to everyone with that role."
    >
      {lockedRole && roles.data && (
        <p className={styles.lockedNote}>
          <Lock aria-hidden="true" />
          <span>You can't change what your own role ({ROLE_LABEL[lockedRole]}) can open. Ask the shop owner.</span>
        </p>
      )}
      {body}
      <ul className={styles.notes}>
        <li>
          <Info aria-hidden="true" />
          <span>The owner can always open everything, so the shop can never be locked out.</span>
        </li>
        <li>
          <Info aria-hidden="true" />
          <span>Without Today, staff go straight to the first area they're allowed, such as Orders.</span>
        </li>
        <li>
          <Info aria-hidden="true" />
          <span>Orders & pickups also lets staff look up customers and products while taking an order.</span>
        </li>
      </ul>
      <p className="visually-hidden" aria-live="polite">
        {isDirty ? `Unsaved changes for ${roleList(dirtyRoles)}.` : ""}
      </p>
      {isDirty && (
        <div className={styles.saveBar}>
          <div className={styles.saveText}>
            <span>
              <strong>Unsaved changes</strong> for {roleList(dirtyRoles)}
            </span>
            {sensitiveGrants.length > 0 && (
              <span className={styles.caution}>
                <TriangleAlert aria-hidden="true" />
                <span>
                  {roleList(sensitiveGrants)} will be able to change staff logins or shop settings.
                </span>
              </span>
            )}
            {saveError && (
              <span className={styles.saveError} role="alert">
                {saveError}
              </span>
            )}
          </div>
          <div className={styles.saveActions}>
            <Button variant="ghost" onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
