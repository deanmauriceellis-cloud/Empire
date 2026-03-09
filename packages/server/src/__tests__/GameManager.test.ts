import { describe, it, expect, beforeEach, vi } from "vitest";
import { WebSocket } from "ws";
import { GameManager } from "../GameManager.js";
import type { ClientMessage, ServerMessage } from "../protocol.js";
import { Owner, UnitType } from "@empire/shared";

// ─── Mock WebSocket ─────────────────────────────────────────────────────────

function createMockWs(): WebSocket {
  const handlers = new Map<string, Function>();
  const messages: ServerMessage[] = [];

  const ws = {
    readyState: WebSocket.OPEN,
    send: vi.fn((data: string) => {
      messages.push(JSON.parse(data));
    }),
    on: vi.fn((event: string, handler: Function) => {
      handlers.set(event, handler);
    }),
    close: vi.fn(),
    // Test helpers
    _messages: messages,
    _handlers: handlers,
    _simulateMessage(msg: ClientMessage) {
      const handler = handlers.get("message");
      if (handler) handler(Buffer.from(JSON.stringify(msg)));
    },
    _simulateClose() {
      const handler = handlers.get("close");
      if (handler) handler();
    },
    _lastMessage(): ServerMessage {
      return messages[messages.length - 1];
    },
    _messagesOfType<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
      return messages.filter((m) => m.type === type) as any;
    },
  } as unknown as WebSocket & {
    _messages: ServerMessage[];
    _handlers: Map<string, Function>;
    _simulateMessage(msg: ClientMessage): void;
    _simulateClose(): void;
    _lastMessage(): ServerMessage;
    _messagesOfType<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[];
  };

  return ws;
}

