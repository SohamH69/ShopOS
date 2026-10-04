import { cx } from "../../lib/cx";
import { initials } from "../../lib/format";
import styles from "./Small.module.css";

export interface AvatarProps {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function toneFor(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash + name.charCodeAt(index) * (index + 1)) % 9973;
  return hash % 4;
}

/** Initials in a soft circle; the tint is stable per name. Decorative — show the name next to it. */
export function Avatar({ name, size = "md", className }: AvatarProps) {
  const safeName = name ?? "";
  return (
    <span
      aria-hidden="true"
      className={cx(styles.avatar, styles[`avatar_${size}`], styles[`avatarTone${toneFor(safeName)}`], className)}
    >
      {initials(safeName)}
    </span>
  );
}
