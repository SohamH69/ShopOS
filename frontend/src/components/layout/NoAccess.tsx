import { Lock } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { PERMISSION_LABEL } from "../../lib/constants";
import { useDocumentTitle } from "../../lib/hooks";
import type { Permission } from "../../lib/types";
import { ButtonLink, EmptyState } from "../ui";
import { firstPermittedPath, NAV_ITEMS } from "./nav";
import styles from "./PageLoader.module.css";

export interface NoAccessProps {
  /** The permission the page needs, named in the message. */
  permission?: Permission;
}

/** Shown in place of a page the signed-in user's role can't open. */
export function NoAccess({ permission }: NoAccessProps) {
  const { permissions } = useAuth();
  useDocumentTitle("No access");
  const area = permission ? PERMISSION_LABEL[permission] : "this page";
  const destination = firstPermittedPath(permissions);
  const destinationLabel = NAV_ITEMS.find((item) => item.to === destination)?.label ?? "ShopOS";

  return (
    <div className={styles.inline}>
      <div className={styles.inlineCard}>
        <EmptyState
          icon={<Lock />}
          title={`You don't have access to ${area}.`}
          description="Ask the shop owner to turn it on for your role in Staff."
          action={
            <ButtonLink to={destination} variant="primary">
              Go to {destinationLabel}
            </ButtonLink>
          }
        />
      </div>
    </div>
  );
}
