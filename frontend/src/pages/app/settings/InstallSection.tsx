import { CheckCircle2, Share, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, Card, useToast } from "../../../components/ui";
import { cx } from "../../../lib/cx";
import { useInstallPrompt } from "../../../lib/pwa";
import styles from "./SettingsPage.module.css";

/** Install ShopOS on this device as an app (PWA), or explain how on browsers without a prompt. */
export function InstallSection({ id }: { id: string }) {
  const install = useInstallPrompt();
  const toast = useToast();
  const installed = install.isInstalled || install.isStandalone;

  const handleInstall = async () => {
    const outcome = await install.promptInstall();
    if (outcome === "accepted") toast.success("ShopOS is installed", { description: "Open it from your home screen or app list." });
  };

  let title = "Install ShopOS on this device";
  let hint: ReactNode = "It opens like a normal app, full screen, with shortcuts for New order and Pickups.";
  if (installed) {
    title = "ShopOS is installed on this device";
    hint = "You're all set. Open it from your home screen or app list.";
  } else if (install.platform === "ios") {
    hint = (
      <>
        In Safari, tap Share <Share size={15} aria-hidden="true" /> then <strong>Add to Home Screen</strong>.
      </>
    );
  } else if (!install.canInstall) {
    hint = "Open ShopOS in Chrome or Edge and use Install app from the browser menu or the install icon in the address bar.";
  }

  return (
    <div id={id} tabIndex={-1} className={styles.anchor}>
      <Card title="Get the app" description="Use ShopOS like an app on your phone, tablet or counter computer.">
        <div className={styles.install}>
          <div className={styles.installText}>
            {installed ? (
              <CheckCircle2 size={20} className={cx(styles.installIcon, styles.installIconDone)} aria-hidden="true" />
            ) : (
              <Smartphone size={20} className={styles.installIcon} aria-hidden="true" />
            )}
            <div>
              <p className={styles.installTitle}>{title}</p>
              <p className={styles.installHint}>{hint}</p>
            </div>
          </div>
          <div className={styles.installActions}>
            {!installed && install.canInstall && (
              <Button variant="primary" onClick={() => void handleInstall()}>
                Install ShopOS
              </Button>
            )}
            <Link to="/download">More ways to install</Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
