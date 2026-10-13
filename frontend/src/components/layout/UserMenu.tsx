import { ChevronsUpDown, Download, LogOut, Settings } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatPhone } from "../../lib/format";
import { Avatar, Menu } from "../ui";
import styles from "./UserMenu.module.css";

/** The signed-in person (name, role) with account links and Sign out. `tone="dark"` for the night sidebar. */
export function UserMenu({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const contact = user.email ?? (user.phone ? formatPhone(user.phone) : null);

  return (
    <Menu
      label="Account"
      align="start"
      renderTrigger={(props) => (
        <button type="button" {...props} className={cx(styles.user, tone === "dark" && styles.dark)}>
          <Avatar name={user.name} />
          <span className={styles.text}>
            <span className={styles.name}>{user.name}</span>
            <span className={styles.role}>{ROLE_LABEL[user.role]}</span>
          </span>
          <ChevronsUpDown className={styles.chevron} aria-hidden="true" />
        </button>
      )}
      items={[
        contact ? { type: "label", key: "contact", label: contact } : null,
        { key: "account", label: "Account settings", icon: <Settings />, to: "/app/settings#account" },
        { key: "get-app", label: "Get the app", icon: <Download />, to: "/download" },
        { type: "separator", key: "sep" },
        { key: "sign-out", label: "Sign out", icon: <LogOut />, onSelect: logout },
      ]}
    />
  );
}
