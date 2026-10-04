import { useId } from "react";
import { Badge } from "../../../components/ui";
import { PERMISSION_LABEL, ROLE_DESCRIPTION, ROLE_LABEL, STAFF_ROLES } from "../../../lib/constants";
import { useRoles } from "../../../lib/queries";
import type { StaffRole } from "../../../lib/types";
import styles from "./StaffPage.module.css";
import { permissionsByRole } from "./staffUtils";

export interface RoleChoiceProps {
  value: StaffRole;
  onChange: (role: StaffRole) => void;
  legend?: string;
  disabled?: boolean;
}

/** Manager / Employee / Accountant as radio rows, then what the chosen role can open today. */
export function RoleChoice({ value, onChange, legend = "Role", disabled = false }: RoleChoiceProps) {
  const roles = useRoles();
  const name = `role-${useId()}`;
  const areas = permissionsByRole(roles.data)[value];

  return (
    <fieldset className={styles.roleOptions} disabled={disabled}>
      <legend className={styles.roleLegend}>{legend}</legend>
      {STAFF_ROLES.map((role) => (
        <label key={role} className={styles.roleOption} data-checked={role === value}>
          <input
            type="radio"
            name={name}
            value={role}
            checked={role === value}
            onChange={() => onChange(role)}
            className={styles.roleRadio}
          />
          <span className={styles.roleText}>
            <span className={styles.roleTitle}>{ROLE_LABEL[role]}</span>
            <span className={styles.roleDescription}>{ROLE_DESCRIPTION[role]}</span>
          </span>
        </label>
      ))}
      {areas && (
        <p className={styles.areas} aria-live="polite">
          <span>{ROLE_LABEL[value]} can open:</span>
          {areas.length === 0 ? (
            <span>nothing yet. Choose what this role can open under What each role can do.</span>
          ) : (
            areas.map((permission) => (
              <Badge key={permission} size="sm">
                {PERMISSION_LABEL[permission]}
              </Badge>
            ))
          )}
        </p>
      )}
    </fieldset>
  );
}
