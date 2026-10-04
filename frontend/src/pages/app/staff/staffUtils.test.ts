import { describe, expect, it } from "vitest";
import {
  generateTemporaryPassword,
  isValidEmail,
  isValidPhone,
  loginIdentity,
  loginMessage,
  MIN_PASSWORD_LENGTH,
  normalizePermissions,
  PERMISSION_GROUPS,
  permissionSentence,
  permissionsByRole,
  samePermissions,
  secureRandomInt,
  togglePermission,
  withArticle,
} from "./staffUtils";
import { ALL_PERMISSIONS } from "../../../lib/constants";

describe("temporary passwords", () => {
  it("is a word and six digits, long enough for the API", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[a-z]+-\d{6}$/);
      expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });

  it("uses the injected random source", () => {
    expect(generateTemporaryPassword(() => 0)).toBe("chai-000000");
  });

  it("draws random integers inside the range", () => {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const value = secureRandomInt(24);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(24);
    }
  });
});

describe("validation", () => {
  it("checks emails like the API", () => {
    expect(isValidEmail("arjun@shopos.app")).toBe(true);
    expect(isValidEmail(" meera@example.in ")).toBe(true);
    expect(isValidEmail("arjun@shopos")).toBe(false);
    expect(isValidEmail("arjun shopos.app")).toBe(false);
  });

  it("needs 10 to 15 digits in a phone number", () => {
    expect(isValidPhone("98765 43210")).toBe(true);
    expect(isValidPhone("+91 98765 43210")).toBe(true);
    expect(isValidPhone("98765")).toBe(false);
    expect(isValidPhone("1234567890123456")).toBe(false);
  });
});

describe("login details", () => {
  it("prefers the phone number", () => {
    expect(loginIdentity({ phone: "9876500002", email: "sunita@shopos.app" })).toEqual({ label: "Phone", value: "98765 00002" });
    expect(loginIdentity({ phone: null, email: "Meera@ShopOS.app" })).toEqual({ label: "Email", value: "meera@shopos.app" });
    expect(loginIdentity({ phone: "", email: "" })).toBeNull();
  });

  it("writes a shareable message", () => {
    const message = loginMessage({
      name: "Arjun Pawar",
      shopName: "Raj Local Mart",
      identity: { label: "Phone", value: "98765 00003" },
      password: "haldi-482731",
      signInUrl: "https://shop.example/login",
    });
    expect(message.split("\n")).toEqual([
      "Namaste Arjun, here is your ShopOS login for Raj Local Mart.",
      "Sign in: https://shop.example/login",
      "Phone: 98765 00003",
      "Password: haldi-482731",
      "Please change the password in Settings after you sign in.",
    ]);
  });

  it("adds the right article to a role", () => {
    expect(withArticle("Manager")).toBe("a manager");
    expect(withArticle("Employee")).toBe("an employee");
    expect(withArticle("Accountant")).toBe("an accountant");
  });
});

describe("permissions", () => {
  it("groups every permission exactly once", () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions);
    expect([...grouped].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("keeps the canonical order when toggling", () => {
    expect(togglePermission(["orders", "dashboard"], "payments", true)).toEqual(["dashboard", "orders", "payments"]);
    expect(togglePermission(["dashboard", "orders"], "dashboard", false)).toEqual(["orders"]);
    expect(normalizePermissions(["reports", "dashboard", "reports"])).toEqual(["dashboard", "reports"]);
  });

  it("compares lists as sets", () => {
    expect(samePermissions(["orders", "dashboard"], ["dashboard", "orders"])).toBe(true);
    expect(samePermissions(["orders"], ["orders", "dashboard"])).toBe(false);
  });

  it("maps roles to their permissions", () => {
    const map = permissionsByRole([
      { role: "owner", permissions: [...ALL_PERMISSIONS], editable: false },
      { role: "employee", permissions: ["orders", "dashboard"], editable: true },
    ]);
    expect(map.employee).toEqual(["dashboard", "orders"]);
    expect(map.manager).toBeUndefined();
  });

  it("reads as a sentence", () => {
    expect(permissionSentence([])).toBe("nothing yet");
    expect(permissionSentence(["dashboard"])).toBe("Today");
    expect(permissionSentence(["dashboard", "orders", "customers"])).toBe("Today, Orders & pickups and Customers & khata");
  });
});