type MockWs = ReturnType<typeof createMockWs>;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GameManager", () => {
  let manager: GameManager;

  beforeEach(() => {
    manager = new GameManager();
  });

  describe("connection", () => {
    it("sends welcome message on connect", () => {
      const ws = createMockWs() as MockWs;
      manager.handleConnection(ws);

      expect(ws._messages[0]).toEqual({ type: "welcome", version: "0.1.0" });
    });
  });

  describe("create_game", () => {
    it("creates a game and assigns player 1", () => {
      const ws = createMockWs() as MockWs;
      manager.handleConnection(ws);

      ws._simulateMessage({ type: "create_game" });

      const created = ws._messagesOfType("game_created")[0];
      expect(created).toBeDefined();
      expect(created.owner).toBe(Owner.Player1);
      expect(created.gameId).toHaveLength(8);
    });

    it("game appears in active games list", () => {
      const ws = createMockWs() as MockWs;
      manager.handleConnection(ws);

      ws._simulateMessage({ type: "create_game" });

      const games = manager.getActiveGames();
      expect(games).toHaveLength(1);
      expect(games[0].phase).toBe("lobby");
      expect(games[0].players).toBe(1);
    });
  });

  describe("join_game", () => {
    it("player 2 joins and game starts", () => {
      const ws1 = createMockWs() as MockWs;
      const ws2 = createMockWs() as MockWs;

      manager.handleConnection(ws1);
      manager.handleConnection(ws2);

      ws1._simulateMessage({ type: "create_game" });
      const gameId = ws1._messagesOfType("game_created")[0].gameId;

      ws2._simulateMessage({ type: "join_game", gameId });

      // Player 2 should get game_joined + game_started + state_update
      const joined = ws2._messagesOfType("game_joined")[0];
      expect(joined).toBeDefined();
      expect(joined.owner).toBe(Owner.Player2);

      const started = ws2._messagesOfType("game_started")[0];
      expect(started).toBeDefined();

      // Both players get state updates
      const p1State = ws1._messagesOfType("state_update")[0];
      const p2State = ws2._messagesOfType("state_update")[0];
      expect(p1State).toBeDefined();
      expect(p2State).toBeDefined();
      expect(p1State.state.owner).toBe(Owner.Player1);
      expect(p2State.state.owner).toBe(Owner.Player2);
    });

    it("rejects joining non-existent game", () => {
      const ws = createMockWs() as MockWs;
      manager.handleConnection(ws);

      ws._simulateMessage({ type: "join_game", gameId: "nope" });

      const error = ws._messagesOfType("error")[0];
      expect(error.message).toContain("not found");
    });

    it("rejects joining a full game", () => {
      const ws1 = createMockWs() as MockWs;
      const ws2 = createMockWs() as MockWs;
      const ws3 = createMockWs() as MockWs;

      manager.handleConnection(ws1);
      manager.handleConnection(ws2);
      manager.handleConnection(ws3);

      ws1._simulateMessage({ type: "create_game" });
      const gameId = ws1._messagesOfType("game_created")[0].gameId;

      ws2._simulateMessage({ type: "join_game", gameId });
      ws3._simulateMessage({ type: "join_game", gameId });

      const error = ws3._messagesOfType("error")[0];
      expect(error.message).toContain("already in progress");
    });
  });

  describe("turn execution", () => {
    function createStartedGame() {
      const ws1 = createMockWs() as MockWs;
      const ws2 = createMockWs() as MockWs;

      manager.handleConnection(ws1);
      manager.handleConnection(ws2);

      ws1._simulateMessage({ type: "create_game" });
      const gameId = ws1._messagesOfType("game_created")[0].gameId;

      ws2._simulateMessage({ type: "join_game", gameId });

      return { ws1, ws2, gameId };
    }

    it("executes turn when both players end turn", () => {
      const { ws1, ws2, gameId } = createStartedGame();

      // Clear messages to count new ones
      ws1._messages.length = 0;
      ws2._messages.length = 0;

      ws1._simulateMessage({ type: "end_turn", gameId });
      // Should not execute yet (only p1 ended)
      expect(ws1._messagesOfType("turn_result")).toHaveLength(0);

      ws2._simulateMessage({ type: "end_turn", gameId });
      // Now both ended — turn should execute
      expect(ws1._messagesOfType("turn_result")).toHaveLength(1);
      expect(ws2._messagesOfType("turn_result")).toHaveLength(1);
    });

    it("accepts and processes set_production action", () => {
      const { ws1, ws2, gameId } = createStartedGame();

      // Find player 1's city
      const p1State = ws1._messagesOfType("state_update")[0];
      const p1City = p1State.state.cities.find((c) => c.owner === Owner.Player1);
      expect(p1City).toBeDefined();

      ws1._simulateMessage({
        type: "action",
        gameId,
        action: { type: "setProduction", cityId: p1City!.id, unitType: UnitType.Army },
      });

      // Should not error
      expect(ws1._messagesOfType("error")).toHaveLength(0);
    });

    it("rejects action on enemy unit", () => {
      const { ws1, ws2, gameId } = createStartedGame();

      // Player 1 tries to command player 2's city
      const p2State = ws2._messagesOfType("state_update")[0];
      const p2City = p2State.state.cities.find((c) => c.owner === Owner.Player2);

      if (p2City) {
        ws1._simulateMessage({
          type: "action",
          gameId,
          action: { type: "setProduction", cityId: p2City.id, unitType: UnitType.Army },
        });

        const error = ws1._messagesOfType("error");
        expect(error.length).toBeGreaterThan(0);
      }
    });
  });

  describe("resign", () => {
    it("ends game when player resigns", () => {
      const ws1 = createMockWs() as MockWs;
      const ws2 = createMockWs() as MockWs;

      manager.handleConnection(ws1);
      manager.handleConnection(ws2);

      ws1._simulateMessage({ type: "create_game" });
      const gameId = ws1._messagesOfType("game_created")[0].gameId;
      ws2._simulateMessage({ type: "join_game", gameId });

      ws1._simulateMessage({ type: "resign", gameId });

      const gameOver1 = ws1._messagesOfType("game_over")[0];
      const gameOver2 = ws2._messagesOfType("game_over")[0];
      expect(gameOver1.winner).toBe(Owner.Player2);
      expect(gameOver1.winType).toBe("resignation");
      expect(gameOver2.winner).toBe(Owner.Player2);
    });
  });

  describe("visible state", () => {
    it("hides enemy city production", () => {
      const ws1 = createMockWs() as MockWs;
      const ws2 = createMockWs() as MockWs;

      manager.handleConnection(ws1);
      manager.handleConnection(ws2);

      ws1._simulateMessage({ type: "create_game" });
      const gameId = ws1._messagesOfType("game_created")[0].gameId;
      ws2._simulateMessage({ type: "join_game", gameId });

      const p1State = ws1._messagesOfType("state_update")[0];
      const enemyCities = p1State.state.cities.filter((c) => c.owner === Owner.Player2);
      // Enemy cities (if visible at all) should have null production/work
      for (const city of enemyCities) {
        expect(city.production).toBeNull();
        expect(city.work).toBeNull();
      }
    });

    it("shows own city production", () => {
      const ws1 = createMockWs() as MockWs;
      const ws2 = createMockWs() as MockWs;

      manager.handleConnection(ws1);
      manager.handleConnection(ws2);

      ws1._simulateMessage({ type: "create_game" });
      const gameId = ws1._messagesOfType("game_created")[0].gameId;
      ws2._simulateMessage({ type: "join_game", gameId });

      const p1State = ws1._messagesOfType("state_update")[0];
      const ownCities = p1State.state.cities.filter((c) => c.owner === Owner.Player1);
      for (const city of ownCities) {
        expect(city.production).not.toBeNull();
        expect(city.work).not.toBeNull();
      }
    });
  });

  describe("disconnect / reconnect", () => {
    it("notifies other player on disconnect", () => {
      const ws1 = createMockWs() as MockWs;
      const ws2 = createMockWs() as MockWs;

      manager.handleConnection(ws1);
      manager.handleConnection(ws2);

      ws1._simulateMessage({ type: "create_game" });
      const gameId = ws1._messagesOfType("game_created")[0].gameId;
      ws2._simulateMessage({ type: "join_game", gameId });

      ws2._messages.length = 0;
      ws1._simulateClose();

      const disconnected = ws2._messagesOfType("player_disconnected")[0];
      expect(disconnected).toBeDefined();
      expect(disconnected.gameId).toBe(gameId);
    });

    it("allows reconnection", () => {
      const ws1 = createMockWs() as MockWs;
      const ws2 = createMockWs() as MockWs;

      manager.handleConnection(ws1);
      manager.handleConnection(ws2);

      ws1._simulateMessage({ type: "create_game" });
      const gameId = ws1._messagesOfType("game_created")[0].gameId;
      ws2._simulateMessage({ type: "join_game", gameId });

      // Player 1 disconnects
      ws1._simulateClose();

      // Player 1 reconnects with new WebSocket
      const ws1b = createMockWs() as MockWs;
      manager.handleConnection(ws1b);
      ws1b._simulateMessage({ type: "join_game", gameId });

      const joined = ws1b._messagesOfType("game_joined")[0];
      expect(joined).toBeDefined();
      expect(joined.owner).toBe(Owner.Player1);
      expect(joined.phase).toBe("playing");

      // Should also get state update
      const stateUpdate = ws1b._messagesOfType("state_update")[0];
      expect(stateUpdate).toBeDefined();
    });

    it("cleans up lobby game when creator disconnects", () => {
      const ws = createMockWs() as MockWs;
      manager.handleConnection(ws);

      ws._simulateMessage({ type: "create_game" });

      expect(manager.getActiveGames()).toHaveLength(1);

      ws._simulateClose();

      expect(manager.getActiveGames()).toHaveLength(0);
    });
  });
});
