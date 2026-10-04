// TanStack Query hooks for every endpoint.
// Queries: useX(params?, overrides?). Mutations: useCreateX / useUpdateX / ... returning useMutation results.
// Every successful mutation invalidates ALL queries (see createQueryClient) — simple and always fresh.
// Mutations that return an OrderDetail / Customer / Product also seed that record's cache so open
// drawers update instantly.

import {
  keepPreviousData,
  MutationCache,
  QueryClient,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";
import * as api from "./api";
import { ApiError, tokenStore, type ExpenseSummaryParams, type ProductUpdate, type SupplierListParams, type SupplierUpdate } from "./api";
import type {
  ChangePasswordRequest,
  CustomerInput,
  CustomerListParams,
  CustomerPaymentRequest,
  Expense,
  ExpenseFilters,
  ExpenseInput,
  ExportKind,
  ID,
  ImportKind,
  Order,
  OrderCreate,
  OrderFilters,
  OrderPaymentRequest,
  OrderStatus,
  OrderUpdate,
  Paginated,
  Payment,
  PaymentFilters,
  Permission,
  ProductInput,
  ProductListParams,
  PromiseInput,
  PurchaseCreate,
  ReportRange,
  Session,
  ShopUpdate,
  StaffCreate,
  StaffRole,
  StaffUpdate,
  StockAdjustmentRequest,
  SupplierInput,
  SupplierPaymentRequest,
} from "./types";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function shouldRetry(failureCount: number, error: Error): boolean {
  // 4xx answers won't change on a retry; network blips and 5xx get one more try.
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

/** The app's QueryClient: staleTime 15s, retry 1 (not for 4xx), and invalidate-everything after mutations. */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _onMutateResult, mutation) => {
        // Opt out with `meta: { invalidates: false }` for mutations that don't change data (downloads).
        if (mutation.options.meta?.invalidates === false) return;
        void client.invalidateQueries();
      },
    }),
    defaultOptions: {
      queries: { staleTime: 15_000, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
  return client;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export const queryKeys = {
  session: ["session"] as const,
  shop: ["shop"] as const,
  users: ["users"] as const,
  roles: ["roles"] as const,
  dashboard: ["dashboard"] as const,
  attention: ["attention"] as const,
  search: (q: string) => ["search", q] as const,
  customers: (params: CustomerListParams) => ["customers", "list", params] as const,
  customer: (id: ID) => ["customers", "detail", id] as const,
  customerLedger: (id: ID) => ["customers", "detail", id, "ledger"] as const,
  customerOrders: (id: ID) => ["customers", "detail", id, "orders"] as const,
  customerPayments: (id: ID) => ["customers", "detail", id, "payments"] as const,
  products: (params: ProductListParams) => ["products", "list", params] as const,
  productCategories: ["products", "categories"] as const,
  product: (id: ID) => ["products", "detail", id] as const,
  productTransactions: (id: ID) => ["products", "detail", id, "transactions"] as const,
  orders: (filters: OrderFilters) => ["orders", "list", filters] as const,
  ordersInfinite: (filters: OrderFilters, pageSize: number) => ["orders", "infinite", filters, pageSize] as const,
  order: (id: ID) => ["orders", "detail", id] as const,
  pickups: ["orders", "pickups"] as const,
  deliveries: ["orders", "deliveries"] as const,
  payments: (filters: PaymentFilters) => ["payments", "list", filters] as const,
  paymentsInfinite: (filters: PaymentFilters, pageSize: number) => ["payments", "infinite", filters, pageSize] as const,
  paymentSummary: ["payments", "summary"] as const,
  suppliers: (params: SupplierListParams) => ["suppliers", "list", params] as const,
  supplier: (id: ID) => ["suppliers", "detail", id] as const,
  purchases: ["purchases"] as const,
  expenses: (filters: ExpenseFilters) => ["expenses", "list", filters] as const,
  expensesInfinite: (filters: ExpenseFilters, pageSize: number) => ["expenses", "infinite", filters, pageSize] as const,
  expenseSummary: (params: ExpenseSummaryParams) => ["expenses", "summary", params] as const,
  report: (range: ReportRange) => ["reports", range] as const,
};

// ---------------------------------------------------------------------------
// Shared query plumbing
// ---------------------------------------------------------------------------

/** Per-call tweaks accepted by every query hook. */
export interface QueryOverrides {
  enabled?: boolean;
  /** Poll every N ms (e.g. 30_000 on a counter screen). */
  refetchInterval?: number | false;
  staleTime?: number;
}

// Only pass keys that were actually set: an explicit `undefined` would override the client defaults.
function overrides(options?: QueryOverrides): QueryOverrides {
  const result: QueryOverrides = {};
  if (options?.enabled !== undefined) result.enabled = options.enabled;
  if (options?.refetchInterval !== undefined) result.refetchInterval = options.refetchInterval;
  if (options?.staleTime !== undefined) result.staleTime = options.staleTime;
  return result;
}

/** A "Load more" list built on useInfiniteQuery. Pair with <LoadMore>. */
export interface PagedList<T> {
  items: T[];
  /** Total matching rows on the server. */
  total: number;
  /** First load in progress (no rows yet). */
  isPending: boolean;
  /** Loading failed and there is nothing to show. */
  isError: boolean;
  error: Error | null;
  /** Any request in flight, including background refreshes. */
  isFetching: boolean;
  /** Rows are from the previous filters while the new ones load — dim them. */
  isPlaceholderData: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

function nextOffset<T>(page: Paginated<T>): number | undefined {
  const next = page.offset + page.items.length;
  return page.items.length > 0 && next < page.total ? next : undefined;
}

function usePagedList<T>(query: UseInfiniteQueryResult<InfiniteData<Paginated<T>, unknown>, Error>): PagedList<T> {
  const { data } = query;
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  return {
    items,
    total: data?.pages[0]?.total ?? 0,
    isPending: query.isPending,
    isError: query.isError && items.length === 0,
    error: query.error,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refetch: () => {
      void query.refetch();
    },
  };
}

// ---------------------------------------------------------------------------
// Shop, staff, roles
// ---------------------------------------------------------------------------

export function useShop(options?: QueryOverrides) {
  return useQuery({ queryKey: queryKeys.shop, queryFn: ({ signal }) => api.getShop(signal), ...overrides(options) });
}

export function useUsers(options?: QueryOverrides) {
  return useQuery({ queryKey: queryKeys.users, queryFn: ({ signal }) => api.getUsers(signal), ...overrides(options) });
}

export function useRoles(options?: QueryOverrides) {
  return useQuery({ queryKey: queryKeys.roles, queryFn: ({ signal }) => api.getRoles(signal), ...overrides(options) });
}

// ---------------------------------------------------------------------------
// Dashboard & search
// ---------------------------------------------------------------------------

export function useDashboard(options?: QueryOverrides) {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: ({ signal }) => api.getDashboard(signal), ...overrides(options) });
}

export function useAttention(options?: QueryOverrides) {
  return useQuery({ queryKey: queryKeys.attention, queryFn: ({ signal }) => api.getAttention(signal), ...overrides(options) });
}

/** Global search (customers, orders, products). Idle until `q` has a non-space character. */
export function useSearch(q: string, options?: QueryOverrides) {
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.search(term),
    queryFn: term ? ({ signal }) => api.search(term, signal) : skipToken,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    ...overrides(options),
  });
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function useCustomers(params: CustomerListParams = {}, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.customers(params),
    queryFn: ({ signal }) => api.getCustomers(params, signal),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
}

