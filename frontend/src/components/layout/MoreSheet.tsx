import { LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { ROLE_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { Avatar, Button, Modal } from "../ui";
import styles from "./MoreSheet.module.css";
import { useNavItems } from "./nav";

export interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Bottom sheet with the pages that don't fit in the tab bar, plus the account and Sign out. */
export function MoreSheet({ open, onClose }: MoreSheetProps) {
  const { user, shop, logout } = useAuth();
  const items = useNavItems().filter((item) => !item.tab);

  return (
    <Modal open={open} onClose={onClose} title="More" placement="bottom">
      <nav aria-label="More pages">
        <ul className={styles.grid}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) => cx(styles.link, isActive && styles.active)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      {user && (
        <div className={styles.account}>
          <Avatar name={user.name} size="lg" />
          <div className={styles.accountText}>
            <span className={styles.name}>{user.name}</span>
            <span className={styles.meta}>
              {ROLE_LABEL[user.role]}
              {shop ? ` · ${shop.name}` : ""}
            </span>
          </div>
          <Button
            size="sm"
            icon={<LogOut aria-hidden="true" />}
            onClick={() => {
              onClose();
              logout();
            }}
          >
            Sign out
          </Button>
        </div>
      )}
    </Modal>
  );
}
