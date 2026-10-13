import { ArrowRight, House } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Logo } from "../components/brand/Logo";
import { ButtonLink } from "../components/ui";
import { useDocumentTitle } from "../lib/hooks";
import styles from "./NotFoundPage.module.css";

export default function NotFoundPage() {
  useDocumentTitle("Page not found");
  const { pathname } = useLocation();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo} aria-label="ShopOS home">
          <Logo size={28} />
        </Link>
      </header>
      <main className={styles.main}>
        {/* A small signboard hanging from a nail, swaying a little. */}
        <div className={styles.sign} aria-hidden="true">
          <svg className={styles.strings} viewBox="0 0 160 44">
            <path d="M24 44 80 6l56 38" />
            <circle cx="80" cy="6" r="4.5" />
          </svg>
          <span className={styles.board}>404</span>
        </div>
        <p className={styles.code}>
          404 · <span className={styles.path}>{pathname}</span>
        </p>
        <h1 className={styles.title}>This page doesn't exist.</h1>
        <p className={styles.text}>The link may be old, or the address may have a typo. Go back home, or open ShopOS.</p>
        <div className={styles.actions}>
          <ButtonLink to="/" size="lg" icon={<House aria-hidden="true" />}>
            Home
          </ButtonLink>
          <ButtonLink to="/app" variant="primary" size="lg" iconRight={<ArrowRight aria-hidden="true" />}>
            Open ShopOS
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
