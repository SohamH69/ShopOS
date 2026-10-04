// Fetch client for the ShopOS API (SPEC §3). One typed function per endpoint.
// - Base `/api`, JSON in and out, bearer token from localStorage (`shopos.token`).
// - Failures throw ApiError with a sentence the UI can show as-is.
// - A 401 on an authenticated request clears the token and tells the auth layer (which sends the
//   user to /login?next=…). Without a listener it redirects directly.

import { todayISO } from "./format";
import type {
  AttentionItem,
  AuthResponse,
  ChangePasswordRequest,
  Customer,
  CustomerInput,
  CustomerListParams,
  CustomerPaymentRequest,
  CustomerPaymentResult,
  Dashboard,
  Expense,
  ExpenseFilters,
  ExpenseInput,
  ExpenseSummary,
  ExportKind,
  ID,
  ImportKind,
  ImportRequest,
  ImportResult,
  InventoryTransaction,
  Ledger,
  LoginRequest,
  Order,
  OrderCreate,
  OrderDetail,
  OrderFilters,
  OrderPaymentRequest,
  OrderStatus,
  OrderUpdate,
  Paginated,
  Payment,
  PaymentFilters,
  PaymentSummary,
  Product,
  ProductInput,
  ProductListParams,
  PromiseInput,
  Purchase,
  PurchaseCreate,
  Report,
  ReportRange,
  RolePermissions,
  RolePermissionsUpdate,
  SearchResults,
  Session,
  Shop,
  ShopUpdate,
  SignupRequest,
  StaffCreate,
  StaffRole,
  StaffUpdate,
  StockAdjustmentRequest,
  Supplier,
  SupplierDetail,
  SupplierInput,
  SupplierPayment,
  SupplierPaymentRequest,
  User,
} from "./types";

const API_BASE = "/api";
export const TOKEN_STORAGE_KEY = "shopos.token";

export const NETWORK_ERROR_MESSAGE = "Can't reach ShopOS. Check your internet connection and try again.";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  /** For 422 responses: field path ("phone", "items.0.quantity") → message. */
  readonly fieldErrors?: Record<string, string>;

  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** The sentence to show for any thrown value. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function fallbackMessage(status: number): string {
  if (status === 400) return "Check the details and try again.";
  if (status === 401) return "Sign in to continue.";
  if (status === 403) return "You don't have access to this.";
  if (status === 404) return "This wasn't found. It may have been removed.";
  if (status === 409) return "This changed in the meantime. Refresh and try again.";
  if (status === 413) return "That file is too large.";
  if (status === 422) return "Some details are missing or not valid.";
  if (status === 429) return "Too many attempts. Wait a few minutes and try again.";
  if (status >= 500) return "ShopOS couldn't finish that. Try again in a moment.";
  return "Something went wrong. Try again.";
}

const LOCATION_PREFIXES = new Set(["body", "query", "path"]);

function humanizeField(path: string): string {
  const last = path.split(".").filter((part) => !/^\d+$/.test(part)).pop() ?? path;
  const words = last.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function cleanValidationMessage(message: string): string {
  return message.replace(/^(Value error|Assertion failed),\s*/i, "").trim();
}

function parseValidationErrors(detail: unknown[]): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  let message = "";
  for (const entry of detail) {
    if (typeof entry !== "object" || entry === null) continue;
    const { loc, msg } = entry as { loc?: unknown; msg?: unknown };
    if (typeof msg !== "string") continue;
    const path = Array.isArray(loc)
      ? loc.filter((part) => !(typeof part === "string" && LOCATION_PREFIXES.has(part))).join(".")
      : "";
    let text = cleanValidationMessage(msg);
    if (/^field required$/i.test(text) && path) text = `${humanizeField(path)} is required.`;
    if (path && !(path in fieldErrors)) fieldErrors[path] = text;
    if (!message) message = text;
  }
  return { message: message || fallbackMessage(422), fieldErrors };
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail: unknown;
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null) detail = (data as { detail?: unknown }).detail;
  } catch {
    detail = undefined;
  }
  if (typeof detail === "string" && detail.trim()) return new ApiError(response.status, detail.trim());
  if (Array.isArray(detail)) {
    const { message, fieldErrors } = parseValidationErrors(detail);
    return new ApiError(response.status, message, fieldErrors);
  }
  return new ApiError(response.status, fallbackMessage(response.status));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// ---------------------------------------------------------------------------
