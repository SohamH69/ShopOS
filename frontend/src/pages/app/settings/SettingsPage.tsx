import { Database, LogOut, Smartphone, Store, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, PageHeader } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { useDocumentTitle } from "../../../lib/hooks";
import { AccountSection } from "./AccountSection";
import { DataSection } from "./DataSection";
import { InstallSection } from "./InstallSection";
import { ShopProfileSection } from "./ShopProfileSection";
import { useActiveSection } from "./useActiveSection";
import styles from "./SettingsPage.module.css";

interface SectionLink {
  id: string;
  label: string;
  icon: ReactNode;
}

export default function SettingsPage() {
  useDocumentTitle("Settings");
  const { can, logout } = useAuth();
  const canManage = can("settings");

  const links: SectionLink[] = [
    { id: "shop", label: "Shop profile", icon: <Store size={16} aria-hidden="true" /> },
    { id: "account", label: "Your account", icon: <UserRound size={16} aria-hidden="true" /> },
    { id: "app", label: "Get the app", icon: <Smartphone size={16} aria-hidden="true" /> },
    ...(canManage ? [{ id: "data", label: "Import & export", icon: <Database size={16} aria-hidden="true" /> }] : []),
    { id: "sign-out", label: "Sign out", icon: <LogOut size={16} aria-hidden="true" /> },
  ];
  const active = useActiveSection(links.map((link) => link.id));

  return (
    <>
      <PageHeader title="Settings" description="Your shop profile, your account, the app and your data." />
      <div className={styles.layout}>
        <nav className={styles.subnav} aria-label="Settings sections">
          <div className={styles.subnavList}>
            {links.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className={styles.subnavLink}
                aria-current={active === link.id ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  const target = document.getElementById(link.id);
                  target?.scrollIntoView({ behavior: "smooth", block: "start" });
                  target?.focus({ preventScroll: true });
                }}
              >
                {link.icon}
                {link.label}
              </a>
            ))}
          </div>
        </nav>

        <div className={styles.sections}>
          <ShopProfileSection id="shop" />
          <AccountSection id="account" />
          <InstallSection id="app" />
          {canManage && <DataSection id="data" />}
          <div id="sign-out" tabIndex={-1} className={styles.anchor}>
            <Card>
              <div className={styles.signOut}>
                <p className={styles.signOutText}>
                  <strong>Sign out of ShopOS on this device</strong>
                  Your shop's data stays safe. Sign in again any time with your phone or email.
                </p>
                <Button variant="danger" icon={<LogOut aria-hidden="true" />} onClick={logout}>
                  Sign out
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
