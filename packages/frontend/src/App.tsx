/**
 * Application root with styled shell, error boundary, and routing.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";

import { SessionProvider, AuthGate, useSession } from "./auth/SessionContext.js";
import { endpoints } from "./api/endpoints.js";
import { LoginView } from "./views/LoginView.js";
import { DashboardRouter } from "./views/DashboardRouter.js";
import { ChangeRequestDetail } from "./views/ChangeRequestDetail.js";
import { NewChangeRequest } from "./views/NewChangeRequest.js";
import { ReportsView } from "./views/ReportsView.js";

// --- Error Boundary --------------------------------------------------------
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-4">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.assign("/"); }}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
            >
              Back to home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- App Shell -------------------------------------------------------------
function AppShell({ children }: { children: ReactNode }) {
  const { session, clear } = useSession();
  async function logout() {
    await endpoints.logout();
    clear();
    window.location.assign("/login");
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-xl font-bold text-primary">
            BugPixel
          </Link>
          {session && (
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <Link to="/" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
              <Link to="/reports" className="text-gray-600 hover:text-gray-900">Reports</Link>
              {session.user.role === "Client" && (
                <Link to="/new" className="text-primary font-medium hover:text-primary-hover">
                  + New Request
                </Link>
              )}
            </div>
          )}
        </div>
        {session && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {session.user.email}
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-primary-light text-primary font-medium">
                {session.user.role}
              </span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg"
            >
              Log out
            </button>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}

// --- Routes ----------------------------------------------------------------
export function App() {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginView />} />
            <Route
              path="/"
              element={
                <AuthGate>
                  <AppShell><DashboardRouter /></AppShell>
                </AuthGate>
              }
            />
            <Route
              path="/new"
              element={
                <AuthGate>
                  <AppShell><NewChangeRequest /></AppShell>
                </AuthGate>
              }
            />
            <Route
              path="/requests/:id"
              element={
                <AuthGate>
                  <AppShell><ChangeRequestDetail /></AppShell>
                </AuthGate>
              }
            />
            <Route
              path="/reports"
              element={
                <AuthGate>
                  <AppShell><ReportsView /></AppShell>
                </AuthGate>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </ErrorBoundary>
  );
}
