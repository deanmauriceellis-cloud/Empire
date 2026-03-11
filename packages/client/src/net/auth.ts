// Empire Reborn — Client Auth State
// Manages login/registration, token storage, and WebSocket authentication.

import type { Connection } from "./connection.js";
import type { AuthKingdomInfo } from "@empire/shared";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AuthState {
  readonly isLoggedIn: boolean;
  readonly userId: number | null;
  readonly username: string | null;
  readonly token: string | null;
  readonly kingdoms: AuthKingdomInfo[];
}

export interface AuthEvents {
  onLogin: (userId: number, username: string) => void;
  onLogout: () => void;
  onKingdoms: (kingdoms: AuthKingdomInfo[]) => void;
  onError: (message: string) => void;
}

interface AuthResponse {
  userId: number;
  username: string;
  token: string;
  refreshToken: string;
  error?: string;
}

// ─── Storage Keys ───────────────────────────────────────────────────────────

const STORAGE_TOKEN = "empire_token";
const STORAGE_REFRESH = "empire_refresh_token";
const STORAGE_USERNAME = "empire_username";

// ─── Auth Client ────────────────────────────────────────────────────────────

export interface AuthClient extends AuthState {
  register(username: string, password: string): Promise<boolean>;
  login(username: string, password: string): Promise<boolean>;
  logout(): void;
  authenticateWs(conn: Connection): void;
  handleServerMessage(msg: any): boolean;
  restoreSession(conn: Connection): boolean;
}

export function createAuthClient(
  serverUrl: string,
  events: AuthEvents,
): AuthClient {
  let userId: number | null = null;
  let username: string | null = null;
  let token: string | null = null;
  let refreshToken: string | null = null;
  let kingdoms: AuthKingdomInfo[] = [];

  // Restore from localStorage
  token = localStorage.getItem(STORAGE_TOKEN);
  refreshToken = localStorage.getItem(STORAGE_REFRESH);
  username = localStorage.getItem(STORAGE_USERNAME);

  function saveTokens(t: string, rt: string, user: string): void {
    token = t;
    refreshToken = rt;
    localStorage.setItem(STORAGE_TOKEN, t);
    localStorage.setItem(STORAGE_REFRESH, rt);
    localStorage.setItem(STORAGE_USERNAME, user);
  }

  function clearTokens(): void {
    token = null;
    refreshToken = null;
    userId = null;
    username = null;
    kingdoms = [];
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_REFRESH);
    localStorage.removeItem(STORAGE_USERNAME);
  }

  async function authRequest(endpoint: string, body: Record<string, string>): Promise<AuthResponse | null> {
    try {
      const res = await fetch(`${serverUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        events.onError(data.error || "Request failed");
        return null;
      }
      return data as AuthResponse;
    } catch (err) {
      events.onError("Network error — could not reach server");
      return null;
    }
  }

  return {
    get isLoggedIn() { return userId !== null; },
    get userId() { return userId; },
    get username() { return username; },
    get token() { return token; },
    get kingdoms() { return kingdoms; },

    async register(user: string, password: string): Promise<boolean> {
      const data = await authRequest("/api/auth/register", { username: user, password });
      if (!data) return false;
      userId = data.userId;
      username = data.username;
      saveTokens(data.token, data.refreshToken, data.username);
      events.onLogin(data.userId, data.username);
      return true;
    },

    async login(user: string, password: string): Promise<boolean> {
      const data = await authRequest("/api/auth/login", { username: user, password });
      if (!data) return false;
      userId = data.userId;
      username = data.username;
      saveTokens(data.token, data.refreshToken, data.username);
      events.onLogin(data.userId, data.username);
      return true;
    },

    logout(): void {
      clearTokens();
      events.onLogout();
    },

    authenticateWs(conn: Connection): void {
      if (!token) return;
      conn.send({ type: "authenticate", token } as any);
    },

    handleServerMessage(msg: any): boolean {
      if (msg.type === "authenticated") {
        userId = msg.userId;
        username = msg.username;
        return true;
      }
      if (msg.type === "auth_kingdoms") {
        kingdoms = msg.kingdoms ?? [];
        events.onKingdoms(kingdoms);
        return true;
      }
      if (msg.type === "auth_error") {
        events.onError(msg.message);
        // Token might be expired — try refresh
        if (refreshToken) {
          tryRefresh();
        } else {
          clearTokens();
          events.onLogout();
        }
        return true;
      }
      return false;
    },

    restoreSession(conn: Connection): boolean {
      if (!token) return false;
      conn.send({ type: "authenticate", token } as any);
      return true;
    },
  };

  async function tryRefresh(): Promise<void> {
    if (!refreshToken) return;
    try {
      const res = await fetch(`${serverUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        events.onLogout();
        return;
      }
      const data = await res.json();
      saveTokens(data.token, data.refreshToken, username || "");
    } catch {
      clearTokens();
      events.onLogout();
    }
  }
}

/** Get the server HTTP URL for auth requests. */
export function getServerUrl(host?: string): string {
  if (host) {
    return host.replace(/\/$/, "");
  }
  return `${location.protocol}//${location.host}`;
}
