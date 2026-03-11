// Empire Reborn — World Server (Tick-Based Kingdom Mode)
// Manages persistent worlds with tick-based turns, AI kingdoms, and player join/leave.
// Phase 14: Delta sync — sends per-tick deltas instead of full state, with gzip compression
// for reconnection and WebSocket heartbeat for connection management.

import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  type GameState,
  type PlayerAction,
  type TurnResult,
  type UnitState,
  type ViewMapCell,
  type ShieldState,
  configureMapDimensions,
  executeTurn,
  computeAITurn,
  scan,
  SHIELD_MAX_MS,
  SHIELD_INITIAL_MS,
  SHIELD_CHARGE_RATIO,
  snapshotPreTurn,
  computeDelta,
  filterDeltaWithState,
  computeViewMapDelta,
  snapshotViewMap,
  type PreTurnSnapshot,
  type TurnDelta,
  type FilteredDelta,
} from "@empire/shared";
import type {
  ClientMessage,
  ServerMessage,
  VisibleGameState,
  VisibleCity,
  TickInfo,
  WorldSummary,
} from "@empire/shared";
import {
  type WorldConfig,
  type WorldState,
  type KingdomTile,
  type RingInfo,
  DEFAULT_WORLD_CONFIG,
  generateWorldMap,
  findAvailableKingdom,
  claimKingdom,
  getWorldRingInfo,
} from "@empire/shared";
import type { GameDatabase } from "./database.js";

// ─── Types ─────────────────────────────────────────────────────────────────

interface PlayerConnection {
  ws: WebSocket;
  owner: number; // PlayerId
  worldId: string;
}

