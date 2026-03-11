import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { GAME_VERSION } from "@empire/shared";
import { GameManager } from "./GameManager.js";
import { WorldServer } from "./WorldServer.js";
import { GameDatabase } from "./database.js";
import {
  hashPassword,
  verifyPassword,
  validateUsername,
  validatePassword,
  createTokens,
  verifyToken,
  verifyRefreshToken,
  type TokenPayload,
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3001;
const IS_DEV = process.env.NODE_ENV !== "production";
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") ?? [];

const app = express();
app.use(express.json({ limit: "1mb" }));

/** Map WebSocket → authenticated user info (null = unauthenticated). */
const wsAuth = new Map<WebSocket, TokenPayload | null>();

// CORS — restrictive in production, permissive in dev
app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  if (IS_DEV || ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const server = createServer(app);
const db = new GameDatabase();
const gameManager = new GameManager(db);
const worldServer = new WorldServer(db);

// WebSocket server — 256KB max message size
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 256 * 1024 });

/** World message types that should be routed to WorldServer. */
const WORLD_MSG_TYPES = new Set([
  "create_world", "join_world", "reconnect_world", "world_action", "cancel_actions", "leave_world", "list_worlds",
]);

/** Messages that require authentication. */
const AUTH_REQUIRED_TYPES = new Set([
  "join_world", "reconnect_world",
]);

wss.on("connection", (ws) => {
  wsAuth.set(ws, null);

  // Send welcome to all new connections
  ws.send(JSON.stringify({ type: "welcome", version: GAME_VERSION }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Handle authenticate message
      if (msg.type === "authenticate") {
        const payload = verifyToken(msg.token);
        if (!payload) {
          ws.send(JSON.stringify({ type: "auth_error", message: "Invalid or expired token" }));
          return;
        }
        // Verify user still exists
        const user = db.getUserById(payload.userId);
        if (!user) {
          ws.send(JSON.stringify({ type: "auth_error", message: "User not found" }));
          return;
        }
        wsAuth.set(ws, payload);
        // Send auth confirmation + active kingdoms
        const kingdoms = db.getActiveKingdomsForUser(payload.userId);
        ws.send(JSON.stringify({
          type: "authenticated",
          userId: payload.userId,
          username: payload.username,
        }));
        ws.send(JSON.stringify({
          type: "auth_kingdoms",
          kingdoms: kingdoms.map(k => ({
            worldId: k.world_id,
            playerId: k.player_id,
            kingdomName: k.kingdom_name,
            status: k.status,
          })),
        }));
        return;
      }

      // Check auth for protected world messages
      if (AUTH_REQUIRED_TYPES.has(msg.type)) {
        const auth = wsAuth.get(ws);
        if (!auth) {
          ws.send(JSON.stringify({ type: "auth_error", message: "Authentication required" }));
          return;
        }
      }

      if (WORLD_MSG_TYPES.has(msg.type)) {
        // Pass auth info to WorldServer for join/reconnect
        const auth = wsAuth.get(ws);
        worldServer.handleMessage(ws, msg, auth ?? undefined);
      } else {
        gameManager.handleMessage(ws, msg);
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
    }
  });

  ws.on("close", () => {
    wsAuth.delete(ws);
    gameManager.handleDisconnect(ws);
    worldServer.handleDisconnect(ws);
  });
});

// ─── REST Endpoints ─────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: GAME_VERSION });
});

app.get("/api/games", (_req, res) => {
  res.json({
    active: gameManager.getActiveGames(),
    saved: gameManager.getSavedGames(),
  });
});

app.post("/api/games/:id/resume", (req, res) => {
  const { id } = req.params;
  const ok = gameManager.resumeGame(id);
  if (!ok) {
    res.status(404).json({ error: "Game not found or cannot be resumed" });
    return;
  }
  res.json({ gameId: id, message: "Game resumed — connect via WebSocket to rejoin" });
});

app.get("/api/worlds", (_req, res) => {
  res.json({ worlds: worldServer.getWorldList() });
});

// ─── Auth Endpoints ─────────────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;

  const usernameErr = validateUsername(username);
  if (usernameErr) { res.status(400).json({ error: usernameErr }); return; }

  const passwordErr = validatePassword(password);
  if (passwordErr) { res.status(400).json({ error: passwordErr }); return; }

  // Check if username already exists
  const existing = db.getUserByUsername(username);
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const hash = await hashPassword(password);
  const userId = db.createUser(username, hash);
  const tokens = createTokens({ userId, username });

  res.status(201).json({
    userId,
    username,
    ...tokens,
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const user = db.getUserByUsername(username);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  db.updateLastLogin(user.id);
  const tokens = createTokens({ userId: user.id, username: user.username });

  res.json({
    userId: user.id,
    username: user.username,
    ...tokens,
  });
});

app.post("/api/auth/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "Refresh token is required" });
    return;
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  // Verify user still exists
  const user = db.getUserById(payload.userId);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const tokens = createTokens({ userId: payload.userId, username: payload.username });
  res.json(tokens);
});

app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = db.getUserById(payload.userId);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const kingdoms = db.getActiveKingdomsForUser(payload.userId);
  res.json({
    userId: user.id,
    username: user.username,
    createdAt: user.created_at,
    kingdoms: kingdoms.map(k => ({
      worldId: k.world_id,
      playerId: k.player_id,
      kingdomName: k.kingdom_name,
      status: k.status,
    })),
  });
});

app.delete("/api/games/:id", (req, res) => {
  const { id } = req.params;
  const ok = gameManager.deleteSavedGame(id);
  if (!ok) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json({ message: "Game deleted" });
});

// ─── Diagnostic Logging (dev only) ───────────────────────────────────────────

const LOG_FILE = path.resolve(__dirname, "../../../game-debug.log");

if (IS_DEV) {
  app.post("/api/gamelog", (req, res) => {
    const { text } = req.body;
    if (typeof text !== "string") {
      res.status(400).json({ error: "Missing text field" });
      return;
    }
    fs.appendFileSync(LOG_FILE, text + "\n");
    res.json({ ok: true });
  });

  app.delete("/api/gamelog", (_req, res) => {
    try { fs.writeFileSync(LOG_FILE, ""); } catch { /* ignore */ }
    res.json({ ok: true });
  });
}

// ─── Static File Serving (production) ───────────────────────────────────────

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));

// SPA fallback — serve index.html for any non-API, non-WS route
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

server.listen(PORT, () => {
  console.log(`Empire Reborn server v${GAME_VERSION} listening on port ${PORT}${IS_DEV ? " (dev)" : ""}`);
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\n${signal} received — shutting down gracefully…`);
  gameManager.shutdown();
  worldServer.shutdown();

  // Close all WebSocket connections
  for (const ws of wss.clients) {
    ws.close(1001, "Server shutting down");
  }

  server.close(() => {
    db.close();
    console.log("Server stopped.");
    process.exit(0);
  });

  // Force exit after 5s if server.close() hangs
  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