export function useCustomer(id: ID | null | undefined, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.customer(id ?? 0),
    queryFn: id == null ? skipToken : ({ signal }) => api.getCustomer(id, signal),
    ...overrides(options),
  });
}

export function useCustomerLedger(id: ID | null | undefined, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.customerLedger(id ?? 0),
    queryFn: id == null ? skipToken : ({ signal }) => api.getCustomerLedger(id, signal),
    ...overrides(options),
  });
}

export function useCustomerOrders(id: ID | null | undefined, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.customerOrders(id ?? 0),
    queryFn: id == null ? skipToken : ({ signal }) => api.getCustomerOrders(id, signal),
    ...overrides(options),
  });
}

export function useCustomerPayments(id: ID | null | undefined, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.customerPayments(id ?? 0),
    queryFn: id == null ? skipToken : ({ signal }) => api.getCustomerPayments(id, signal),
    ...overrides(options),
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export function useProducts(params: ProductListParams = {}, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: ({ signal }) => api.getProducts(params, signal),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
}

export function useProductCategories(options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.productCategories,
    queryFn: ({ signal }) => api.getProductCategories(signal),
    ...overrides(options),
  });
}

export function useProduct(id: ID | null | undefined, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.product(id ?? 0),
    queryFn: id == null ? skipToken : ({ signal }) => api.getProduct(id, signal),
    ...overrides(options),
  });
}