interface ActiveWorld {
  id: string;
  world: WorldState;
  /** Connected players: PlayerId → WebSocket (null = disconnected). */
  players: Map<number, WebSocket | null>;
  /** Pending actions queued between ticks. */
  pendingActions: Map<number, PlayerAction[]>;
  /** Tick timer handle. */
  tickTimer: ReturnType<typeof setTimeout> | null;
  /** Timestamp of next tick. */
  nextTickAt: number;
  /** Disconnect grace timers. */
  disconnectTimers: Map<number, ReturnType<typeof setTimeout>>;
  /** Track when each human player connected (for shield charge calculation). */
  playerConnectedAt: Map<number, number>;
  /** Cached viewMap snapshots for connected players (for computing viewMap deltas). */
  viewMapSnapshots: Map<number, ViewMapCell[]>;
  /** Recent TurnDeltas for reconnecting clients (ring buffer). */
  recentDeltas: TurnDelta[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DISCONNECT_GRACE_MS = 5 * 60 * 1000; // 5 minutes before AI takeover marked
const MAX_ACTIONS_PER_TICK = 500;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MSGS = 30;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30s ping/pong
const HEARTBEAT_TIMEOUT_MS = 10_000;  // 10s to respond before disconnect
const MAX_RECENT_DELTAS = 10;         // ring buffer size for reconnection

// ─── World Server ──────────────────────────────────────────────────────────

export class WorldServer {
  private worlds = new Map<string, ActiveWorld>();
  private playerConnections = new Map<WebSocket, PlayerConnection>();
  private db: GameDatabase | null;
  private rateLimits = new Map<WebSocket, { count: number; resetAt: number }>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongReceived = new Map<WebSocket, boolean>();

  constructor(db?: GameDatabase) {
    this.db = db ?? null;
  }

  // ─── Heartbeat ────────────────────────────────────────────────────────

  /** Start periodic heartbeat pings for all connected players. */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const [ws] of this.playerConnections) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        // If we sent a ping last cycle and didn't get a pong, disconnect
        if (this.pongReceived.has(ws) && !this.pongReceived.get(ws)) {
          console.log("[World] Heartbeat timeout, terminating connection");
          ws.terminate();
          continue;
        }
        this.pongReceived.set(ws, false);
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** Call this when a pong is received from a client. */
  handlePong(ws: WebSocket): void {
    this.pongReceived.set(ws, true);
  }

  /** Stop heartbeat timer. */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Message Routing ───────────────────────────────────────────────────

  handleMessage(ws: WebSocket, msg: ClientMessage, auth?: { userId: number; username: string }): boolean {
    switch (msg.type) {
      case "create_world":
        this.handleCreateWorld(ws, msg.config);
        return true;
      case "join_world":
        this.handleJoinWorld(ws, msg.worldId, msg.preferredRing, msg.playerName, auth);
        return true;
      case "world_action":
        this.handleWorldAction(ws, msg.worldId, msg.action);
        return true;
      case "cancel_actions":
        this.handleCancelActions(ws, msg.worldId);
        return true;
      case "leave_world":
        this.handleLeaveWorld(ws, msg.worldId);
        return true;
      case "reconnect_world":
        this.handleReconnectWorld(ws, (msg as any).worldId, (msg as any).playerId, auth);
        return true;
      case "list_worlds":
        this.send(ws, { type: "world_list", worlds: this.getWorldList() });
        return true;
      default:
        return false; // not a world message
    }
  }

  // ─── World Creation ────────────────────────────────────────────────────

  handleCreateWorld(ws: WebSocket, configOverrides?: Partial<WorldConfig>): void {
    const worldId = randomUUID().slice(0, 8);
    const config: WorldConfig = {
      ...DEFAULT_WORLD_CONFIG,
      seed: Math.floor(Math.random() * 2 ** 32),
      ...configOverrides,
    };

    console.log(`[World] Creating world ${worldId} (radius=${config.initialRadius}, tick=${config.tickIntervalMs}ms)`);
    const t0 = performance.now();

    const world = generateWorldMap(config);

    const t1 = performance.now();
    console.log(`[World] World ${worldId} generated in ${(t1 - t0).toFixed(0)}ms — ${world.kingdoms.length} kingdoms, ${world.gameState.cities.length} cities`);

    const activeWorld: ActiveWorld = {
      id: worldId,
      world,
      players: new Map(),
      pendingActions: new Map(),
      tickTimer: null,
      nextTickAt: Date.now() + config.tickIntervalMs,
      disconnectTimers: new Map(),
      playerConnectedAt: new Map(),
      viewMapSnapshots: new Map(),
      recentDeltas: [],
    };

    // Register all AI players (no WebSocket connection)
    for (const player of world.gameState.players) {
      activeWorld.players.set(player.id, null);
    }

    this.worlds.set(worldId, activeWorld);

    // Start tick timer
    this.scheduleTick(activeWorld);

    this.send(ws, { type: "world_created", worldId });
  }

  // ─── Player Join ───────────────────────────────────────────────────────

  handleJoinWorld(
    ws: WebSocket,
    worldId: string,
    preferredRing?: number,
    playerName?: string,
    auth?: { userId: number; username: string },
  ): void {
    const activeWorld = this.worlds.get(worldId);
    if (!activeWorld) {
      this.send(ws, { type: "error", message: "World not found" });
      return;
    }

    // Check if this WebSocket is already connected to a world
    const existing = this.playerConnections.get(ws);
    if (existing) {
      this.send(ws, { type: "error", message: "Already connected to a world" });
      return;
    }

    // Find an available AI kingdom for this player
    const tile = findAvailableKingdom(activeWorld.world, preferredRing ?? 1);
    if (!tile) {
      this.send(ws, { type: "error", message: "No kingdoms available — world is full" });
      return;
    }

    // Claim the kingdom (converts AI → human, activates spawn protection)
    const currentTick = activeWorld.world.gameState.turn;
    const playerId = claimKingdom(
      activeWorld.world,
      tile,
      playerName || `Player ${tile.owner}`,
      currentTick,
    );

    // Register connection
    activeWorld.players.set(playerId, ws);
    this.playerConnections.set(ws, { ws, owner: playerId, worldId });
    activeWorld.playerConnectedAt.set(playerId, Date.now());

    // Initialize shield for new player
    const state = activeWorld.world.gameState;
    if (!state.shields[playerId]) {
      state.shields[playerId] = {
        chargeMs: SHIELD_INITIAL_MS,
        activatedAt: null,
        isActive: false,
      };
    }

    // Clear any disconnect timer
    const timer = activeWorld.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      activeWorld.disconnectTimers.delete(playerId);
    }

    // Record kingdom in database if authenticated
    if (auth && this.db) {
      const name = playerName || auth.username;
      const ringLabel = tile.ring === 0 ? "center" : tile.ring === 1 ? "inner" : tile.ring === 2 ? "middle" : "outer";
      this.db.createKingdom(auth.userId, worldId, playerId, name, ringLabel);
    }

    console.log(`[World] Player ${playerId} joined world ${worldId} at ring ${tile.ring} (${tile.pos.row},${tile.pos.col})${auth ? ` (user: ${auth.username})` : ""}`);

    // Send join confirmation
    this.send(ws, {
      type: "world_joined",
      worldId,
      owner: playerId as any,
      kingdom: tile.pos,
    });

    // Send current visible state
    this.sendVisibleState(activeWorld, playerId);
  }

