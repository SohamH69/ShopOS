import { Download } from "lucide-react";
import { ButtonLink, Spinner } from "../../components/ui";
import { useDemoLogin } from "../../features/get-app/useDemoLogin";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import styles from "./Hero.module.css";
import layout from "./Landing.module.css";
import { Parchi } from "./Parchi";
import { handleSectionLinkClick } from "./scrollToSection";

export function Hero() {
  const { status } = useAuth();
  const { openDemo, pending } = useDemoLogin();
  const signedIn = status === "signedIn";

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={cx(layout.container, styles.grid)}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>For kirana, pharmacy, hardware and every local shop</p>
          <h1 id="hero-title" className={styles.title}>
            Never lose track of an order, payment or pickup again.
          </h1>
          <p className={styles.sub}>
            ShopOS keeps your orders, customer khata, payments, pickups and stock in one place — so you always know
            what's happening in your shop.
          </p>
          <div className={styles.actions}>
            <ButtonLink
              href="#get-app"
              variant="primary"
              size="lg"
              icon={<Download aria-hidden="true" />}
              onClick={(event) => handleSectionLinkClick(event, "get-app")}
            >
              Get the app
            </ButtonLink>
            <ButtonLink to="/app" size="lg">
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
        </div>
        <Parchi />
      </div>
    </section>
  );
}
