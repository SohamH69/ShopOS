import { BookOpenText, CircleAlert, ClipboardList, Info, Package } from "lucide-react";
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

const POINTS = [
  { icon: ClipboardList, text: "Orders, pickups and deliveries" },
  { icon: BookOpenText, text: "Customer khata and dues" },
  { icon: Package, text: "Stock, suppliers and reports" },
];

/**
 * Sign-in and sign-up frame. Wide screens: the night signboard on the left, the form on the right.
 * Phones: a short signboard band with the logo, and the form card rising over its edge.
 */
export function AuthLayout({ title, description, footer, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <aside className={styles.board}>
        <span className={styles.awning} aria-hidden="true" />
        <Link to="/" className={styles.logo} aria-label="ShopOS home">
          <Logo tone="dark" size={32} />
        </Link>
        <div className={styles.pitch}>
          <p className={styles.pitchTitle}>
            Your whole shop, <em>in one place.</em>
          </p>
          <ul className={styles.points}>
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className={styles.pointIcon} aria-hidden="true">
                  <Icon />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className={styles.boardFoot}>For kirana, pharmacy, hardware and every local shop</p>
      </aside>
      <main className={styles.main}>
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
