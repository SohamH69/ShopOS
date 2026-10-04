import { ArrowRight, Check } from "lucide-react";
import { useId } from "react";
import { Button, ButtonLink } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import styles from "./GetAppSection.module.css";
import { useDemoLogin } from "./useDemoLogin";

const FACTS = ["Works in Chrome, Edge, Safari and Firefox", "Same account on every device", "Staff sign in with their own login"];

/** "Use it in your browser": open the app (sign-in if needed) or try the demo shop. */
export function BrowserCard() {
  const { status, shop } = useAuth();
  const { openDemo, pending } = useDemoLogin();
  const titleId = useId();
  const signedIn = status === "signedIn";

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <header>
        <h3 id={titleId} className={styles.cardTitle}>
          Use it in your browser
        </h3>
        <p className={styles.cardSub}>Nothing to install. Sign in from any computer or phone — your data stays in sync.</p>
      </header>

      {signedIn && shop && (
        <p className={styles.signedIn}>
          You're signed in to <strong>{shop.name}</strong>.
        </p>
      )}

      <div className={styles.browserActions}>
        <ButtonLink to="/app" variant="primary" iconRight={<ArrowRight aria-hidden="true" />}>
          Open ShopOS
        </ButtonLink>
        {/* A signed-in owner would lose their own session to the demo shop, so it's offered to visitors only. */}
        {!signedIn && (
          <Button onClick={openDemo} loading={pending}>
            Try the demo shop
          </Button>
        )}
      </div>

      <ul className={styles.facts}>
        {FACTS.map((fact) => (
          <li key={fact}>
            <Check size={16} aria-hidden="true" />
            <span>{fact}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
