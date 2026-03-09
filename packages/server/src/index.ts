import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { GAME_VERSION } from "@empire/shared";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: WebSocket) => {
  console.log("WebSocket client connected");
  ws.send(JSON.stringify({ type: "welcome", version: GAME_VERSION }));

  ws.on("message", (data) => {
    console.log("Received:", data.toString());
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: GAME_VERSION });
});

server.listen(PORT, () => {
  console.log(`Empire Reborn server v${GAME_VERSION} listening on port ${PORT}`);
});