// Token storage (falls back to memory when localStorage is blocked)
// ---------------------------------------------------------------------------

let memoryToken: string | null = null;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const tokenStore = {
  get(): string | null {
    const storage = browserStorage();
    if (storage) {
      try {
        return storage.getItem(TOKEN_STORAGE_KEY);
      } catch {
        return memoryToken;
      }
    }
    return memoryToken;
  },
  set(token: string): void {
    memoryToken = token;
    try {
      browserStorage()?.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // Storage full or blocked: the in-memory token keeps this tab signed in.
    }
  },
  clear(): void {
    memoryToken = null;
    try {
      browserStorage()?.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Nothing stored.
    }
  },
};

// ---------------------------------------------------------------------------
// 401 handling
// ---------------------------------------------------------------------------

const unauthorizedListeners = new Set<() => void>();

/** Subscribe to "the session expired" (a 401 on an authenticated request). Returns an unsubscribe. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function handleUnauthorized(sentToken: string): void {
  // Ignore 401s for a token that has already been replaced (e.g. after a password change).
  if (tokenStore.get() !== sentToken) return;
  tokenStore.clear();
  if (unauthorizedListeners.size > 0) {
    unauthorizedListeners.forEach((listener) => listener());
    return;
  }
  const { pathname, search } = window.location;
  if (pathname.startsWith("/app")) {
    window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
}

// ---------------------------------------------------------------------------
// Request core
// ---------------------------------------------------------------------------

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  query?: object;
  body?: unknown;
  signal?: AbortSignal;
  /** false for public endpoints: no token is sent and a 401 is just an error. */
  auth?: boolean;
}

