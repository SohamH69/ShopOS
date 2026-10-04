export type ClassValue = string | false | null | undefined | 0;

/** Joins truthy class names: `cx(styles.row, active && styles.active)`. */
export function cx(...values: ClassValue[]): string {
  let result = "";
  for (const value of values) {
    if (!value) continue;
    result = result ? `${result} ${value}` : value;
  }
  return result;
}
