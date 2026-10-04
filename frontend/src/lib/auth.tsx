// Session state for the whole app.
// The session is a TanStack query (["session"]), so the global "invalidate after every mutation"
// keeps the shop name and permissions fresh. The last session is cached in localStorage so the app
// opens instantly (and offline) and is revalidated in the background.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";
import { ApiError, onUnauthorized, TOKEN_STORAGE_KEY, tokenStore } from "./api";
import { queryKeys } from "./queries";
import type { AuthResponse, LoginRequest, Permission, Session, Shop, SignupRequest, User } from "./types";

export type AuthStatus = "loading" | "signedIn" | "signedOut" | "error";

export interface AuthContextValue {
  /** loading: checking a stored token · signedIn · signedOut · error: the server couldn't be reached and nothing is cached. */
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  shop: Shop | null;
  permissions: Permission[];
  /** True when the user has the permission (or any of them, when given a list). */
  can: (permission: Permission | readonly Permission[]) => boolean;
  login: (body: LoginRequest) => Promise<Session>;
  signup: (body: SignupRequest) => Promise<Session>;
  demoLogin: () => Promise<Session>;
  /** Signs out on this device and clears all cached data. */
  logout: () => void;
  /** Re-reads /auth/me (e.g. after changing your own role or shop profile). */
  refresh: () => Promise<void>;
  /** Why the user is signed out: "user" (signed out on purpose) or "expiry" (token rejected). */
  signedOutBy: "user" | "expiry" | null;
  /** Set when status is "error". */
  error: Error | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_CACHE_KEY = "shopos.session";
const NO_PERMISSIONS: Permission[] = [];

function readCachedSession(): Session | undefined {
  if (!tokenStore.get()) return undefined;
  try {
    const raw = window.localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    if (parsed && parsed.user && parsed.shop && Array.isArray(parsed.permissions)) return parsed as Session;
  } catch {
    // Unreadable cache: fall through and load from the server.
  }
  return undefined;
}

function writeCachedSession(session: Session): void {
  try {
    window.localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked or full: the app still works, it just won't open instantly next time.
  }
}

function clearCachedSession(): void {
  try {
    window.localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Nothing to clear.
  }
}

function toSession(response: AuthResponse): Session {
  return { user: response.user, shop: response.shop, permissions: response.permissions };
}

/**
 * Only same-site paths are allowed as a post-login destination (no "//evil.com").
 * Returns `fallback` for anything else.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => tokenStore.get() !== null);
  const [signedOutBy, setSignedOutBy] = useState<"user" | "expiry" | null>(null);

  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => api.getSession(signal),
    enabled: hasToken,
    initialData: readCachedSession,
    initialDataUpdatedAt: 0, // treat the cached copy as stale so it is revalidated right away
    staleTime: 60_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
  });

  const session = hasToken ? (sessionQuery.data ?? null) : null;

  useEffect(() => {
    if (session) writeCachedSession(session);
  }, [session]);

  // Drop every cached query after the current render settles (pages unmount first).
  const clearDataSoon = useCallback(() => {
    window.setTimeout(() => queryClient.clear(), 0);
  }, [queryClient]);

  useEffect(
    () =>
      onUnauthorized(() => {
        clearCachedSession();
        setSignedOutBy("expiry");
        setHasToken(false);
        clearDataSoon();
      }),
    [clearDataSoon],
  );

  // Keep tabs in sync: signing out (or in) in one tab applies to the others.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== null && event.key !== TOKEN_STORAGE_KEY) return;
      if (tokenStore.get()) {
        setHasToken(true);
        void queryClient.invalidateQueries();
      } else {
        tokenStore.clear();
        setSignedOutBy("user");
        setHasToken(false);
        clearDataSoon();
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [queryClient, clearDataSoon]);

  const establish = useCallback(
    (response: AuthResponse): Session => {
      const next = toSession(response);
      tokenStore.set(response.token);
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session, next);
      writeCachedSession(next);
      setSignedOutBy(null);
      setHasToken(true);
      return next;
    },
    [queryClient],
  );

  const login = useCallback(async (body: LoginRequest) => establish(await api.login(body)), [establish]);
  const signup = useCallback(async (body: SignupRequest) => establish(await api.signup(body)), [establish]);
  const demoLogin = useCallback(async () => establish(await api.demoLogin()), [establish]);

  const logout = useCallback(() => {
    tokenStore.clear();
    clearCachedSession();
    setSignedOutBy("user");
    setHasToken(false);
    clearDataSoon();
  }, [clearDataSoon]);

  const refresh = useCallback(async () => {
    const present = tokenStore.get() !== null;
    setHasToken(present);
    if (present) await queryClient.refetchQueries({ queryKey: queryKeys.session });
  }, [queryClient]);

  const permissions = session?.permissions ?? NO_PERMISSIONS;
  const can = useCallback(
    (permission: Permission | readonly Permission[]) =>
      typeof permission === "string"
        ? permissions.includes(permission)
        : permission.some((item) => permissions.includes(item)),
    [permissions],
  );

  let status: AuthStatus;
  if (!hasToken) status = "signedOut";
  else if (session) status = "signedIn";
  else if (sessionQuery.isError) status = "error";
  else status = "loading";

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      shop: session?.shop ?? null,
      permissions,
      can,
      login,
      signup,
      demoLogin,
      logout,
      refresh,
      signedOutBy,
      error: status === "error" ? sessionQuery.error : null,
    }),
    [status, session, permissions, can, login, signup, demoLogin, logout, refresh, signedOutBy, sessionQuery.error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
