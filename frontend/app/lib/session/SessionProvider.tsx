"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import { useRouter } from "@/i18n/navigation";
import { storageSet } from "@/lib/storage";

import { getSession, patchMe, refresh, retry, startSession, subscribeSession, type SessionState } from "./bootstrap";

export interface Session extends SessionState {
  retry: typeof retry;
  refresh: typeof refresh;
  patchMe: typeof patchMe;
}

const actions = { retry, refresh, patchMe };
const SessionContext = createContext<Session | null>(null);
const serverState: SessionState = { status: "booting", prepared: false, mode: null, me: null, reason: null, error: null, pending: false, renewed: false };

/**
 * Starts the session of the launch and renders the screens from it (WP-21). In cookie mode the router refreshes once
 * the session is ready after a sign-in of this launch (`renewed`), so Server Components render with the new cookie
 * (`25` §3.4 step 5); a launch that confirmed the cookie the document came with has nothing to render again (WP-24).
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
    if (state.status === "ready" && state.mode === "cookie" && state.renewed && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [state.status, state.mode, state.renewed, router]);

  // BR-APP-010 (WP-22): at sign-in the profile's city overwrites the saved one, without a server call.
  const profileCity = state.me?.city ?? null;
  useEffect(() => {
    if (profileCity !== null) {
      storageSet("homi-city", profileCity);
    }
  }, [profileCity]);

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
