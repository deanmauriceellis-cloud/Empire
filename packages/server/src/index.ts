import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { GAME_VERSION } from "@empire/shared";
import { GameManager } from "./GameManager.js";
import { GameDatabase } from "./database.js";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(express.json());

const server = createServer(app);
const db = new GameDatabase();
const gameManager = new GameManager(db);

// WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

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

// ─── Static File Serving (production) ───────────────────────────────────────

// In production, serve client build from packages/client/dist
// app.use(express.static("../client/dist"));

server.listen(PORT, () => {
  console.log(`Empire Reborn server v${GAME_VERSION} listening on port ${PORT}`);
});
