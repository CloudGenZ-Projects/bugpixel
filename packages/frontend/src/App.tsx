/**
 * Application root: routing + session provider + a simple app shell with logout.
 */
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import { SessionProvider, AuthGate, useSession } from "./auth/SessionContext.js";
import { endpoints } from "./api/endpoints.js";
import { LoginView } from "./views/LoginView.js";
import { DashboardRouter } from "./views/DashboardRouter.js";
import { ChangeRequestDetail } from "./views/ChangeRequestDetail.js";
import { NewChangeRequest } from "./views/NewChangeRequest.js";

function AppShell({ children }: { children: React.ReactNode }) {
  const { session, clear } = useSession();
  async function logout() {
    await endpoints.logout();
    clear();
    window.location.assign("/login");
  }
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        {session && (
          <>
            <span>
              {" "}
              · {session.user.email} ({session.user.role})
            </span>
            <button type="button" onClick={logout}>
              Log out
            </button>
          </>
        )}
      </nav>
      {children}
    </div>
  );
}

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route
            path="/"
            element={
              <AuthGate>
                <AppShell>
                  <DashboardRouter />
                </AppShell>
              </AuthGate>
            }
          />
          <Route
            path="/new"
            element={
              <AuthGate>
                <AppShell>
                  <NewChangeRequest />
                </AppShell>
              </AuthGate>
            }
          />
          <Route
            path="/requests/:id"
            element={
              <AuthGate>
                <AppShell>
                  <ChangeRequestDetail />
                </AppShell>
              </AuthGate>
            }
          />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
