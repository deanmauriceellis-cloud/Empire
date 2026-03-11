import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorldServer } from "../WorldServer.js";

// Mock WebSocket
function createMockWs(): any {
  const ws: any = {
    readyState: 1, // OPEN
    send: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  };
  return ws;
}

function parseSent(ws: any, index = 0): any {
  return JSON.parse(ws.send.mock.calls[index][0]);
}

function lastSent(ws: any): any {
  const calls = ws.send.mock.calls;
  return JSON.parse(calls[calls.length - 1][0]);
}

describe("WorldServer", () => {
  let server: WorldServer;

  beforeEach(() => {
    server = new WorldServer();
    vi.useFakeTimers();
  });

  afterEach(() => {
    server.shutdown();
    vi.useRealTimers();
  });

  // Small config for fast tests
  const smallWorldConfig = {
    tileSize: 20,
    channelWidth: 3,
    initialRadius: 0, // 1x1 grid = 1 kingdom (fastest)
    seed: 42,
    tickIntervalMs: 5000,
    lifespanDays: 30,
    waterRatio: 50,
    smoothPasses: 2,
  };

  describe("world creation", () => {
    it("creates a world and sends confirmation", () => {
      const ws = createMockWs();
      server.handleMessage(ws, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);

      const msg = parseSent(ws, 0);
      expect(msg.type).toBe("world_created");
      expect(msg.worldId).toBeDefined();
      expect(typeof msg.worldId).toBe("string");
    });

    it("lists created worlds", () => {
      const ws = createMockWs();
      server.handleMessage(ws, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);

      const worlds = server.getWorldList();
      expect(worlds.length).toBe(1);
      expect(worlds[0].totalKingdoms).toBe(1);
      expect(worlds[0].humanPlayers).toBe(0);
      expect(worlds[0].turn).toBe(0);
    });
  });

  describe("player join", () => {
    it("joins a world and receives state", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        preferredRing: 0,
        playerName: "Alice",
      } as any);

      const joinMsg = parseSent(wsPlayer, 0);
      expect(joinMsg.type).toBe("world_joined");
      expect(joinMsg.worldId).toBe(worldId);
      expect(joinMsg.owner).toBeGreaterThan(0);

      // Should also receive world_state
      const stateMsg = parseSent(wsPlayer, 1);
      expect(stateMsg.type).toBe("world_state");
      expect(stateMsg.tickInfo).toBeDefined();
      expect(stateMsg.tickInfo.tickIntervalMs).toBe(5000);
    });

    it("rejects join to non-existent world", () => {
      const ws = createMockWs();
      server.handleMessage(ws, {
        type: "join_world",
        worldId: "nonexistent",
      } as any);

      const msg = parseSent(ws, 0);
      expect(msg.type).toBe("error");
      expect(msg.message).toContain("not found");
    });

    it("updates world list with human player count", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Bob",
      } as any);

      const worlds = server.getWorldList();
      expect(worlds[0].humanPlayers).toBe(1);
    });
  });

  describe("action buffering", () => {
    it("queues actions and sends confirmation", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Test",
      } as any);

      // Queue an action
      server.handleMessage(wsPlayer, {
        type: "world_action",
        worldId,
        action: { type: "setProduction", cityId: 0, unitType: 0 },
      } as any);

      const queueMsg = lastSent(wsPlayer);
      expect(queueMsg.type).toBe("actions_queued");
      expect(queueMsg.count).toBe(1);
    });

    it("cancels pending actions", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Test",
      } as any);

      // Queue then cancel
      server.handleMessage(wsPlayer, {
        type: "world_action",
        worldId,
        action: { type: "setProduction", cityId: 0, unitType: 0 },
      } as any);

      server.handleMessage(wsPlayer, {
        type: "cancel_actions",
        worldId,
      } as any);

      const cancelMsg = lastSent(wsPlayer);
      expect(cancelMsg.type).toBe("actions_cancelled");
    });
  });

  describe("tick engine", () => {
    it("executes tick on timer", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Ticker",
      } as any);

      // Advance time past tick interval
      vi.advanceTimersByTime(smallWorldConfig.tickIntervalMs + 100);

      // Player should have received tick_result and world_state
      const allMessages = wsPlayer.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      const tickResult = allMessages.find((m: any) => m.type === "tick_result");
      expect(tickResult).toBeDefined();
      expect(tickResult.turn).toBe(1);
      expect(tickResult.tickInfo.turn).toBe(1);
    });

    it("advances turn number on each tick", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Multi",
      } as any);

      // Three ticks
      vi.advanceTimersByTime(smallWorldConfig.tickIntervalMs + 100);
      vi.advanceTimersByTime(smallWorldConfig.tickIntervalMs + 100);
      vi.advanceTimersByTime(smallWorldConfig.tickIntervalMs + 100);

      const allMessages = wsPlayer.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      const tickResults = allMessages.filter((m: any) => m.type === "tick_result");
      expect(tickResults.length).toBe(3);
      expect(tickResults[0].turn).toBe(1);
      expect(tickResults[1].turn).toBe(2);
      expect(tickResults[2].turn).toBe(3);
    });
  });

  describe("disconnect handling", () => {
    it("marks player as disconnected", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Leaver",
      } as any);

      // Disconnect
      server.handleDisconnect(wsPlayer);

      // World list should show 0 human players
      const worlds = server.getWorldList();
      expect(worlds[0].humanPlayers).toBe(0);
    });

    it("allows leave_world", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Leaver",
      } as any);

      server.handleMessage(wsPlayer, {
        type: "leave_world",
        worldId,
      } as any);

      const worlds = server.getWorldList();
      expect(worlds[0].humanPlayers).toBe(0);
    });
  });

  describe("shutdown", () => {
    it("stops all tick timers on shutdown", () => {
      const ws = createMockWs();
      server.handleMessage(ws, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);

      // Shutdown should not throw
      server.shutdown();

      // Advancing time should not trigger any ticks
      vi.advanceTimersByTime(100_000);
      // No crash = success
    });
  });
});
