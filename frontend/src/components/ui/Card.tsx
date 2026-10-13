import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Card.module.css";

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Right side of the header, e.g. a "View all" link or a Menu. */
  actions?: ReactNode;
  /** Bottom bar with a top rule. */
  footer?: ReactNode;
  /** "none" removes body padding (for tables and lists that run edge to edge) and rules off the header. */
  padding?: "md" | "none";
  /** Element for the card; "section" when it has a title. */
  as?: "section" | "div" | "article";
  /** Heading level for the title (default 2). */
  headingLevel?: 2 | 3;
  className?: string;
  bodyClassName?: string;
  id?: string;
  children?: ReactNode;
}

/** A white surface with a hairline and a soft low shadow. Optional header (title, description, actions) and footer. */
export function Card({
  title,
  description,
  actions,
  footer,
  padding = "md",
  as,
  headingLevel = 2,
  className,
  bodyClassName,
  id,
  children,
}: CardProps) {
  const Element = as ?? (title ? "section" : "div");
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const hasHeader = title !== undefined || description !== undefined || actions !== undefined;
  return (
    <Element id={id} className={cx(styles.card, padding === "none" && styles.flush, className)}>
      {hasHeader && (
        <header className={styles.header}>
          <div className={styles.headings}>
            {title !== undefined && <Heading className={styles.title}>{title}</Heading>}
            {description !== undefined && <p className={styles.description}>{description}</p>}
          </div>
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children !== undefined && children !== null && <div className={cx(styles.body, bodyClassName)}>{children}</div>}
      {footer !== undefined && <footer className={styles.footer}>{footer}</footer>}
    </Element>
  );
}
