import { ArrowRight, Download } from "lucide-react";
import { Button, ButtonLink } from "../../components/ui";
import { useDemoLogin } from "../../features/get-app/useDemoLogin";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import styles from "./ClosingCta.module.css";
import layout from "./Landing.module.css";
import { handleSectionLinkClick } from "./scrollToSection";

/** A second signboard to close the page: one more invitation to start. */
export function ClosingCta() {
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const { openDemo, pending } = useDemoLogin();

  return (
    <section className={cx(styles.band, layout.night)} aria-labelledby="closing-title">
      <span className={layout.awning} aria-hidden="true" />
      <div className={cx(layout.container, styles.inner)}>
        <h2 id="closing-title" className={styles.title}>
          Close the notebook. <em>Open ShopOS.</em>
        </h2>
        <p className={styles.lede}>
          {signedIn
            ? "Your shop is a tap away, on this device or any other."
            : "The demo shop is already full of orders, dues and stock. Have a look around before you sign up."}
        </p>
        <div className={styles.actions}>
          {signedIn ? (
            <ButtonLink to="/app" size="lg" className={layout.accentButton} iconRight={<ArrowRight aria-hidden="true" />}>
              Open ShopOS
            </ButtonLink>
          ) : (
            <Button size="lg" className={layout.accentButton} onClick={openDemo} loading={pending}>
              Try the demo shop
            </Button>
          )}
          <ButtonLink
            href="#get-app"
            size="lg"
            className={layout.outlineButton}
            icon={<Download aria-hidden="true" />}
            onClick={(event) => handleSectionLinkClick(event, "get-app")}
          >
            Get the app
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