  // ─── Reconnection ─────────────────────────────────────────────────────

  handleReconnectWorld(ws: WebSocket, worldId: string, playerId: number, auth?: { userId: number; username: string }): void {
    const activeWorld = this.worlds.get(worldId);
    if (!activeWorld) {
      this.send(ws, { type: "reconnect_failed", worldId, reason: "World not found" });
      return;
    }

    // Check if this WebSocket is already connected to a world
    const existing = this.playerConnections.get(ws);
    if (existing) {
      this.send(ws, { type: "error", message: "Already connected to a world" });
      return;
    }

    // Verify ownership via DB if authenticated
    if (auth && this.db) {
      const kingdom = this.db.getActiveKingdom(auth.userId, worldId);
      if (!kingdom || kingdom.player_id !== playerId) {
        this.send(ws, { type: "reconnect_failed", worldId, reason: "Kingdom not found for this account" });
        return;
      }
      this.db.updateKingdomLastActive(kingdom.id);
    }

    const state = activeWorld.world.gameState;
    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      this.send(ws, { type: "reconnect_failed", worldId, reason: "Player not found" });
      return;
    }

    if (player.status === "defeated") {
      this.send(ws, { type: "reconnect_failed", worldId, reason: "Kingdom has been defeated" });
      return;
    }

    // Restore human control
    player.isAI = false;
    activeWorld.players.set(playerId, ws);
    this.playerConnections.set(ws, { ws, owner: playerId, worldId });
    activeWorld.playerConnectedAt.set(playerId, Date.now());

