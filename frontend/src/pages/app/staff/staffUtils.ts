// Helpers for the Staff page: temporary passwords, sign-in identifiers, validation that mirrors
// the API, and the permission groups shown in the role matrix.

import { ALL_PERMISSIONS, PERMISSION_LABEL } from "../../../lib/constants";
import { firstName, formatPhone, phoneDigits } from "../../../lib/format";
import type { Permission, Role, RolePermissions } from "../../../lib/types";

export const MIN_PASSWORD_LENGTH = 8;

// Short kitchen words make a temporary password easy to read out at the counter.
const PASSWORD_WORDS = [
  "chai", "atta", "dal", "ghee", "jeera", "haldi", "poha", "rava", "besan", "masala", "elaichi", "kesar",
  "imli", "gud", "mirchi", "dhania", "ajwain", "methi", "rajma", "chana", "moong", "toor", "namak", "sooji",
] as const;

/** A uniformly random integer in [0, max) from the browser's secure random source. */
export function secureRandomInt(max: number): number {
  const values = new Uint32Array(1);
  // Rejection sampling keeps every value equally likely.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    crypto.getRandomValues(values);
    if (values[0] < limit) return values[0] % max;
  }
}

/** "haldi-482731": a word and six digits, at least 9 characters, easy to say over the phone. */
export function generateTemporaryPassword(randomInt: (max: number) => number = secureRandomInt): string {
  const word = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)];
  let digits = "";
  for (let index = 0; index < 6; index += 1) digits += String(randomInt(10));
  return `${word}-${digits}`;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: string): boolean {
  const text = value.trim();
  return text.length <= 254 && EMAIL_PATTERN.test(text);
}

/** Same rule as the API: 10 to 15 digits. */
export function isValidPhone(value: string): boolean {
  const digits = phoneDigits(value).length;
  return digits >= 10 && digits <= 15;
}

export interface LoginIdentity {
  /** "Phone" or "Email". */
  label: string;
  /** What they type on the sign-in screen. */
  value: string;
}

/** The identifier a person signs in with: their phone when they have one, otherwise email. */
export function loginIdentity(person: { phone?: string | null; email?: string | null }): LoginIdentity | null {
  if (person.phone && person.phone.trim()) return { label: "Phone", value: formatPhone(person.phone) };
  if (person.email && person.email.trim()) return { label: "Email", value: person.email.trim().toLowerCase() };
  return null;
}

/** The login details to send a new staff member (WhatsApp or clipboard). */
export function loginMessage(options: {
  name: string;
  shopName: string;
  identity: LoginIdentity;
  password: string;
  signInUrl: string;
}): string {
  const greeting = firstName(options.name) ? `Namaste ${firstName(options.name)}` : "Namaste";
  return [
    `${greeting}, here is your ShopOS login for ${options.shopName}.`,
    `Sign in: ${options.signInUrl}`,
    `${options.identity.label}: ${options.identity.value}`,
    `Password: ${options.password}`,
    "Please change the password in Settings after you sign in.",
  ].join("\n");
}

/** "a manager", "an employee", "an accountant". */
export function withArticle(roleLabel: string): string {
  const word = roleLabel.toLowerCase();
  return /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: readonly Permission[];
}

/** The matrix rows, grouped the way a shop thinks about the work. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  { key: "counter", label: "At the counter", permissions: ["dashboard", "orders", "customers", "payments"] },
  { key: "back-office", label: "Stock and accounts", permissions: ["inventory", "suppliers", "expenses", "reports"] },
  { key: "shop", label: "Running the shop", permissions: ["staff", "settings"] },
];

/** Permissions that let someone change logins, roles or shop data. */
export const SENSITIVE_PERMISSIONS: readonly Permission[] = ["staff", "settings"];

/** Keeps the canonical order and drops duplicates. */
export function normalizePermissions(permissions: Iterable<Permission>): Permission[] {
  const wanted = new Set(permissions);
  return ALL_PERMISSIONS.filter((permission) => wanted.has(permission));
}

export function samePermissions(a: readonly Permission[], b: readonly Permission[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((permission) => set.has(permission));
}

/** Toggles one permission in a list, keeping the canonical order. */
export function togglePermission(list: readonly Permission[], permission: Permission, on: boolean): Permission[] {
  const set = new Set(list);
  if (on) set.add(permission);
  else set.delete(permission);
  return normalizePermissions(set);
}

/** Each role's permissions, keyed by role. */
export function permissionsByRole(roles: readonly RolePermissions[] | undefined): Partial<Record<Role, Permission[]>> {
  const result: Partial<Record<Role, Permission[]>> = {};
  for (const entry of roles ?? []) result[entry.role] = normalizePermissions(entry.permissions);
  return result;
}

/** "Today, Orders & pickups and Customers & khata". */
export function permissionSentence(permissions: readonly Permission[]): string {
  const labels = permissions.map((permission) => PERMISSION_LABEL[permission]);
  if (labels.length === 0) return "nothing yet";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
