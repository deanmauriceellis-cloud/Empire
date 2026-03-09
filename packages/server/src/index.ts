import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { GAME_VERSION } from "@empire/shared";
import { GameManager } from "./GameManager.js";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(express.json());

const server = createServer(app);
const gameManager = new GameManager();

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
  res.json(gameManager.getActiveGames());
});

// ─── Static File Serving (production) ───────────────────────────────────────

// In production, serve client build from packages/client/dist
// app.use(express.static("../client/dist"));

server.listen(PORT, () => {
  console.log(`Empire Reborn server v${GAME_VERSION} listening on port ${PORT}`);
});
