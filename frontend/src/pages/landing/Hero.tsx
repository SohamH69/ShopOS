import { Check, Download } from "lucide-react";
import { ButtonLink, Spinner } from "../../components/ui";
import { useDemoLogin } from "../../features/get-app/useDemoLogin";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import styles from "./Hero.module.css";
import layout from "./Landing.module.css";
import { Parchi } from "./Parchi";
import { handleSectionLinkClick } from "./scrollToSection";

const FACTS = ["No app store needed", "Phone, tablet or counter computer", "A login for every staff member"];

/** The shop's signboard: night board under a marigold awning, the promise in paint, a live order slip. */
export function Hero() {
  const { status } = useAuth();
  const { openDemo, pending } = useDemoLogin();
  const signedIn = status === "signedIn";

  return (
    <section className={cx(styles.hero, layout.night)} aria-labelledby="hero-title">
      <span className={layout.awning} aria-hidden="true" />
      <div className={cx(layout.container, styles.grid)}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>For kirana, pharmacy, hardware and every local shop</p>
          <h1 id="hero-title" className={styles.title}>
            Never lose track of an <em>order, payment or pickup</em> again.
          </h1>
          <p className={styles.sub}>
            ShopOS keeps your orders, customer khata, payments, pickups and stock in one place, so you always know
            what's happening in your shop.
          </p>
          <div className={styles.actions}>
            <ButtonLink
              href="#get-app"
              size="lg"
              className={layout.accentButton}
              icon={<Download aria-hidden="true" />}
              onClick={(event) => handleSectionLinkClick(event, "get-app")}
            >
              Get the app
            </ButtonLink>
            <ButtonLink to="/app" size="lg" className={layout.outlineButton}>
              Open in browser
            </ButtonLink>
          </div>
          {!signedIn && (
            <p className={styles.demo}>
              or{" "}
              <button type="button" className={styles.demoLink} onClick={openDemo} disabled={pending} aria-busy={pending || undefined}>
                try the demo shop
              </button>
              {pending && <Spinner size={14} label="Opening the demo shop" />}
            </p>
          )}
          <ul className={styles.facts}>
            {FACTS.map((fact) => (
              <li key={fact}>
                <Check aria-hidden="true" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
        <Parchi />
      </div>
    </section>
  );
}
