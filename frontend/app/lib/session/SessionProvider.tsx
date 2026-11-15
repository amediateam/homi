"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import { useRouter } from "@/i18n/navigation";

import { getSession, patchMe, refresh, retry, startSession, subscribeSession, type SessionState } from "./bootstrap";

export interface Session extends SessionState {
  retry: typeof retry;
  refresh: typeof refresh;
  patchMe: typeof patchMe;
}

const actions = { retry, refresh, patchMe };
const SessionContext = createContext<Session | null>(null);
const serverState: SessionState = { status: "booting", mode: null, me: null, reason: null, error: null };

/**
 * Starts the session of the launch and renders the screens from it (WP-21). In cookie mode the router refreshes once
 * the session is ready, so Server Components render with the cookie (`25` §3.4 step 5).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeSession, getSession, () => serverState);
  const router = useRouter();
  const refreshed = useRef(false);

  useEffect(() => {
    void startSession();
  }, []);

  // The status on <html> for CSS and end-to-end checks; WP-23 renders the gates from `useSession()`.
  useEffect(() => {
    document.documentElement.dataset.session = state.status;
  }, [state.status]);

  useEffect(() => {
    if (state.status === "ready" && state.mode === "cookie" && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [state.status, state.mode, router]);

  const session = useMemo<Session>(() => ({ ...state, ...actions }), [state]);
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error("useSession() outside SessionProvider");
  }
  return session;
}
