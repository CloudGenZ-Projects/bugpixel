/**
 * Dashboard router: renders the role-appropriate dashboard (Req 2.2).
 */
import { useSession } from "../auth/SessionContext.js";
import { ClientDashboard } from "./ClientDashboard.js";
import { DeveloperDashboard } from "./DeveloperDashboard.js";
import { AdminDashboard } from "./AdminDashboard.js";

export function DashboardRouter() {
  const { session } = useSession();
  if (!session) return null;
  switch (session.view) {
    case "client":
      return <ClientDashboard />;
    case "developer":
      return <DeveloperDashboard />;
    case "admin":
      return <AdminDashboard />;
  }
}