export function useProductTransactions(id: ID | null | undefined, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.productTransactions(id ?? 0),
    queryFn: id == null ? skipToken : ({ signal }) => api.getProductTransactions(id, signal),
    ...overrides(options),
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** One page of orders. For "Load more" lists use useInfiniteOrders. */
export function useOrders(filters: OrderFilters = {}, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.orders(filters),
    queryFn: ({ signal }) => api.getOrders(filters, signal),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
}

export function useInfiniteOrders(
  filters: Omit<OrderFilters, "limit" | "offset"> = {},
  pageSize = 50,
  options?: QueryOverrides,
): PagedList<Order> {
  const query = useInfiniteQuery({
    queryKey: queryKeys.ordersInfinite(filters, pageSize),
    queryFn: ({ pageParam, signal }) => api.getOrders({ ...filters, limit: pageSize, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => nextOffset(lastPage),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
  return usePagedList(query);
}

export function useOrder(id: ID | null | undefined, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.order(id ?? 0),
    queryFn: id == null ? skipToken : ({ signal }) => api.getOrder(id, signal),
    ...overrides(options),
  });
}

export function usePickups(options?: QueryOverrides) {
  return useQuery({ queryKey: queryKeys.pickups, queryFn: ({ signal }) => api.getPickups(signal), ...overrides(options) });
}

export function useDeliveries(options?: QueryOverrides) {
  return useQuery({ queryKey: queryKeys.deliveries, queryFn: ({ signal }) => api.getDeliveries(signal), ...overrides(options) });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export function usePayments(filters: PaymentFilters = {}, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.payments(filters),
    queryFn: ({ signal }) => api.getPayments(filters, signal),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
}

export function useInfinitePayments(
  filters: Omit<PaymentFilters, "limit" | "offset"> = {},
  pageSize = 50,
  options?: QueryOverrides,
): PagedList<Payment> {
  const query = useInfiniteQuery({
    queryKey: queryKeys.paymentsInfinite(filters, pageSize),
    queryFn: ({ pageParam, signal }) => api.getPayments({ ...filters, limit: pageSize, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => nextOffset(lastPage),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
  return usePagedList(query);
}

export function usePaymentSummary(options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.paymentSummary,
    queryFn: ({ signal }) => api.getPaymentSummary(signal),
    ...overrides(options),
  });
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export function useSuppliers(params: SupplierListParams = {}, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.suppliers(params),
    queryFn: ({ signal }) => api.getSuppliers(params, signal),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
}

export function useSupplier(id: ID | null | undefined, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.supplier(id ?? 0),
    queryFn: id == null ? skipToken : ({ signal }) => api.getSupplier(id, signal),
    ...overrides(options),
  });
}

export function usePurchases(options?: QueryOverrides) {
  return useQuery({ queryKey: queryKeys.purchases, queryFn: ({ signal }) => api.getPurchases(signal), ...overrides(options) });
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export function useExpenses(filters: ExpenseFilters = {}, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.expenses(filters),
    queryFn: ({ signal }) => api.getExpenses(filters, signal),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
}

export function useInfiniteExpenses(
  filters: Omit<ExpenseFilters, "limit" | "offset"> = {},
  pageSize = 50,
  options?: QueryOverrides,
): PagedList<Expense> {
  const query = useInfiniteQuery({
    queryKey: queryKeys.expensesInfinite(filters, pageSize),
    queryFn: ({ pageParam, signal }) => api.getExpenses({ ...filters, limit: pageSize, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => nextOffset(lastPage),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
  return usePagedList(query);
}

export function useExpenseSummary(params: ExpenseSummaryParams = {}, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.expenseSummary(params),
    queryFn: ({ signal }) => api.getExpenseSummary(params, signal),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function useReport(range: ReportRange, options?: QueryOverrides) {
  return useQuery({
    queryKey: queryKeys.report(range),
    queryFn: ({ signal }) => api.getReport(range, signal),
    placeholderData: keepPreviousData,
    ...overrides(options),
  });
}

// ===========================================================================
// Mutations
// ===========================================================================

type WithId<T> = T & { id: ID };

// Shop & account ------------------------------------------------------------

export function useUpdateShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ShopUpdate) => api.updateShop(body),
    onSuccess: (shop) => {
      queryClient.setQueryData(queryKeys.shop, shop);
      queryClient.setQueryData<Session>(queryKeys.session, (session) => (session ? { ...session, shop } : session));
    },
  });
}

/** Changes the signed-in user's password and switches to the new token the server returns. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: ChangePasswordRequest) => {
      const result = await api.changePassword(body);
      // Store before the global invalidation refetches anything with the (now revoked) old token.
      tokenStore.set(result.token);
      return result;
    },
  });
}

// Staff & roles -------------------------------------------------------------

export function useCreateUser() {
  return useMutation({ mutationFn: (body: StaffCreate) => api.createUser(body) });
}

export function useUpdateUser() {
  return useMutation({ mutationFn: ({ id, ...body }: WithId<StaffUpdate>) => api.updateUser(id, body) });
}

export function useUpdateRole() {
  return useMutation({
    mutationFn: ({ role, permissions }: { role: StaffRole; permissions: Permission[] }) =>
      api.updateRole(role, { permissions }),
  });
}

// Customers -----------------------------------------------------------------

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomerInput) => api.createCustomer(body),
    onSuccess: (customer) => queryClient.setQueryData(queryKeys.customer(customer.id), customer),
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: WithId<Partial<CustomerInput>>) => api.updateCustomer(id, body),
    onSuccess: (customer) => queryClient.setQueryData(queryKeys.customer(customer.id), customer),
  });
}

/** Archives a customer (only allowed when nothing is due). Variables: the customer id. */
export function useArchiveCustomer() {
  return useMutation({ mutationFn: (id: ID) => api.archiveCustomer(id) });
}

/** Khata settlement: allocates FIFO to the oldest unpaid orders. */
export function useRecordCustomerPayment() {
  return useMutation({
    mutationFn: ({ customerId, ...body }: CustomerPaymentRequest & { customerId: ID }) =>
      api.recordCustomerPayment(customerId, body),
  });
}

export function useSetCustomerPromise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, ...body }: PromiseInput & { customerId: ID }) => api.setCustomerPromise(customerId, body),
    onSuccess: (customer) => queryClient.setQueryData(queryKeys.customer(customer.id), customer),
  });
}

/** Variables: the customer id. */
export function useClearCustomerPromise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: ID) => api.clearCustomerPromise(customerId),
    onSuccess: (customer) => queryClient.setQueryData(queryKeys.customer(customer.id), customer),
  });
}

