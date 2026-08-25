/**
 * Session context + AuthGate.
 *
 * `SessionProvider` loads GET /api/session on mount. `AuthGate` renders its
 * children only when authenticated, otherwise redirects to /login (Req 1.3,
 * 2.5). `useSession` exposes the current user/view and a refresh/logout helper.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate } from "react-router-dom";

import { ApiClientError } from "../api/client.js";
import { endpoints, type SessionResponse } from "../api/endpoints.js";

interface SessionState {
  loading: boolean;
  session: SessionResponse | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionResponse | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await endpoints.session();
      setSession(s);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        setSession(null);
      } else {
        setSession(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => setSession(null), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ loading, session, refresh, clear }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}

/** Guards children behind an authenticated session; redirects to /login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session } = useSession();
  if (loading) return <div>Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
