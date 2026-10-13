import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "../../lib/cx";
import styles from "./PageHeader.module.css";

export interface PageHeaderProps {
  /** Page title, set in the display face. */
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right (they wrap under the title on phones). */
  actions?: ReactNode;
  /** Back link above the title, e.g. { to: "/app/customers", label: "Customers" }. */
  back?: { to: string; label: string };
  /** Anything below the title row, e.g. filters. */
  children?: ReactNode;
  className?: string;
}

/** The top of every page: optional back link, display-face title, description and actions. */
export function PageHeader({ title, description, actions, back, children, className }: PageHeaderProps) {
  return (
    <header className={cx(styles.header, className)}>
      {back && (
        <Link to={back.to} className={styles.back}>
          <ChevronLeft aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className={styles.row}>
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {description !== undefined && description !== null && <p className={styles.description}>{description}</p>}
        </div>
        {actions !== undefined && actions !== null && <div className={styles.actions}>{actions}</div>}
      </div>
      {children !== undefined && children !== null && <div className={styles.extra}>{children}</div>}
    </header>
  );
}
