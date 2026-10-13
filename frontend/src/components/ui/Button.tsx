import type { ComponentProps, ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import { cx } from "../../lib/cx";
import styles from "./Button.module.css";
import { Spinner } from "./Skeleton";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Square, icon-only shape. */
  iconOnly?: boolean;
  className?: string;
}

/** Class names for anything that should look like a button (e.g. a plain <a> or <label>). */
export function buttonClassName({
  variant = "secondary",
  size = "md",
  block = false,
  iconOnly = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cx(
    styles.button,
    styles[variant],
    size !== "md" && styles[size],
    block && styles.block,
    iconOnly && styles.icon,
    className,
  );
}

const SPINNER_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

export interface ButtonProps extends Omit<ComponentProps<"button">, "children"> {
  /** Default "secondary". Use "primary" for the one main action in a view. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (lucide element). Replaced by a spinner while loading. */
  icon?: ReactNode;
  iconRight?: ReactNode;
  /** Shows a spinner and disables the button (keeps its label, so the width stays put). */
  loading?: boolean;
  /** Full width. */
  block?: boolean;
  children?: ReactNode;
}

/** A button. Defaults to type="button"; pass type="submit" inside forms. */
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const hasLabel = children !== undefined && children !== null && children !== false;
  return (
    <button
      type={type}
      className={cx(buttonClassName({ variant, size, block }), loading && styles.loading, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={SPINNER_SIZE[size]} /> : icon}
      {hasLabel && <span className={styles.label}>{children}</span>}
      {iconRight}
    </button>
  );
}

export interface ButtonLinkProps extends Omit<ComponentProps<"a">, "href" | "children"> {
  /** In-app route (react-router Link). */
  to?: To;
  /** Plain URL (used when `to` is not given), e.g. a wa.me or tel: link. */
  href?: string;
  replace?: boolean;
  state?: unknown;
  /** Open in a new tab with rel="noopener noreferrer". */
  newTab?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  /** Square icon-only link; give it an aria-label. */
  iconOnly?: boolean;
  /** Renders aria-disabled and removes it from the tab order. */
  disabled?: boolean;
  children?: ReactNode;
}

/** A link that looks like a button: router `to`, or external `href`. */
export function ButtonLink({
  to,
  href,
  replace,
  state,
  newTab = false,
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  block = false,
  iconOnly = false,
  disabled = false,
  className,
  children,
  target,
  rel,
  ...rest
}: ButtonLinkProps) {
  const classes = buttonClassName({ variant, size, block, iconOnly, className });
  const hasLabel = children !== undefined && children !== null && children !== false;
  const content = (
    <>
      {icon}
      {hasLabel && <span className={styles.label}>{children}</span>}
      {iconRight}
    </>
  );
  const disabledProps = disabled ? { "aria-disabled": true, tabIndex: -1 } : {};
  const linkTarget = newTab ? "_blank" : target;
  const linkRel = newTab ? "noopener noreferrer" : rel;

  if (to !== undefined) {
    return (
      <Link
        to={to}
        replace={replace}
        state={state}
        target={linkTarget}
        rel={linkRel}
        className={classes}
        {...disabledProps}
        {...rest}
      >
        {content}
      </Link>
    );
  }
  return (
    <a href={href} target={linkTarget} rel={linkRel} className={classes} {...disabledProps} {...rest}>
      {content}
    </a>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<"button">, "children" | "aria-label"> {
  /** Accessible name, also shown as the hover tooltip. Required. */
  label: string;
  icon: ReactNode;
  /** Default "ghost". */
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

/** A square button with only an icon. */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  loading = false,
  className,
  disabled,
  title,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx(buttonClassName({ variant, size, iconOnly: true }), loading && styles.loading, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={SPINNER_SIZE[size]} /> : icon}
    </button>
  );
}
