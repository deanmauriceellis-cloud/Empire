// Empire Reborn — World Mode Client
// Handles world-mode WebSocket protocol: create/join/reconnect, action buffering, tick results.

import {
  Owner,
  UnitBehavior,
  UnitType,
  Direction,
  DIR_OFFSET,
  TerrainType,
  configureMapDimensions,
  applyDeltaToVisibleState,
  type Loc,
  type TurnEvent,
  type VisibleGameState,
  type VisibleCity,
  type ServerMessage,
  type ClientAction,
  type TickInfo,
  type WorldSummary,
  type WorldConfig,
  type FilteredDelta,
} from "@empire/shared";
import type { KingdomTilePos } from "@empire/shared";
import type { Connection } from "./connection.js";
import type { RenderableState, RenderableTile } from "../types.js";

// ─── World Client Events ───────────────────────────────────────────────────

export interface WorldClientEvents {
  onWorldCreated: (worldId: string) => void;
  onWorldJoined: (worldId: string, owner: Owner, kingdom: KingdomTilePos) => void;
  onWorldState: (state: VisibleGameState, tickInfo: TickInfo) => void;
  onTickResult: (turn: number, events: TurnEvent[], tickInfo: TickInfo) => void;
  onTickDelta: (delta: FilteredDelta, tickInfo: TickInfo) => void;
  onActionsQueued: (count: number) => void;
  onActionsCancelled: () => void;
  onWorldList: (worlds: WorldSummary[]) => void;
  onReconnectFailed: (worldId: string, reason: string) => void;
  onError: (message: string) => void;
}

// ─── World Client ──────────────────────────────────────────────────────────

export interface WorldClient {
  readonly visibleState: VisibleGameState | null;
  readonly owner: Owner | null;
  readonly worldId: string | null;
  readonly tickInfo: TickInfo | null;
  readonly actionsQueued: number;
  readonly isPlaying: boolean;

  createWorld(config?: Partial<WorldConfig>): void;
  joinWorld(worldId: string, preferredRing?: number, playerName?: string): void;
  reconnectWorld(worldId: string, playerId: number): void;
  sendAction(action: ClientAction): void;
  cancelActions(): void;
  leaveWorld(): void;
  listWorlds(): void;
  moveUnit(unitId: number, direction: Direction): void;
  attackTarget(unitId: number, targetLoc: Loc): void;
  setProduction(cityId: number, unitType: UnitType): void;
  setBehavior(unitId: number, behavior: UnitBehavior): void;
  bombardTarget(unitId: number, targetLoc: Loc): void;
  buildRenderableState(): RenderableState | null;
  handleMessage(msg: ServerMessage): void;
  reset(): void;
}

