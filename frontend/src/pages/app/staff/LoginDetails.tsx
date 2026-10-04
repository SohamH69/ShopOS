import { Check, Copy, MessageCircle } from "lucide-react";
import { Button, ButtonLink, useToast } from "../../../components/ui";
import { useAuth } from "../../../lib/auth";
import { cx } from "../../../lib/cx";
import { firstName } from "../../../lib/format";
import { useCopyToClipboard } from "../../../lib/hooks";
import { hasWhatsAppNumber, waLink } from "../../../lib/whatsapp";
import styles from "./StaffPage.module.css";
import { loginIdentity, loginMessage } from "./staffUtils";

export interface LoginDetailsProps {
  name: string;
  phone: string | null;
  email: string | null;
  password: string;
}

/** The address, identifier and password a staff member needs, with Copy and WhatsApp buttons. */
export function LoginDetails({ name, phone, email, password }: LoginDetailsProps) {
  const { shop } = useAuth();
  const toast = useToast();
  const { copy, copied } = useCopyToClipboard();
  const identity = loginIdentity({ phone, email });
  const signInUrl = `${window.location.origin}/login`;
  const message = identity
    ? loginMessage({ name, shopName: shop?.name ?? "your shop", identity, password, signInUrl })
    : `Sign in: ${signInUrl}\nPassword: ${password}`;

  const handleCopy = async () => {
    const ok = await copy(message);
    if (!ok) toast.error("Couldn't copy the login", { description: "Select the details above and copy them yourself." });
  };

  return (
    <div>
      <dl className={styles.loginBox}>
        <div className={styles.loginRow}>
          <dt className={styles.loginLabel}>Sign in at</dt>
          <dd className={styles.loginValue}>{signInUrl}</dd>
        </div>
        {identity && (
          <div className={styles.loginRow}>
            <dt className={styles.loginLabel}>{identity.label}</dt>
            <dd className={styles.loginValue}>{identity.value}</dd>
          </div>
        )}
        <div className={styles.loginRow}>
          <dt className={styles.loginLabel}>Password</dt>
          <dd className={cx(styles.loginValue, styles.password)}>{password}</dd>
        </div>
      </dl>
      <div className={styles.shareActions}>
        <Button
          icon={copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          onClick={() => void handleCopy()}
        >
          {copied ? "Copied" : "Copy login"}
        </Button>
        {hasWhatsAppNumber(phone) && (
          <ButtonLink href={waLink(phone, message)} newTab icon={<MessageCircle aria-hidden="true" />}>
            Send on WhatsApp
          </ButtonLink>
        )}
      </div>
      <span className="visually-hidden" role="status">
        {copied ? "Login details copied." : ""}
      </span>
      <p className={styles.note}>
        Ask {firstName(name) || "them"} to change this password in Settings after signing in. You won't see it again
        once you close this.
      </p>
    </div>
  );
}