    // Clear disconnect timer
    const timer = activeWorld.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      activeWorld.disconnectTimers.delete(playerId);
    }

    // Deactivate shield, preserve remaining charge
    const shield = state.shields[playerId];
    if (shield && shield.isActive && shield.activatedAt !== null) {
      const elapsed = Date.now() - shield.activatedAt;
      shield.chargeMs = Math.max(0, shield.chargeMs - elapsed);
      shield.isActive = false;
      shield.activatedAt = null;
      console.log(`[World] Player ${playerId} shield deactivated (${Math.round(shield.chargeMs / 60000)}min remaining)`);
    }

    // Find kingdom tile for this player
    const tile = activeWorld.world.kingdoms.find(k => k.owner === playerId);
    const kingdom = tile ? tile.pos : { row: 0, col: 0 };

    console.log(`[World] Player ${playerId} reconnected to world ${worldId}`);

    // Send join confirmation and state
    this.send(ws, {
      type: "world_joined",
      worldId,
      owner: playerId as any,
      kingdom,
    });

    this.sendVisibleState(activeWorld, playerId);
  }

  // ─── Action Buffering ──────────────────────────────────────────────────

  handleWorldAction(ws: WebSocket, worldId: string, action: any): void {
    const conn = this.playerConnections.get(ws);
    if (!conn || conn.worldId !== worldId) {
      this.send(ws, { type: "error", message: "Not connected to this world" });
      return;
    }

    const activeWorld = this.worlds.get(worldId);
    if (!activeWorld) return;

    // Get or create action buffer
    let actions = activeWorld.pendingActions.get(conn.owner);
    if (!actions) {
      actions = [];
      activeWorld.pendingActions.set(conn.owner, actions);
    }

    if (actions.length >= MAX_ACTIONS_PER_TICK) {
      this.send(ws, { type: "error", message: "Action limit reached for this tick" });
      return;
    }

    // Convert ClientAction to PlayerAction
    actions.push(action as PlayerAction);

    this.send(ws, {
      type: "actions_queued",
      worldId,
      count: actions.length,
    });
  }

  handleCancelActions(ws: WebSocket, worldId: string): void {
    const conn = this.playerConnections.get(ws);
    if (!conn || conn.worldId !== worldId) return;

    const activeWorld = this.worlds.get(worldId);
    if (!activeWorld) return;

    activeWorld.pendingActions.delete(conn.owner);
    this.send(ws, { type: "actions_cancelled", worldId });
  }

  // ─── Tick Engine ───────────────────────────────────────────────────────

  private scheduleTick(activeWorld: ActiveWorld): void {
    if (activeWorld.tickTimer) {
      clearTimeout(activeWorld.tickTimer);
    }

    const delay = Math.max(0, activeWorld.nextTickAt - Date.now());
    activeWorld.tickTimer = setTimeout(() => {
      this.executeTick(activeWorld);
    }, delay);
  }

  private executeTick(activeWorld: ActiveWorld): void {
    const state = activeWorld.world.gameState;
    const t0 = performance.now();

    // Ensure global dimensions match this world
    configureMapDimensions(state.config.mapWidth, state.config.mapHeight);

    // Snapshot state before turn (for delta computation)
    const preSnapshot = snapshotPreTurn(state);

    // Snapshot viewMaps for connected players (for viewMap deltas)
    const preViewMaps = new Map<number, ViewMapCell[]>();
    for (const [playerId, ws] of activeWorld.players) {
      if (!ws) continue;
      const vm = state.viewMaps[playerId];
      if (vm) {
        preViewMaps.set(playerId, snapshotViewMap(vm));
      }
    }

    // Build action map for all players
    const allActions = new Map<number, PlayerAction[]>();

    for (const player of state.players) {
      if (player.status !== "active") continue;

      const ws = activeWorld.players.get(player.id);
      const pendingActions = activeWorld.pendingActions.get(player.id);

      if (ws && !player.isAI && pendingActions && pendingActions.length > 0) {
        // Human player with queued actions
        allActions.set(player.id, pendingActions);
      } else {
        // AI player OR disconnected human OR human with no actions → AI computes
        const aiActions = computeAITurn(state, player.id);
        allActions.set(player.id, aiActions);
      }
    }

    const t1 = performance.now();

    // Execute the turn
    const result = executeTurn(state, allActions);

    const t2 = performance.now();

    // Compute full delta
    const delta = computeDelta(preSnapshot, state, result.events);

    // Store delta in ring buffer for reconnection
    activeWorld.recentDeltas.push(delta);
    if (activeWorld.recentDeltas.length > MAX_RECENT_DELTAS) {
      activeWorld.recentDeltas.shift();
    }

    // Clear pending actions
    activeWorld.pendingActions.clear();

    // Schedule next tick
    activeWorld.nextTickAt = Date.now() + activeWorld.world.worldConfig.tickIntervalMs;
    this.scheduleTick(activeWorld);

    // Log timing
    const humanCount = [...activeWorld.players.entries()].filter(([, ws]) => ws !== null).length;
    const t3 = performance.now();
    console.log(
      `[World] ${activeWorld.id} tick ${state.turn}: AI=${(t1 - t0).toFixed(0)}ms exec=${(t2 - t1).toFixed(0)}ms delta=${(t3 - t2).toFixed(0)}ms | ${humanCount} humans, ${state.players.filter(p => p.status === "active").length} active kingdoms`,
    );

    // Broadcast deltas to connected players (instead of full state)
    for (const [playerId, ws] of activeWorld.players) {
      if (!ws) continue;

      // Per-player tick info (includes shield and action count)
      const tickInfo = this.getTickInfo(activeWorld, playerId);

      // Filter delta for this player's visibility
      const filteredDelta = filterDeltaWithState(delta, playerId, state);

      // Compute viewMap delta for this player
      const preVm = preViewMaps.get(playerId);
      const currentVm = state.viewMaps[playerId];
      if (preVm && currentVm) {
        filteredDelta.viewMapChanges = computeViewMapDelta(preVm, currentVm);
      }

      // Send delta update (replaces tick_result + world_state)
      this.send(ws, {
        type: "tick_delta",
        worldId: activeWorld.id,
        delta: filteredDelta,
        tickInfo,
      });

      // Update cached viewMap snapshot for next tick
      if (currentVm) {
        activeWorld.viewMapSnapshots.set(playerId, snapshotViewMap(currentVm));
      }
    }

    // Persist world state
    this.persistWorld(activeWorld);

    // Check season expiry
    if (Date.now() >= activeWorld.world.seasonEndsAt) {
      this.endSeason(activeWorld);
    }
  }

  private getTickInfo(activeWorld: ActiveWorld, playerId?: number): TickInfo {
    const now = Date.now();
    const info: TickInfo = {
      turn: activeWorld.world.gameState.turn,
      nextTickMs: Math.max(0, activeWorld.nextTickAt - now),
      tickIntervalMs: activeWorld.world.worldConfig.tickIntervalMs,
      seasonRemainingS: Math.max(0, Math.floor((activeWorld.world.seasonEndsAt - now) / 1000)),
    };

    // Per-player shield, action, and spawn protection info
    if (playerId !== undefined) {
      const shield = activeWorld.world.gameState.shields[playerId];
      if (shield?.isActive && shield.activatedAt !== null) {
        const elapsed = now - shield.activatedAt;
        info.shieldRemainingMs = Math.max(0, shield.chargeMs - elapsed);
      }
      const queued = activeWorld.pendingActions.get(playerId);
      info.actionsQueued = queued ? queued.length : 0;

      // Spawn protection remaining
      const tile = activeWorld.world.kingdoms.find(k => k.owner === playerId);
      if (tile && tile.spawnProtectionEndTick > activeWorld.world.gameState.turn) {
        info.spawnProtectionTicks = tile.spawnProtectionEndTick - activeWorld.world.gameState.turn;
      }
    }

    return info;
  }

  // ─── Visible State ─────────────────────────────────────────────────────

  private sendVisibleState(activeWorld: ActiveWorld, playerId: number): void {
    const ws = activeWorld.players.get(playerId);
    if (!ws) return;

    const state = activeWorld.world.gameState;
    const visibleState = this.getVisibleState(state, playerId);
    const tickInfo = this.getTickInfo(activeWorld, playerId);

    this.send(ws, {
      type: "world_state",
      worldId: activeWorld.id,
      state: visibleState,
      tickInfo,
    });
  }

  private getVisibleState(state: GameState, owner: number): VisibleGameState {
    const vm = state.viewMaps[owner];
    if (!vm) {
      return {
        turn: state.turn,
        phase: "playing",
        owner: owner as any,
        viewMap: [],
        cities: [],
        units: [],
        config: state.config,
      };
    }

    // Filter cities by visibility
    const cities: VisibleCity[] = state.cities
      .filter(c => vm[c.loc]?.seen >= 0)
      .map(c => ({
        id: c.id,
        loc: c.loc,
        owner: c.owner,
        production: c.owner === owner ? c.production : null,
        work: c.owner === owner ? c.work : null,
      }));

    // Filter units — own units always visible, enemy only if currently seen
    const units: UnitState[] = state.units.filter(u => {
      if (u.owner === owner) return true;
      return vm[u.loc]?.seen === state.turn;
    });

    return {
      turn: state.turn,
      phase: "playing",
      owner: owner as any,
      viewMap: vm,
      cities,
      units,
      config: state.config,
    };
  }

  // ─── Player Leave / Disconnect ─────────────────────────────────────────

  handleLeaveWorld(ws: WebSocket, worldId: string): void {
    const conn = this.playerConnections.get(ws);
    if (!conn || conn.worldId !== worldId) return;
    this.disconnectPlayer(ws);
  }

  handleDisconnect(ws: WebSocket): void {
    const conn = this.playerConnections.get(ws);
    if (!conn) return;
    this.disconnectPlayer(ws);
  }

  private disconnectPlayer(ws: WebSocket): void {
    const conn = this.playerConnections.get(ws);
    if (!conn) return;

    const activeWorld = this.worlds.get(conn.worldId);
    if (activeWorld) {
      const state = activeWorld.world.gameState;

      // Mark as disconnected (AI takes over on next tick)
      activeWorld.players.set(conn.owner, null);

      // Accumulate shield charge from online time
      const connectedAt = activeWorld.playerConnectedAt.get(conn.owner);
      if (connectedAt) {
        const onlineMs = Date.now() - connectedAt;
        const chargeEarned = onlineMs * SHIELD_CHARGE_RATIO;
        const shield = state.shields[conn.owner];
        if (shield) {
          shield.chargeMs = Math.min(SHIELD_MAX_MS, shield.chargeMs + chargeEarned);
        }
        activeWorld.playerConnectedAt.delete(conn.owner);
      }

      // Activate shield if player has charge
      const shield = state.shields[conn.owner];
      if (shield && shield.chargeMs > 0) {
        shield.isActive = true;
        shield.activatedAt = Date.now();
        console.log(`[World] Player ${conn.owner} shield activated (${Math.round(shield.chargeMs / 60000)}min charge)`);
      }

      // Set grace timer — after shield expires (or DISCONNECT_GRACE_MS if no shield), mark as AI
      const graceMs = (shield && shield.chargeMs > 0) ? shield.chargeMs : DISCONNECT_GRACE_MS;
      const timer = setTimeout(() => {
        const player = state.players.find(p => p.id === conn.owner);
        if (player && !activeWorld.players.get(conn.owner)) {
          player.isAI = true;
          // Deactivate shield
          const s = state.shields[conn.owner];
          if (s) {
            s.isActive = false;
            s.chargeMs = 0;
            s.activatedAt = null;
          }
          console.log(`[World] Player ${conn.owner} in world ${conn.worldId} reverted to AI (shield expired)`);
        }
        activeWorld.disconnectTimers.delete(conn.owner);
      }, graceMs);

      activeWorld.disconnectTimers.set(conn.owner, timer);

      console.log(`[World] Player ${conn.owner} disconnected from world ${conn.worldId}`);
    }

    this.playerConnections.delete(ws);
    this.pongReceived.delete(ws);
  }

  // ─── Season End ────────────────────────────────────────────────────────

  private endSeason(activeWorld: ActiveWorld): void {
    console.log(`[World] Season ended for world ${activeWorld.id} at turn ${activeWorld.world.gameState.turn}`);

    // Stop tick timer
    if (activeWorld.tickTimer) {
      clearTimeout(activeWorld.tickTimer);
      activeWorld.tickTimer = null;
    }

    // Notify all connected players
    for (const [, ws] of activeWorld.players) {
      if (!ws) continue;
      this.send(ws, {
        type: "game_over",
        gameId: activeWorld.id,
        winner: 0 as any, // no single winner in season end
        winType: "elimination",
      });
    }

    // Persist final state
    this.persistWorld(activeWorld);

    // Clean up
    for (const timer of activeWorld.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.worlds.delete(activeWorld.id);
  }

  // ─── Persistence ───────────────────────────────────────────────────────

  private persistWorld(activeWorld: ActiveWorld): void {
    if (!this.db) return;
    try {
      // Serialize world state (gameState + worldConfig + metadata)
      const serializable = {
        worldConfig: activeWorld.world.worldConfig,
        kingdoms: activeWorld.world.kingdoms,
        gridSize: activeWorld.world.gridSize,
        populatedRadius: activeWorld.world.populatedRadius,
        worldWidth: activeWorld.world.worldWidth,
        worldHeight: activeWorld.world.worldHeight,
        createdAt: activeWorld.world.createdAt,
        seasonEndsAt: activeWorld.world.seasonEndsAt,
        expansionSeed: activeWorld.world.expansionSeed,
      };
      // Save game state under world ID with a "world:" prefix
      this.db.saveGame(
        `world:${activeWorld.id}`,
        "playing",
        {
          ...activeWorld.world.gameState,
          _worldMeta: serializable,
        } as any,
      );
    } catch (err) {
      console.error(`[World] Failed to persist world ${activeWorld.id}:`, err);
    }
  }

  // ─── World List ────────────────────────────────────────────────────────

  getWorldList(): WorldSummary[] {
    const summaries: WorldSummary[] = [];
    const now = Date.now();
    for (const [id, aw] of this.worlds) {
      const humanPlayers = [...aw.players.entries()].filter(([pid, ws]) => {
        if (!ws) return false;
        const p = aw.world.gameState.players.find(pl => pl.id === pid);
        return p && !p.isAI;
      }).length;

      summaries.push({
        id,
        humanPlayers,
        totalKingdoms: aw.world.kingdoms.length,
        turn: aw.world.gameState.turn,
        tickIntervalMs: aw.world.worldConfig.tickIntervalMs,
        seasonRemainingS: Math.max(0, Math.floor((aw.world.seasonEndsAt - now) / 1000)),
        rings: getWorldRingInfo(aw.world),
      });
    }
    return summaries;
  }

  // ─── Utilities ─────────────────────────────────────────────────────────

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(msg);
      // Compress large messages (> 50KB) with gzip
      if (json.length > 50_000) {
        const compressed = gzipSync(json);
        ws.send(compressed, { binary: true });
      } else {
        ws.send(json);
      }
    }
  }

  private isRateLimited(ws: WebSocket): boolean {
    const now = Date.now();
    let limit = this.rateLimits.get(ws);
    if (!limit || now >= limit.resetAt) {
      limit = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
      this.rateLimits.set(ws, limit);
    }
    limit.count++;
    return limit.count > RATE_LIMIT_MAX_MSGS;
  }

  /** Graceful shutdown — stop all ticks, persist all worlds. */
  shutdown(): void {
    this.stopHeartbeat();
    this.pongReceived.clear();
    for (const aw of this.worlds.values()) {
      if (aw.tickTimer) {
        clearTimeout(aw.tickTimer);
        aw.tickTimer = null;
      }
      for (const timer of aw.disconnectTimers.values()) {
        clearTimeout(timer);
      }
      this.persistWorld(aw);
    }
    console.log(`[World] Shutdown — ${this.worlds.size} worlds persisted`);
  }

  /** Check if this WebSocket has a world connection. */
  hasConnection(ws: WebSocket): boolean {
    return this.playerConnections.has(ws);
  }
}