export function createWorldClient(
  conn: Connection,
  events: WorldClientEvents,
): WorldClient {
  let visibleState: VisibleGameState | null = null;
  let owner: Owner | null = null;
  let worldId: string | null = null;
  let tickInfo: TickInfo | null = null;
  let actionsQueued = 0;
  let isPlaying = false;
  let turnEvents: TurnEvent[] = [];

  function sendWorldAction(action: ClientAction): void {
    if (!worldId) return;
    conn.send({ type: "world_action", worldId, action });
  }

  return {
    get visibleState() { return visibleState; },
    get owner() { return owner; },
    get worldId() { return worldId; },
    get tickInfo() { return tickInfo; },
    get actionsQueued() { return actionsQueued; },
    get isPlaying() { return isPlaying; },

    createWorld(config?: Partial<WorldConfig>): void {
      conn.send({ type: "create_world", config });
    },

    joinWorld(wId: string, preferredRing?: number, playerName?: string): void {
      conn.send({ type: "join_world", worldId: wId, preferredRing, playerName });
    },

    reconnectWorld(wId: string, playerId: number): void {
      conn.send({ type: "reconnect_world", worldId: wId, playerId } as any);
    },

    sendAction(action: ClientAction): void {
      sendWorldAction(action);
    },

    cancelActions(): void {
      if (!worldId) return;
      conn.send({ type: "cancel_actions", worldId });
    },

    leaveWorld(): void {
      if (!worldId) return;
      conn.send({ type: "leave_world", worldId });
    },

    listWorlds(): void {
      conn.send({ type: "list_worlds" } as any);
    },

    moveUnit(unitId: number, direction: Direction): void {
      if (!visibleState) return;
      const unit = visibleState.units.find(u => u.id === unitId);
      if (!unit) return;
      const targetLoc = unit.loc + DIR_OFFSET[direction];
      sendWorldAction({ type: "move", unitId, loc: targetLoc });
    },

    attackTarget(unitId: number, targetLoc: Loc): void {
      sendWorldAction({ type: "attack", unitId, targetLoc });
    },

    setProduction(cityId: number, unitType: UnitType): void {
      sendWorldAction({ type: "setProduction", cityId, unitType });
    },

    setBehavior(unitId: number, behavior: UnitBehavior): void {
      sendWorldAction({ type: "setBehavior", unitId, behavior });
    },

    bombardTarget(unitId: number, targetLoc: Loc): void {
      sendWorldAction({ type: "bombard", unitId, targetLoc } as any);
    },

    buildRenderableState(): RenderableState | null {
      if (!visibleState || owner === null) return null;

      const { viewMap, cities, units, config } = visibleState;
      const mapSize = config.mapWidth * config.mapHeight;

      const tiles: RenderableTile[] = new Array(mapSize);
      for (let i = 0; i < mapSize; i++) {
        const view = viewMap[i];
        // Deposit info from server
        let depositType: import("@empire/shared").DepositType | null = null;
        let depositOwner: import("@empire/shared").Owner | null = null;
        let depositComplete = false;
        if (visibleState.deposits) {
          const deposit = visibleState.deposits.find(d => d.loc === i);
          if (deposit) {
            depositType = deposit.type;
            depositOwner = deposit.owner;
            depositComplete = deposit.buildingComplete;
          }
        }

        tiles[i] = {
          terrain: viewCharToTerrain(view.contents),
          seen: view.seen,
          cityOwner: getCityOwner(i, cities),
          depositType,
          depositOwner,
          depositComplete,
        };
      }

      const visibleUnits = units.filter(u => u.shipId === null);

      return {
        turn: visibleState.turn,
        tiles,
        cities: cities.map(c => ({
          id: c.id,
          loc: c.loc,
          owner: c.owner,
          production: c.owner === owner ? c.production : null,
        })),
        units: visibleUnits,
        deposits: visibleState.deposits ?? [],
        resources: visibleState.resources ?? [0, 0, 0],
        mapWidth: config.mapWidth,
        mapHeight: config.mapHeight,
        owner,
        crownCityLocs: buildCrownCityLocs(visibleState),
      };
    },

    handleMessage(msg: ServerMessage): void {
      switch (msg.type) {
        case "world_created":
          worldId = msg.worldId;
          events.onWorldCreated(msg.worldId);
          break;

        case "world_joined":
          worldId = msg.worldId;
          owner = msg.owner;
          isPlaying = true;
          events.onWorldJoined(msg.worldId, msg.owner, msg.kingdom);
          break;

        case "world_state":
          visibleState = msg.state;
          tickInfo = msg.tickInfo;
          actionsQueued = msg.tickInfo.actionsQueued ?? 0;
          configureMapDimensions(msg.state.config.mapWidth, msg.state.config.mapHeight);
          events.onWorldState(msg.state, msg.tickInfo);
          break;

        case "tick_result":
          turnEvents = msg.events;
          tickInfo = msg.tickInfo;
          actionsQueued = msg.tickInfo.actionsQueued ?? 0;
          events.onTickResult(msg.turn, msg.events, msg.tickInfo);
          break;

        case "tick_delta":
          tickInfo = msg.tickInfo;
          actionsQueued = msg.tickInfo.actionsQueued ?? 0;
          turnEvents = msg.delta.events;
          // Apply delta to cached visible state
          if (visibleState && owner !== null) {
            applyDeltaToVisibleState(
              msg.delta,
              visibleState.cities,
              visibleState.units,
              visibleState.viewMap,
              owner as number,
            );
            visibleState.turn = msg.delta.tick;
          }
          events.onTickDelta(msg.delta, msg.tickInfo);
          break;

        case "actions_queued":
          actionsQueued = msg.count;
          events.onActionsQueued(msg.count);
          break;

        case "actions_cancelled":
          actionsQueued = 0;
          events.onActionsCancelled();
          break;

        case "world_list":
          events.onWorldList(msg.worlds);
          break;

        case "reconnect_failed":
          events.onReconnectFailed((msg as any).worldId, (msg as any).reason);
          break;

        case "error":
          events.onError(msg.message);
          break;
      }
    },

    reset(): void {
      visibleState = null;
      owner = null;
      worldId = null;
      tickInfo = null;
      actionsQueued = 0;
      isPlaying = false;
      turnEvents = [];
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function viewCharToTerrain(contents: string): TerrainType {
  switch (contents) {
    case ".": return TerrainType.Sea;
    case "+": return TerrainType.Land;
    case "*": return TerrainType.Land;
    case "O": return TerrainType.Land;
    case "X": return TerrainType.Land;
    case " ": return TerrainType.Sea;
    default: return TerrainType.Land;
  }
}

function getCityOwner(loc: number, cities: VisibleCity[]): Owner | null {
  const city = cities.find(c => c.loc === loc);
  return city ? city.owner : null;
}

/** Build crown city location set from visible state kingdoms. */
function buildCrownCityLocs(state: VisibleGameState): Set<number> {
  const locs = new Set<number>();
  if (state.kingdoms) {
    for (const k of Object.values(state.kingdoms)) {
      if (k.crownCityId != null) {
        const city = state.cities.find(c => c.id === k.crownCityId);
        if (city) locs.add(city.loc);
      }
    }
  }
  return locs;
}
