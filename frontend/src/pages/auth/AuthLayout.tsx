import { CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { cx } from "../../lib/cx";
import styles from "./Auth.module.css";

export interface AuthLayoutProps {
  title: string;
  description?: ReactNode;
  /** Under the card, e.g. "New to ShopOS? Create your shop account". */
  footer?: ReactNode;
  children: ReactNode;
}

/** Sign-in and sign-up frame: the logo, then a paper card centred on the desk. */
export function AuthLayout({ title, description, footer, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Link to="/" className={styles.logo} aria-label="ShopOS home">
          <Logo size={32} />
        </Link>
        <section className={styles.card} aria-labelledby="auth-title">
          <h1 id="auth-title" className={styles.title}>
            {title}
          </h1>
          {description && <p className={styles.description}>{description}</p>}
          {children}
        </section>
        {footer && <div className={styles.footer}>{footer}</div>}
      </main>
    </div>
  );
}

export interface FormAlertProps {
  tone?: "error" | "info";
  children: ReactNode;
}

/** A message for the whole form: what went wrong (announced) or a gentle note. */
export function FormAlert({ tone = "error", children }: FormAlertProps) {
  return (
    <div className={cx(styles.alert, tone === "info" && styles.alertInfo)} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <CircleAlert size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
      <div className={styles.alertText}>{children}</div>
    </div>
  );
}

/** A rule with "or" in the middle, between two ways in. Purely visual. */
export function OrDivider() {
  return (
    <div className={styles.divider} aria-hidden="true">
      <span>or</span>
    </div>
  );
}
