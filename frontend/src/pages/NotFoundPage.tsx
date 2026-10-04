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