/** `?a=1&b=true` from a flat params object; undefined, null and "" are skipped. */
export function toQueryString(params?: object): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      search.append(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function send(method: HttpMethod, path: string, options: RequestOptions): Promise<{ response: Response; token: string | null }> {
  const token = options.auth === false ? null : tokenStore.get();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`${API_BASE}${path}${toQueryString(options.query)}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "same-origin",
    });
    return { response, token };
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
}

async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const { response, token } = await send(method, path, options);
  if (response.status === 401 && token) handleUnauthorized(token);
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(response.status, "ShopOS sent an unexpected reply. Reload the page and try again.");
  }
  return (await response.json()) as T;
}

export interface OkResponse {
  ok: true;
}

/** POST /auth/change-password also returns a fresh token (the old one stops working). */
export interface ChangePasswordResponse {
  ok: true;
  token: string;
}

// ---------------------------------------------------------------------------
// Auth & shop
// ---------------------------------------------------------------------------

export const health = (signal?: AbortSignal) => request<OkResponse>("GET", "/health", { signal, auth: false });

export const signup = (body: SignupRequest) => request<AuthResponse>("POST", "/auth/signup", { body, auth: false });

export const login = (body: LoginRequest) => request<AuthResponse>("POST", "/auth/login", { body, auth: false });

export const demoLogin = () => request<AuthResponse>("POST", "/auth/demo", { auth: false });

export const getSession = (signal?: AbortSignal) => request<Session>("GET", "/auth/me", { signal });

export const changePassword = (body: ChangePasswordRequest) =>
  request<ChangePasswordResponse>("POST", "/auth/change-password", { body });

export const getShop = (signal?: AbortSignal) => request<Shop>("GET", "/shop", { signal });

export const updateShop = (body: ShopUpdate) => request<Shop>("PATCH", "/shop", { body });

// ---------------------------------------------------------------------------
// Staff & roles
// ---------------------------------------------------------------------------

export const getUsers = (signal?: AbortSignal) => request<User[]>("GET", "/users", { signal });

export const createUser = (body: StaffCreate) => request<User>("POST", "/users", { body });

export const updateUser = (id: ID, body: StaffUpdate) => request<User>("PATCH", `/users/${id}`, { body });

export const getRoles = (signal?: AbortSignal) => request<RolePermissions[]>("GET", "/roles", { signal });

export const updateRole = (role: StaffRole, body: RolePermissionsUpdate) =>
  request<RolePermissions>("PUT", `/roles/${role}`, { body });

// ---------------------------------------------------------------------------
// Dashboard & search
// ---------------------------------------------------------------------------

export const getDashboard = (signal?: AbortSignal) => request<Dashboard>("GET", "/dashboard", { signal });

export const getAttention = (signal?: AbortSignal) => request<AttentionItem[]>("GET", "/attention", { signal });

export const search = (q: string, signal?: AbortSignal) =>
  request<SearchResults>("GET", "/search", { query: { q }, signal });

// ---------------------------------------------------------------------------
// Customers & khata
// ---------------------------------------------------------------------------

export const getCustomers = (params: CustomerListParams = {}, signal?: AbortSignal) =>
  request<Customer[]>("GET", "/customers", { query: params, signal });

export const createCustomer = (body: CustomerInput) => request<Customer>("POST", "/customers", { body });

export const getCustomer = (id: ID, signal?: AbortSignal) => request<Customer>("GET", `/customers/${id}`, { signal });

export const updateCustomer = (id: ID, body: Partial<CustomerInput>) =>
  request<Customer>("PATCH", `/customers/${id}`, { body });

export const archiveCustomer = (id: ID) => request<OkResponse>("DELETE", `/customers/${id}`);

export const getCustomerLedger = (id: ID, signal?: AbortSignal) =>
  request<Ledger>("GET", `/customers/${id}/ledger`, { signal });

export const getCustomerOrders = (id: ID, signal?: AbortSignal) =>
  request<Order[]>("GET", `/customers/${id}/orders`, { signal });

export const getCustomerPayments = (id: ID, signal?: AbortSignal) =>
  request<Payment[]>("GET", `/customers/${id}/payments`, { signal });

export const recordCustomerPayment = (id: ID, body: CustomerPaymentRequest) =>
  request<CustomerPaymentResult>("POST", `/customers/${id}/payments`, { body });

export const setCustomerPromise = (id: ID, body: PromiseInput) =>
  request<Customer>("PUT", `/customers/${id}/promise`, { body });

export const clearCustomerPromise = (id: ID) => request<Customer>("DELETE", `/customers/${id}/promise`);

// ---------------------------------------------------------------------------
// Products & inventory
// ---------------------------------------------------------------------------

export type ProductUpdate = Partial<Omit<ProductInput, "stock_quantity">>;

export const getProducts = (params: ProductListParams = {}, signal?: AbortSignal) =>
  request<Product[]>("GET", "/products", { query: params, signal });

export const getProductCategories = (signal?: AbortSignal) =>
  request<string[]>("GET", "/products/categories", { signal });

export const createProduct = (body: ProductInput) => request<Product>("POST", "/products", { body });

export const getProduct = (id: ID, signal?: AbortSignal) => request<Product>("GET", `/products/${id}`, { signal });

export const updateProduct = (id: ID, body: ProductUpdate) => request<Product>("PATCH", `/products/${id}`, { body });

export const archiveProduct = (id: ID) => request<OkResponse>("DELETE", `/products/${id}`);

export const adjustStock = (id: ID, body: StockAdjustmentRequest) =>
  request<Product>("POST", `/products/${id}/adjust`, { body });

export const getProductTransactions = (id: ID, signal?: AbortSignal) =>
  request<InventoryTransaction[]>("GET", `/products/${id}/transactions`, { signal });

// ---------------------------------------------------------------------------
// Orders, pickups, deliveries
// ---------------------------------------------------------------------------

export const getOrders = (filters: OrderFilters = {}, signal?: AbortSignal) =>
  request<Paginated<Order>>("GET", "/orders", { query: filters, signal });

export const createOrder = (body: OrderCreate) => request<OrderDetail>("POST", "/orders", { body });

export const getOrder = (id: ID, signal?: AbortSignal) => request<OrderDetail>("GET", `/orders/${id}`, { signal });

export const updateOrder = (id: ID, body: OrderUpdate) => request<OrderDetail>("PATCH", `/orders/${id}`, { body });

export const updateOrderStatus = (id: ID, status: OrderStatus) =>
  request<OrderDetail>("POST", `/orders/${id}/status`, { body: { status } });

export const addOrderPayment = (id: ID, body: OrderPaymentRequest) =>
  request<OrderDetail>("POST", `/orders/${id}/payments`, { body });

export const repeatOrder = (id: ID) => request<OrderDetail>("POST", `/orders/${id}/repeat`);

export const getPickups = (signal?: AbortSignal) => request<Order[]>("GET", "/pickups", { signal });

export const getDeliveries = (signal?: AbortSignal) => request<Order[]>("GET", "/deliveries", { signal });

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const getPayments = (filters: PaymentFilters = {}, signal?: AbortSignal) =>
  request<Paginated<Payment>>("GET", "/payments", { query: filters, signal });

export const getPaymentSummary = (signal?: AbortSignal) =>
  request<PaymentSummary>("GET", "/payments/summary", { signal });

export const voidPayment = (id: ID) => request<OkResponse>("DELETE", `/payments/${id}`);

// ---------------------------------------------------------------------------
// Suppliers & purchases
// ---------------------------------------------------------------------------

export interface SupplierListParams {
  filter?: "due";
}

export type SupplierUpdate = Partial<Omit<SupplierInput, "opening_balance">>;

export const getSuppliers = (params: SupplierListParams = {}, signal?: AbortSignal) =>
  request<Supplier[]>("GET", "/suppliers", { query: params, signal });

export const createSupplier = (body: SupplierInput) => request<Supplier>("POST", "/suppliers", { body });

export const getSupplier = (id: ID, signal?: AbortSignal) =>
  request<SupplierDetail>("GET", `/suppliers/${id}`, { signal });

export const updateSupplier = (id: ID, body: SupplierUpdate) =>
  request<Supplier>("PATCH", `/suppliers/${id}`, { body });

export const createPurchase = (supplierId: ID, body: PurchaseCreate) =>
  request<Purchase>("POST", `/suppliers/${supplierId}/purchases`, { body });

export const recordSupplierPayment = (supplierId: ID, body: SupplierPaymentRequest) =>
  request<SupplierPayment>("POST", `/suppliers/${supplierId}/payments`, { body });

export const getPurchases = (signal?: AbortSignal) => request<Purchase[]>("GET", "/purchases", { signal });

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseSummaryParams {
  date_from?: string;
  date_to?: string;
}

export const getExpenses = (filters: ExpenseFilters = {}, signal?: AbortSignal) =>
  request<Paginated<Expense>>("GET", "/expenses", { query: filters, signal });

export const getExpenseSummary = (params: ExpenseSummaryParams = {}, signal?: AbortSignal) =>
  request<ExpenseSummary>("GET", "/expenses/summary", { query: params, signal });

export const createExpense = (body: ExpenseInput) => request<Expense>("POST", "/expenses", { body });

export const updateExpense = (id: ID, body: Partial<ExpenseInput>) =>
  request<Expense>("PATCH", `/expenses/${id}`, { body });

export const deleteExpense = (id: ID) => request<OkResponse>("DELETE", `/expenses/${id}`);

// ---------------------------------------------------------------------------
// Reports, import, export
// ---------------------------------------------------------------------------

export const getReport = (range: ReportRange, signal?: AbortSignal) =>
  request<Report>("GET", "/reports", { query: { range }, signal });

export const importCsv = (kind: ImportKind, body: ImportRequest) =>
  request<ImportResult>("POST", `/import/${kind}`, { body });

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return null;
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Downloads `/api/export/<kind>.csv` as a file (`shopos-<kind>-<YYYY-MM-DD>.csv`). */
export async function downloadCsv(kind: ExportKind): Promise<void> {
  const { response, token } = await send("GET", `/export/${kind}.csv`, {});
  if (response.status === 401 && token) handleUnauthorized(token);
  if (!response.ok) throw await toApiError(response);
  const blob = await response.blob();
  const filename = filenameFromDisposition(response.headers.get("content-disposition")) ?? `shopos-${kind}-${todayISO()}.csv`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
