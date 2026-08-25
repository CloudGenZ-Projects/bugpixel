/**
 * Login view: posts credentials, shows an auth error on failure, refreshes the
 * session and navigates to the dashboard on success (Req 1.1, 1.2).
 */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiClientError } from "../api/client.js";
import { endpoints } from "../api/endpoints.js";
import { useSession } from "../auth/SessionContext.js";

export function LoginView() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { refresh } = useSession();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await endpoints.login(identifier, password);
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message || "Invalid credentials.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Change Request Portal</h1>
      <form onSubmit={onSubmit} aria-label="login form">
        <label>
          Email
          <input
            type="email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
