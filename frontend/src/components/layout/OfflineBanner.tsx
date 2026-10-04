import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../../lib/hooks";
import styles from "./AppShell.module.css";

/** A slim notice under the top bar while the device is offline. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className={styles.offline} role="status">
      <WifiOff aria-hidden="true" />
      <span>You're offline. You can look around, but changes won't save until you're back online.</span>
    </div>
  );
}
