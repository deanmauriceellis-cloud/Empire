import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { GAME_VERSION } from "@empire/shared";
import { GameManager } from "./GameManager.js";
import { GameDatabase } from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3001;
const IS_DEV = process.env.NODE_ENV !== "production";
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") ?? [];

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS — restrictive in production, permissive in dev
app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  if (IS_DEV || ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const server = createServer(app);
const db = new GameDatabase();
const gameManager = new GameManager(db);

// WebSocket server — 256KB max message size
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 256 * 1024 });

wss.on("connection", (ws) => {
  gameManager.handleConnection(ws);
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
