import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthState = { session: Session | null; loading: boolean };
const AuthContext = createContext<AuthState>({ session: null, loading: true });

// Session still kept by the official Supabase client storage after a refresh
// failed only because of the network (Supabase keeps it in that case).
async function storedSession(): Promise<Session | null> {
  const auth = supabase.auth as unknown as { storage: { getItem: (k: string) => string | null | Promise<string | null> }; storageKey: string };
  try {
    const raw = await auth.storage.getItem(auth.storageKey);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.access_token && s?.refresh_token && s?.user ? s : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });
  useEffect(() => {
    let active = true;
    let restored = false;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // The initial state is decided below, once restoration is finished.
      console.log("DBG event", event, !!session);
      if (event === "INITIAL_SESSION" || !active) return;
      if (!restored && !session && event !== "SIGNED_OUT") return;
      setState({ session, loading: false });
    });

    const retry = () => { void supabase.auth.getSession(); };

    (async () => {
      const { data: res, error } = await supabase.auth.getSession();
      console.log("DBG getSession", !!res.session, error?.name, error?.message);
      if (!active) return;
      restored = true;
      if (res.session) return setState({ session: res.session, loading: false });
      if (error && isAuthRetryableFetchError(error)) {
        // Network unavailable while renewing: keep the user signed in; Supabase
        // renews the session automatically when the network comes back.
        const stale = await storedSession();
        if (!active) return;
        setState({ session: stale, loading: false });
        if (stale) window.addEventListener("online", retry);
        return;
      }
      setState({ session: null, loading: false });
    })();

    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("online", retry);
    };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