// Products ------------------------------------------------------------------

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProductInput) => api.createProduct(body),
    onSuccess: (product) => queryClient.setQueryData(queryKeys.product(product.id), product),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: WithId<ProductUpdate>) => api.updateProduct(id, body),
    onSuccess: (product) => queryClient.setQueryData(queryKeys.product(product.id), product),
  });
}

/** Variables: the product id. */
export function useArchiveProduct() {
  return useMutation({ mutationFn: (id: ID) => api.archiveProduct(id) });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...body }: StockAdjustmentRequest & { productId: ID }) => api.adjustStock(productId, body),
    onSuccess: (product) => queryClient.setQueryData(queryKeys.product(product.id), product),
  });
}

// Orders --------------------------------------------------------------------

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OrderCreate) => api.createOrder(body),
    onSuccess: (order) => queryClient.setQueryData(queryKeys.order(order.id), order),
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: WithId<OrderUpdate>) => api.updateOrder(id, body),
    onSuccess: (order) => queryClient.setQueryData(queryKeys.order(order.id), order),
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: ID; status: OrderStatus }) => api.updateOrderStatus(orderId, status),
    onSuccess: (order) => queryClient.setQueryData(queryKeys.order(order.id), order),
  });
}

export function useAddOrderPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...body }: OrderPaymentRequest & { orderId: ID }) => api.addOrderPayment(orderId, body),
    onSuccess: (order) => queryClient.setQueryData(queryKeys.order(order.id), order),
  });
}

