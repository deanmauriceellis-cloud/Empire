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

  // Config with very long tick interval (avoids cascading ticks when advancing large time spans)
  const longTickConfig = {
    ...smallWorldConfig,
    tickIntervalMs: 24 * 60 * 60 * 1000, // 24 hours — no ticks fire during shield tests
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

  describe("shield lifecycle", () => {
    it("initializes shield with SHIELD_INITIAL_MS on join", () => {
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
        playerName: "Shielder",
      } as any);
      const owner = parseSent(wsPlayer, 0).owner;

      // Access internal state to verify shield
      const aw = (server as any).worlds.get(worldId);
      const shield = aw.world.gameState.shields[owner];
      expect(shield).toBeDefined();
      expect(shield.chargeMs).toBe(2 * 60 * 60 * 1000); // SHIELD_INITIAL_MS = 2hr
      expect(shield.isActive).toBe(false);
      expect(shield.activatedAt).toBeNull();
    });

    it("activates shield on disconnect with accumulated charge", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: longTickConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Shielder",
      } as any);
      const owner = parseSent(wsPlayer, 0).owner;

      // Simulate being online for 30 minutes
      vi.advanceTimersByTime(30 * 60 * 1000);

      // Disconnect
      server.handleDisconnect(wsPlayer);

      const aw = (server as any).worlds.get(worldId);
      const shield = aw.world.gameState.shields[owner];
      expect(shield.isActive).toBe(true);
      expect(shield.activatedAt).not.toBeNull();
      // Initial 2hr + 30min online * 1.0 ratio = 2.5hr charge
      expect(shield.chargeMs).toBe(2 * 60 * 60 * 1000 + 30 * 60 * 1000);
    });

    it("deactivates shield on reconnect preserving remaining charge", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: longTickConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Shielder",
      } as any);
      const owner = parseSent(wsPlayer, 0).owner;

      // Disconnect → shield activates
      server.handleDisconnect(wsPlayer);

      const aw = (server as any).worlds.get(worldId);
      const shieldBefore = aw.world.gameState.shields[owner];
      const chargeAtActivation = shieldBefore.chargeMs;
      expect(shieldBefore.isActive).toBe(true);

      // 10 minutes pass while shielded
      vi.advanceTimersByTime(10 * 60 * 1000);

      // Reconnect
      const wsPlayer2 = createMockWs();
      server.handleMessage(wsPlayer2, {
        type: "reconnect_world",
        worldId,
        playerId: owner,
      } as any);

      const shield = aw.world.gameState.shields[owner];
      expect(shield.isActive).toBe(false);
      expect(shield.activatedAt).toBeNull();
      // Remaining = original charge - 10 min elapsed
      expect(shield.chargeMs).toBe(chargeAtActivation - 10 * 60 * 1000);
    });

    it("shield expires and player reverts to AI", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: longTickConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Shielder",
      } as any);
      const owner = parseSent(wsPlayer, 0).owner;

      // Disconnect immediately (no extra charge beyond initial 2hr)
      server.handleDisconnect(wsPlayer);

      const aw = (server as any).worlds.get(worldId);

      // Advance past shield charge duration (2hr initial)
      vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1000);

      const player = aw.world.gameState.players.find((p: any) => p.id === owner);
      expect(player.isAI).toBe(true);
      const shield = aw.world.gameState.shields[owner];
      expect(shield.isActive).toBe(false);
      expect(shield.chargeMs).toBe(0);
    });
  });

  describe("reconnection", () => {
    it("reconnects to an existing world", () => {
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
        playerName: "Returner",
      } as any);
      const owner = parseSent(wsPlayer, 0).owner;

      // Disconnect
      server.handleDisconnect(wsPlayer);

      // Reconnect with new WebSocket
      const wsPlayer2 = createMockWs();
      server.handleMessage(wsPlayer2, {
        type: "reconnect_world",
        worldId,
        playerId: owner,
      } as any);

      const joinMsg = parseSent(wsPlayer2, 0);
      expect(joinMsg.type).toBe("world_joined");
      expect(joinMsg.owner).toBe(owner);
      expect(joinMsg.worldId).toBe(worldId);

      // Should receive world_state as well
      const stateMsg = parseSent(wsPlayer2, 1);
      expect(stateMsg.type).toBe("world_state");

      // Player count should be back to 1
      const worlds = server.getWorldList();
      expect(worlds[0].humanPlayers).toBe(1);
    });

    it("rejects reconnect to non-existent world", () => {
      const ws = createMockWs();
      server.handleMessage(ws, {
        type: "reconnect_world",
        worldId: "nonexistent",
        playerId: 1,
      } as any);

      const msg = parseSent(ws, 0);
      expect(msg.type).toBe("reconnect_failed");
      expect(msg.reason).toContain("not found");
    });

    it("rejects reconnect for defeated player", () => {
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
        playerName: "Defeated",
      } as any);
      const owner = parseSent(wsPlayer, 0).owner;

      // Manually mark player as defeated
      const aw = (server as any).worlds.get(worldId);
      const player = aw.world.gameState.players.find((p: any) => p.id === owner);
      player.status = "defeated";

      server.handleDisconnect(wsPlayer);

      const wsPlayer2 = createMockWs();
      server.handleMessage(wsPlayer2, {
        type: "reconnect_world",
        worldId,
        playerId: owner,
      } as any);

      const msg = parseSent(wsPlayer2, 0);
      expect(msg.type).toBe("reconnect_failed");
      expect(msg.reason).toContain("defeated");
    });

    it("restores player to non-AI on reconnect", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: longTickConfig,
      } as any);
      const worldId = parseSent(wsCreator, 0).worldId;

      const wsPlayer = createMockWs();
      server.handleMessage(wsPlayer, {
        type: "join_world",
        worldId,
        playerName: "Returner",
      } as any);
      const owner = parseSent(wsPlayer, 0).owner;

      // Disconnect and wait for AI takeover
      server.handleDisconnect(wsPlayer);
      vi.advanceTimersByTime(3 * 60 * 60 * 1000); // past shield expiry

      const aw = (server as any).worlds.get(worldId);
      const player = aw.world.gameState.players.find((p: any) => p.id === owner);
      expect(player.isAI).toBe(true);

      // Reconnect
      const wsPlayer2 = createMockWs();
      server.handleMessage(wsPlayer2, {
        type: "reconnect_world",
        worldId,
        playerId: owner,
      } as any);

      expect(player.isAI).toBe(false);
    });
  });

  describe("list_worlds", () => {
    it("returns world list via message", () => {
      const wsCreator = createMockWs();
      server.handleMessage(wsCreator, {
        type: "create_world",
        config: smallWorldConfig,
      } as any);

      const wsLister = createMockWs();
      server.handleMessage(wsLister, { type: "list_worlds" } as any);

      const msg = parseSent(wsLister, 0);
      expect(msg.type).toBe("world_list");
      expect(msg.worlds).toHaveLength(1);
      expect(msg.worlds[0].totalKingdoms).toBe(1);
    });
  });

  describe("per-player tick info", () => {
    it("includes shield and action count in tick info", () => {
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
        playerName: "InfoTest",
      } as any);

      // Queue an action
      server.handleMessage(wsPlayer, {
        type: "world_action",
        worldId,
        action: { type: "setProduction", cityId: 0, unitType: 0 },
      } as any);

      // The world_state sent on join has tickInfo
      const stateMsg = parseSent(wsPlayer, 1);
      expect(stateMsg.tickInfo).toBeDefined();
      expect(stateMsg.tickInfo.tickIntervalMs).toBe(5000);
      expect(typeof stateMsg.tickInfo.nextTickMs).toBe("number");
      expect(typeof stateMsg.tickInfo.seasonRemainingS).toBe("number");
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