/** Creates a copy of an order at today's prices. Variables: the order id. Returns the new OrderDetail. */
export function useRepeatOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderId: ID) => api.repeatOrder(orderId),
    onSuccess: (order) => queryClient.setQueryData(queryKeys.order(order.id), order),
  });
}

// Payments ------------------------------------------------------------------

/** Voids a payment (soft delete). Variables: the payment id. */
export function useVoidPayment() {
  return useMutation({ mutationFn: (id: ID) => api.voidPayment(id) });
}

// Suppliers -----------------------------------------------------------------

export function useCreateSupplier() {
  return useMutation({ mutationFn: (body: SupplierInput) => api.createSupplier(body) });
}

export function useUpdateSupplier() {
  return useMutation({ mutationFn: ({ id, ...body }: WithId<SupplierUpdate>) => api.updateSupplier(id, body) });
}

export function useCreatePurchase() {
  return useMutation({
    mutationFn: ({ supplierId, ...body }: PurchaseCreate & { supplierId: ID }) => api.createPurchase(supplierId, body),
  });
}

export function useRecordSupplierPayment() {
  return useMutation({
    mutationFn: ({ supplierId, ...body }: SupplierPaymentRequest & { supplierId: ID }) =>
      api.recordSupplierPayment(supplierId, body),
  });
}

// Expenses ------------------------------------------------------------------

export function useCreateExpense() {
  return useMutation({ mutationFn: (body: ExpenseInput) => api.createExpense(body) });
}

export function useUpdateExpense() {
  return useMutation({ mutationFn: ({ id, ...body }: WithId<Partial<ExpenseInput>>) => api.updateExpense(id, body) });
}

/** Deletes an expense for good. Variables: the expense id. */
export function useDeleteExpense() {
  return useMutation({ mutationFn: (id: ID) => api.deleteExpense(id) });
}

// Import / export -----------------------------------------------------------

export function useImportCsv() {
  return useMutation({ mutationFn: ({ kind, csv }: { kind: ImportKind; csv: string }) => api.importCsv(kind, { csv }) });
}

/** Downloads an export as a CSV file. Variables: the export kind. Doesn't refetch anything. */
export function useDownloadCsv() {
  return useMutation({ mutationFn: (kind: ExportKind) => api.downloadCsv(kind), meta: { invalidates: false } });
}
