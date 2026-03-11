// Empire Reborn — Client Entry Point
// Phase 10: Dual-mode + Audio + Visual Polish.

import {
  GAME_VERSION,
  createSinglePlayerGame,
  locRow,
  locCol,
  Owner,
  Direction,
  UnitBehavior,
  UnitType,
  DIR_OFFSET,
  MAP_SIZE,
  NUM_UNIT_TYPES,
  UNIT_ATTRIBUTES,
  objMoves,
  scan,
  findUnit,
  computeAITurn,
  generateDiagnostic,
  startAILogCapture,
  stopAILogCapture,
  CITY_INCOME,
  DEPOSIT_INCOME,
  DEPOSIT_RESOURCE,
  canProduceUnit,
} from "@empire/shared";
import type { SinglePlayerGame, TurnEvent, VisibleGameState, GameConfig } from "@empire/shared";
import type { GameSetupOptions } from "./ui/menuScreens.js";
import { createApp } from "./core/app.js";
import { createCamera } from "./core/camera.js";
import { createInput } from "./core/input.js";
import { generateAssets } from "./assets/placeholders.js";
import { buildRenderableState } from "./game/bridge.js";
import { TilemapRenderer } from "./renderer/tilemap.js";
import { UnitRenderer } from "./renderer/units.js";
import { ParticleSystem } from "./renderer/particles.js";
import { HighlightRenderer } from "./renderer/highlights.js";
import { createScreenShake } from "./renderer/screenShake.js";
import { MapOverlays } from "./renderer/mapOverlays.js";
import { screenToTile } from "./iso/coords.js";
import { createActionCollector, type ActionCollector } from "./game/actionCollector.js";
import { computeHighlights, getClickAction } from "./game/moveCalc.js";
import { createUIManager } from "./ui/UIManager.js";
import { createConnection, getWebSocketUrl, type ConnectionState } from "./net/connection.js";
import { createMultiplayerGame, fetchLobbyGames, type MultiplayerGame } from "./net/multiplayer.js";
import { createWorldClient, type WorldClient } from "./net/worldClient.js";
import { createAuthClient, getServerUrl, type AuthClient } from "./net/auth.js";
import { createStoreClient, type StoreClient } from "./net/storeClient.js";
import { createAudioManager, type AudioManager } from "./audio/AudioManager.js";
import type { SelectionState, UIState, TileHighlight, RenderableState } from "./types.js";
import type { TickInfo, WorldSummary } from "@empire/shared";

// ─── Game Mode ───────────────────────────────────────────────────────────────

type GameMode = "none" | "singleplayer" | "multiplayer" | "world";

async function init() {
  // ─── Bootstrap ──────────────────────────────────────────────────────────
  const { app, worldContainer, uiContainer, effectsContainer } = await createApp();
  const assets = generateAssets(app.renderer);
  const canvas = app.canvas as HTMLCanvasElement;
  const input = createInput(canvas);

  // ─── Game State ─────────────────────────────────────────────────────────
  let mode: GameMode = "none";
  let game: SinglePlayerGame;
  let collector: ActionCollector;
  let playerOwner: Owner = Owner.Player1;  // the human player's owner ID

  // World mode state
  let worldTickInfo: TickInfo | null = null;
  let worldTickCountdown = 0; // ms remaining until next tick (local countdown)
  let worldLastFrameTime = 0; // for delta-based countdown

  // ─── Camera (single instance, reused across games) ──────────────────
  const camera = createCamera(100, 60);

  // ─── Renderers ────────────────────────────────────────────────────────
  const tilemap = new TilemapRenderer(worldContainer, assets);
  const unitRenderer = new UnitRenderer(worldContainer, assets);
  const particles = new ParticleSystem(effectsContainer);
  const highlightRenderer = new HighlightRenderer(worldContainer, assets);
  const mapOverlays = new MapOverlays(worldContainer);

  // ─── Audio ──────────────────────────────────────────────────────────
  const audio: AudioManager = createAudioManager();

  // Resume audio context on first user interaction
  const resumeAudio = () => { audio.resume(); };
  canvas.addEventListener("click", resumeAudio, { once: true });
  canvas.addEventListener("keydown", resumeAudio, { once: true });

  // ─── Screen Shake ──────────────────────────────────────────────────
  const shake = createScreenShake();

  // ─── UI ───────────────────────────────────────────────────────────────
  const ui = createUIManager(camera);

  const selection: SelectionState = {
    selectedUnitId: null,
    selectedCityId: null,
    hoveredTile: null,
  };

  let gameStarted = false;
  let currentHighlights: TileHighlight[] = [];
  let lastEventCount = 0;

  /** Get unit types the player can't produce due to tech requirements. */
  function getLockedUnitTypes(): Set<number> {
    if (mode !== "singleplayer") return new Set();
    const locked = new Set<number>();
    for (let i = 0; i < NUM_UNIT_TYPES; i++) {
      if (!canProduceUnit(game.state, playerOwner, i as UnitType)) {
        locked.add(i);
      }
    }
    return locked;
  }

  // ─── Multiplayer Connection ─────────────────────────────────────────────
  let connState: ConnectionState = "disconnected";

  // In dev mode (Vite on port 5174), connect to server on port 3001
  const wsUrl = location.port === "5174"
    ? `ws://${location.hostname}:3001/ws`
    : getWebSocketUrl();

  const conn = createConnection(wsUrl, {
    onStateChange(state) {
      connState = state;
      ui.menus.updateConnectionStatus(state);
      if (state === "connected") {
        // Authenticate WebSocket if we have a token
        authClient.restoreSession(conn);
        if (mode === "none") {
          // Refresh lobby on connect
          refreshLobby();
        }
      }
    },
    onMessage(msg) {
      // Route auth messages first
      if (authClient.handleServerMessage(msg)) return;
      if (storeClient.handleServerMessage(msg)) return;
      mp.handleMessage(msg);
      wc.handleMessage(msg);
    },
  });

  const mp: MultiplayerGame = createMultiplayerGame(conn, {
    onGameCreated(gameId, owner) {
      console.log(`Game created: ${gameId}, playing as Player ${owner}`);
      ui.menus.showWaiting(gameId);
    },

    onGameJoined(gameId, owner, phase) {
      console.log(`Joined game: ${gameId}, playing as Player ${owner}, phase: ${phase}`);
      if (phase === "playing") {
        startMultiplayerGame();
      }
    },

    onGameStarted(gameId) {
      console.log(`Game ${gameId} started!`);
      startMultiplayerGame();
    },

    onStateUpdate(state) {
      if (mode === "multiplayer" && gameStarted) {
        // State update from server — refresh turn flow
        audio.playTurnStart();
        ui.turnFlow.startTurn(stateForTurnFlow(state) as any);
        ui.turnFlow.nextUnit(stateForTurnFlow(state) as any, camera);
        if (ui.turnFlow.currentUnitId !== null) {
          selection.selectedUnitId = ui.turnFlow.currentUnitId;
          selection.selectedCityId = null;
        } else {
          selection.selectedUnitId = null;
          selection.selectedCityId = null;
        }
        refreshHighlights();
      }
    },

    onTurnResult(turn, events) {
      if (mode !== "multiplayer") return;
      ui.eventLog.addEvents(events);
      // turn is the NEW turn (after increment), battles happened on turn - 1
      ui.warStats.addEvents(turn - 1, events);
      emitParticlesForEvents(events);
    },

    onGameOver(winner, winType) {
      if (mode !== "multiplayer" || !mp.owner) return;
      audio.stopAmbient();
      audio.playGameOver(winner === mp.owner);
      const rs = mp.buildRenderableState();
      const playerCities = rs ? rs.cities.filter((c) => c.owner === mp.owner).length : 0;
      const playerUnits = rs ? rs.units.filter((u) => u.owner === mp.owner).length : 0;
      ui.menus.showGameOver(
        winner,
        mp.owner,
        mp.visibleState?.turn ?? 0,
        playerCities,
        playerUnits,
      );
      gameStarted = false;
    },

    onPlayerDisconnected() {
      ui.eventLog.addEvents([{
        type: "discovery",
        loc: 0,
        description: "Opponent disconnected — waiting for reconnect...",
      }]);
    },

    onPlayerReconnected() {
      ui.eventLog.addEvents([{
        type: "discovery",
        loc: 0,
        description: "Opponent reconnected.",
      }]);
    },

    onError(message) {
      console.error("Server error:", message);
      ui.eventLog.addEvents([{
        type: "death",
        loc: 0,
        description: `Error: ${message}`,
      }]);
    },
  });

  // ─── World Client ─────────────────────────────────────────────────────

  const wc: WorldClient = createWorldClient(conn, {
    onWorldCreated(worldId) {
      console.log(`World created: ${worldId}`);
      // Auto-join the world we just created
      wc.joinWorld(worldId, 1, "Player");
    },

    onWorldJoined(worldId, owner, kingdom) {
      console.log(`Joined world: ${worldId}, player ${owner}, kingdom (${kingdom.row},${kingdom.col})`);
      startWorldGame();
    },

    onWorldState(state, tickInfoMsg) {
      worldTickInfo = tickInfoMsg;
      worldTickCountdown = tickInfoMsg.nextTickMs;
      worldLastFrameTime = performance.now();
      if (mode === "world" && gameStarted) {
        // Refresh turn flow on new state
        audio.playTurnStart();
        ui.turnFlow.startTurn(stateForTurnFlow(state) as any);
        ui.turnFlow.nextUnit(stateForTurnFlow(state) as any, camera);
        if (ui.turnFlow.currentUnitId !== null) {
          selection.selectedUnitId = ui.turnFlow.currentUnitId;
          selection.selectedCityId = null;
        } else {
          selection.selectedUnitId = null;
          selection.selectedCityId = null;
        }
        refreshHighlights();
      }
    },

    onTickResult(turn, events, tickInfoMsg) {
      worldTickInfo = tickInfoMsg;
      worldTickCountdown = tickInfoMsg.nextTickMs;
      worldLastFrameTime = performance.now();
      if (mode !== "world") return;
      ui.eventLog.addEvents(events);
      ui.warStats.addEvents(turn - 1, events);
      emitParticlesForEvents(events);
    },

    onTickDelta(delta, tickInfoMsg) {
      worldTickInfo = tickInfoMsg;
      worldTickCountdown = tickInfoMsg.nextTickMs;
      worldLastFrameTime = performance.now();
      if (mode !== "world") return;
      // Delta already applied to visibleState in worldClient handler.
      // Process events from the delta.
      ui.eventLog.addEvents(delta.events);
      ui.warStats.addEvents(delta.tick - 1, delta.events);
      emitParticlesForEvents(delta.events);
      // Refresh turn flow on new tick
      const state = wc.visibleState;
      if (state && gameStarted) {
        audio.playTurnStart();
        ui.turnFlow.startTurn(stateForTurnFlow(state) as any);
        ui.turnFlow.nextUnit(stateForTurnFlow(state) as any, camera);
        if (ui.turnFlow.currentUnitId !== null) {
          selection.selectedUnitId = ui.turnFlow.currentUnitId;
          selection.selectedCityId = null;
        } else {
          selection.selectedUnitId = null;
          selection.selectedCityId = null;
        }
        refreshHighlights();
      }
    },

    onActionsQueued(count) {
      // UI updates via worldTickInfo.actionsQueued
    },

    onActionsCancelled() {
      // UI updates via worldTickInfo.actionsQueued
    },

    onWorldList(worlds) {
      ui.menus.showWorldBrowser(worlds, connState, authClient.kingdoms);
    },

    onReconnectFailed(worldId, reason) {
      console.error(`Reconnect failed for world ${worldId}: ${reason}`);
      ui.eventLog.addEvents([{
        type: "death", loc: 0,
        description: `Reconnect failed: ${reason}`,
      }]);
    },

    onError(message) {
      console.error("World error:", message);
    },
  });

  // ─── Auth Client ──────────────────────────────────────────────────────

  const serverUrl = location.port === "5174"
    ? `http://${location.hostname}:3001`
    : getServerUrl();

  const authClient: AuthClient = createAuthClient(serverUrl, {
    onLogin(userId, username) {
      console.log(`Logged in as ${username} (id: ${userId})`);
      ui.menus.setLoggedInUser(username);
    },
    onLogout() {
      console.log("Logged out");
      ui.menus.setLoggedInUser(null);
    },
    onKingdoms(kingdoms) {
      console.log(`Active kingdoms: ${kingdoms.length}`);
    },
    onError(message) {
      console.error("Auth error:", message);
    },
  });

  // ─── Store Client ──────────────────────────────────────────────────

  const storeClient: StoreClient = createStoreClient({
    onItemsLoaded(items) {
      console.log(`Store: ${items.length} items loaded`);
    },
    onEntitlementsUpdated(entitlements) {
      console.log(`Store: entitlements updated, VIP=${entitlements.isVip}`);
    },
    onEquippedUpdated(equipped) {
      console.log(`Store: equipped updated`, equipped);
      if (ui.store.isOpen) {
        ui.store.updateEntitlements(
          storeClient.entitlements!,
          equipped,
        );
      }
    },
    onPurchaseUrl(url) {
      // Stripe checkout — redirect to payment page
      window.open(url, "_blank");
    },
    onPurchaseComplete(itemId) {
      console.log(`Store: purchased ${itemId}`);
      ui.store.showPurchaseResult(itemId, true);
    },
    onPurchaseError(message) {
      console.error(`Store: purchase error: ${message}`);
      ui.store.showPurchaseResult("", false, message);
    },
  });

  // Wire store panel actions now that storeClient and conn exist
  ui.store.setActions({
    onPurchase: (itemId) => storeClient.purchase(conn, itemId),
    onEquip: (itemId) => storeClient.equip(conn, itemId),
    onUnequip: (category) => storeClient.unequip(conn, category),
    onClose: () => ui.store.close(),
  });

  // Restore username from localStorage if available
  if (authClient.username) {
    ui.menus.setLoggedInUser(authClient.username);
  }

  // ─── Start World Game ───────────────────────────────────────────────

  function startWorldGame(): void {
    mode = "world";
    if (wc.owner !== null) {
      playerOwner = wc.owner;
      ui.turnFlow.setOwner(wc.owner);
    }

    if (wc.visibleState) {
      camera.reconfigure(wc.visibleState.config.mapWidth, wc.visibleState.config.mapHeight);
      const playerCity = wc.visibleState.cities.find(c => c.owner === wc.owner);
      if (playerCity) {
        camera.centerOnTile(locCol(playerCity.loc), locRow(playerCity.loc));
      }
    }

    resetSelection();
    ui.eventLog.clear();
    ui.warStats.clear();
    ui.menus.hide();
    gameStarted = true;
    audio.playGameStart();
    audio.startAmbient();
    console.log(`Empire Reborn v${GAME_VERSION} — World mode started`);
  }

  // ─── Fetch World List ──────────────────────────────────────────────────

  async function fetchWorldList(): Promise<WorldSummary[]> {
    try {
      const res = await fetch(`${serverUrl}/api/worlds`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  // ─── Lobby ──────────────────────────────────────────────────────────────

  async function refreshLobby(): Promise<void> {
    const serverUrl = location.port === "5174"
      ? `http://${location.hostname}:3001`
      : "";
    const { active } = await fetchLobbyGames(serverUrl);
    ui.menus.showLobby(active, connState);
  }

  // ─── Highlight Management ─────────────────────────────────────────────

  function refreshHighlights(): void {
    if (selection.selectedUnitId === null) {
      currentHighlights = [];
      return;
    }

    if (mode === "singleplayer") {
      const unit = game.state.units.find((u) => u.id === selection.selectedUnitId);
      if (!unit || unit.owner !== playerOwner) {
        currentHighlights = [];
        return;
      }
      currentHighlights = computeHighlights(unit, game.state);
    } else if (mode === "multiplayer" && mp.visibleState && mp.owner !== null) {
      const unit = mp.visibleState.units.find((u) => u.id === selection.selectedUnitId);
      if (!unit || unit.owner !== mp.owner) {
        currentHighlights = [];
        return;
      }
      currentHighlights = computeMultiplayerHighlights(unit);
    } else if (mode === "world" && wc.visibleState && wc.owner !== null) {
      const unit = wc.visibleState.units.find((u) => u.id === selection.selectedUnitId);
      if (!unit || unit.owner !== wc.owner) {
        currentHighlights = [];
        return;
      }
      currentHighlights = computeWorldHighlights(unit);
    }
  }

  function computeWorldHighlights(unit: { id: number; loc: number; type: number; owner: number; moved: number; hits: number }): TileHighlight[] {
    if (!wc.visibleState || wc.owner === null) return [];
    const highlights: TileHighlight[] = [];
    const { config, units, cities, viewMap } = wc.visibleState;
    const mapWidth = config.mapWidth;
    const mapHeight = config.mapHeight;

    for (let d = 0; d < 8; d++) {
      const targetLoc = unit.loc + DIR_OFFSET[d];
      const col = targetLoc % mapWidth;
      const row = Math.floor(targetLoc / mapWidth);
      if (col < 0 || col >= mapWidth || row < 0 || row >= mapHeight) continue;

      const enemyUnit = units.find((u) => u.loc === targetLoc && u.owner !== wc.owner && u.shipId === null);
      const city = cities.find((c) => c.loc === targetLoc);
      const isEnemyCity = city && city.owner !== wc.owner && city.owner !== Owner.Unowned;
      const isNeutralCity = city && city.owner === Owner.Unowned && unit.type === UnitType.Army;

      if (enemyUnit || isEnemyCity || isNeutralCity) {
        highlights.push({ loc: targetLoc, type: "attack" });
      } else {
        const view = viewMap[targetLoc];
        if (view && view.seen >= 0) {
          highlights.push({ loc: targetLoc, type: "move" });
        }
      }
    }
    return highlights;
  }

  function computeMultiplayerHighlights(unit: { id: number; loc: number; type: number; owner: number; moved: number; hits: number }): TileHighlight[] {
    if (!mp.visibleState || mp.owner === null) return [];
    const highlights: TileHighlight[] = [];
    const { config, units, cities, viewMap } = mp.visibleState;
    const mapWidth = config.mapWidth;
    const mapHeight = config.mapHeight;

    for (let d = 0; d < 8; d++) {
      const targetLoc = unit.loc + DIR_OFFSET[d];
      const col = targetLoc % mapWidth;
      const row = Math.floor(targetLoc / mapWidth);
      if (col < 0 || col >= mapWidth || row < 0 || row >= mapHeight) continue;

      // Check for enemy units/cities at target
      const enemyUnit = units.find((u) => u.loc === targetLoc && u.owner !== mp.owner && u.shipId === null);
      const city = cities.find((c) => c.loc === targetLoc);
      const isEnemyCity = city && city.owner !== mp.owner && city.owner !== Owner.Unowned;
      const isNeutralCity = city && city.owner === Owner.Unowned && unit.type === UnitType.Army;

      if (enemyUnit || isEnemyCity || isNeutralCity) {
        highlights.push({ loc: targetLoc, type: "attack" });
      } else {
        // Simple terrain check from view map
        const view = viewMap[targetLoc];
        if (view && view.seen >= 0) {
          highlights.push({ loc: targetLoc, type: "move" });
        }
      }
    }
    return highlights;
  }

  // ─── Start Single Player ───────────────────────────────────────────────

  function startSinglePlayer(options?: GameSetupOptions): void {
    mode = "singleplayer";
    const configOverrides: Partial<GameConfig> = {
      numPlayers: 6, // 1 human + 5 AI kingdoms
    };
    if (options) {
      configOverrides.mapWidth = options.mapSize.width;
      configOverrides.mapHeight = options.mapSize.height;
      configOverrides.waterRatio = options.terrain.waterRatio;
      configOverrides.smoothPasses = options.terrain.smoothPasses;
      if (options.terrain.mapType) {
        configOverrides.mapType = options.terrain.mapType;
      }
    }
    game = createSinglePlayerGame(configOverrides);
    playerOwner = Owner.Player1;
    collector = createActionCollector(game, playerOwner);

    // Reconfigure camera for the new map dimensions
    camera.reconfigure(game.state.config.mapWidth, game.state.config.mapHeight);

    const playerCity = game.state.cities.find((c) => c.owner === playerOwner);
    if (playerCity) {
      camera.centerOnTile(locCol(playerCity.loc), locRow(playerCity.loc));
    }

    resetSelection();
    ui.turnFlow.startTurn(game.state);
    ui.turnFlow.nextUnit(game.state, camera);
    if (ui.turnFlow.currentUnitId !== null) {
      selection.selectedUnitId = ui.turnFlow.currentUnitId;
      refreshHighlights();
    }

    ui.eventLog.clear();
    ui.warStats.clear();
    ui.menus.hide();
    gameStarted = true;
    audio.playGameStart();
    audio.startAmbient();
    // Expose game state for E2E testing
    (window as any).__empire = { game, selection, ui };
    // Apply initial debug flags (e.g. if toggled before game start)
    applyDebugFlags();

    console.log(`Empire Reborn v${GAME_VERSION} — Single player started`);
  }

  // ─── Debug Helpers ──────────────────────────────────────────────────────

  function revealMapForOwner(owner: Owner): void {
    const mapSize = game.state.map.length;
    for (let loc = 0; loc < mapSize; loc++) {
      if (game.state.map[loc].onBoard) {
        scan(game.state, owner, loc);
      }
    }
  }

  function applyDebugFlags(): void {
    if (mode !== "singleplayer") return;
    const flags = ui.debug.flags;
    if (flags.revealMap) {
      revealMapForOwner(playerOwner);
    }
    if (flags.aiOmniscient) {
      // Reveal map for all AI players
      for (const p of game.state.players) {
        if (p.id !== playerOwner) {
          revealMapForOwner(p.id as Owner);
        }
      }
    }
  }

  // ─── Start Multiplayer Game ─────────────────────────────────────────────

  function startMultiplayerGame(): void {
    mode = "multiplayer";
    if (mp.owner !== null) {
      ui.turnFlow.setOwner(mp.owner);
    }

    // Reconfigure camera for the server's map dimensions
    if (mp.visibleState) {
      camera.reconfigure(mp.visibleState.config.mapWidth, mp.visibleState.config.mapHeight);
    }

    resetSelection();
    ui.eventLog.clear();
    ui.warStats.clear();
    ui.menus.hide();
    gameStarted = true;

    // Center on our starting city once we get state
    if (mp.visibleState && mp.owner !== null) {
      const playerCity = mp.visibleState.cities.find((c) => c.owner === mp.owner);
      if (playerCity) {
        camera.centerOnTile(
          locCol(playerCity.loc),
          locRow(playerCity.loc),
        );
      }
    }

    audio.playGameStart();
    audio.startAmbient();
    console.log(`Empire Reborn v${GAME_VERSION} — Multiplayer game started`);
  }

  // ─── Reset Selection ────────────────────────────────────────────────────

  function resetSelection(): void {
    selection.selectedUnitId = null;
    selection.selectedCityId = null;
    selection.hoveredTile = null;
    currentHighlights = [];
    lastEventCount = 0;
  }

  // Show main menu
  ui.menus.showMainMenu();

  // ─── Build UI State ───────────────────────────────────────────────────

  function buildUIState(): UIState {
    if (mode === "singleplayer") {
      return buildSinglePlayerUIState();
    } else if (mode === "multiplayer") {
      return buildMultiplayerUIState();
    } else if (mode === "world") {
      return buildWorldUIState();
    }
    // Fallback (menu)
    return {
      turn: 0, owner: Owner.Player1,
      playerCityCount: 0, playerUnitCount: 0, enemyCityCount: 0,
      unitCountsByType: new Array(NUM_UNIT_TYPES).fill(0),
      selectedUnit: null, selectedCity: null,
      pendingActionCount: 0, events: [], isGameOver: false, winner: null,
      resources: [0, 0, 0], resourceIncome: [0, 0, 0],
      techResearch: [0, 0, 0, 0],
    };
  }

  function buildSinglePlayerUIState(): UIState {
    const state = game.state;
    const selectedUnit = selection.selectedUnitId !== null
      ? state.units.find((u) => u.id === selection.selectedUnitId) ?? null
      : null;
    const selectedCity = selection.selectedCityId !== null
      ? state.cities.find((c) => c.id === selection.selectedCityId) ?? null
      : null;

    const playerUnits = state.units.filter((u) => u.owner === playerOwner);
    const unitCountsByType = new Array(NUM_UNIT_TYPES).fill(0);
    for (const u of playerUnits) unitCountsByType[u.type]++;

    // Compute per-turn resource income
    const playerCities = state.cities.filter((c) => c.owner === playerOwner);
    const income = [0, 0, 0];
    for (let i = 0; i < 3; i++) income[i] += playerCities.length * CITY_INCOME[i];
    for (const dep of state.deposits) {
      if (dep.owner === playerOwner && dep.buildingComplete) {
        income[DEPOSIT_RESOURCE[dep.type]] += DEPOSIT_INCOME;
      }
    }

    return {
      turn: state.turn,
      owner: playerOwner,
      playerCityCount: playerCities.length,
      playerUnitCount: playerUnits.length,
      enemyCityCount: state.cities.filter((c) => c.owner !== playerOwner && c.owner !== Owner.Unowned).length,
      unitCountsByType,
      selectedUnit,
      selectedCity,
      pendingActionCount: collector.actions.length,
      events: [...collector.turnEvents],
      isGameOver: game.isGameOver,
      winner: game.winner,
      resources: state.resources[playerOwner],
      resourceIncome: income,
      techResearch: state.techResearch[playerOwner],
    };
  }

  function buildMultiplayerUIState(): UIState {
    const vs = mp.visibleState;
    if (!vs || mp.owner === null) {
      return {
        turn: 0, owner: Owner.Player1,
        playerCityCount: 0, playerUnitCount: 0, enemyCityCount: 0,
        unitCountsByType: new Array(NUM_UNIT_TYPES).fill(0),
        selectedUnit: null, selectedCity: null,
        pendingActionCount: 0, events: [], isGameOver: false, winner: null,
        resources: [0, 0, 0], resourceIncome: [0, 0, 0],
        techResearch: [0, 0, 0, 0],
      };
    }

    const playerOwner = mp.owner;
    const selectedUnit = selection.selectedUnitId !== null
      ? vs.units.find((u) => u.id === selection.selectedUnitId) ?? null
      : null;

    // Find selected city from visible cities
    const selectedVisCity = selection.selectedCityId !== null
      ? vs.cities.find((c) => c.id === selection.selectedCityId)
      : null;
    // Convert VisibleCity → CityState shape for UI (fill in missing fields)
    const selectedCity = selectedVisCity ? {
      id: selectedVisCity.id,
      loc: selectedVisCity.loc,
      owner: selectedVisCity.owner,
      production: selectedVisCity.production,
      work: selectedVisCity.work ?? 0,
    } : null;

    const mpPlayerUnits = vs.units.filter((u) => u.owner === playerOwner);
    const mpUnitCounts = new Array(NUM_UNIT_TYPES).fill(0);
    for (const u of mpPlayerUnits) mpUnitCounts[u.type]++;

    return {
      turn: vs.turn,
      owner: playerOwner,
      playerCityCount: vs.cities.filter((c) => c.owner === playerOwner).length,
      playerUnitCount: mpPlayerUnits.length,
      enemyCityCount: vs.cities.filter((c) => c.owner !== playerOwner && c.owner !== Owner.Unowned).length,
      unitCountsByType: mpUnitCounts,
      selectedUnit,
      selectedCity: selectedCity as any, // CityState shape subset
      pendingActionCount: 0,
      events: [...mp.turnEvents],
      isGameOver: mp.isGameOver,
      winner: mp.winner,
      resources: [0, 0, 0], resourceIncome: [0, 0, 0], // TODO: server needs to send resource data
      techResearch: [0, 0, 0, 0],
    };
  }

  function buildWorldUIState(): UIState {
    const vs = wc.visibleState;
    if (!vs || wc.owner === null) {
      return {
        turn: 0, owner: Owner.Player1,
        playerCityCount: 0, playerUnitCount: 0, enemyCityCount: 0,
        unitCountsByType: new Array(NUM_UNIT_TYPES).fill(0),
        selectedUnit: null, selectedCity: null,
        pendingActionCount: 0, events: [], isGameOver: false, winner: null,
        resources: [0, 0, 0], resourceIncome: [0, 0, 0],
        techResearch: [0, 0, 0, 0],
        isWorldMode: true,
      };
    }

    const wo = wc.owner;
    const selectedUnit = selection.selectedUnitId !== null
      ? vs.units.find((u) => u.id === selection.selectedUnitId) ?? null
      : null;
    const selectedVisCity = selection.selectedCityId !== null
      ? vs.cities.find((c) => c.id === selection.selectedCityId) : null;
    const selectedCity = selectedVisCity ? {
      id: selectedVisCity.id, loc: selectedVisCity.loc, owner: selectedVisCity.owner,
      production: selectedVisCity.production, work: selectedVisCity.work ?? 0,
    } : null;

    const wPlayerUnits = vs.units.filter((u) => u.owner === wo);
    const wUnitCounts = new Array(NUM_UNIT_TYPES).fill(0);
    for (const u of wPlayerUnits) wUnitCounts[u.type]++;

    return {
      turn: vs.turn,
      owner: wo,
      playerCityCount: vs.cities.filter((c) => c.owner === wo).length,
      playerUnitCount: wPlayerUnits.length,
      enemyCityCount: vs.cities.filter((c) => c.owner !== wo && c.owner !== Owner.Unowned).length,
      unitCountsByType: wUnitCounts,
      selectedUnit,
      selectedCity: selectedCity as any,
      pendingActionCount: wc.actionsQueued,
      events: [],
      isGameOver: false,
      winner: null,
      resources: [0, 0, 0], resourceIncome: [0, 0, 0],
      techResearch: [0, 0, 0, 0],
      // World mode fields
      isWorldMode: true,
      tickNextMs: worldTickCountdown,
      tickIntervalMs: worldTickInfo?.tickIntervalMs,
      seasonRemainingS: worldTickInfo?.seasonRemainingS,
      shieldRemainingMs: worldTickInfo?.shieldRemainingMs,
      worldActionsQueued: wc.actionsQueued,
    };
  }

  // ─── Helper to build GameState-like object for turn flow ────────────────

  function stateForTurnFlow(vs: VisibleGameState): { units: any[]; cities: any[]; config: any; turn: number } {
    return {
      units: vs.units,
      cities: vs.cities,
      config: vs.config,
      turn: vs.turn,
    };
  }

  // ─── Handle Click ─────────────────────────────────────────────────────

  function handleClick(screenX: number, screenY: number, shiftKey: boolean): void {
    const vw = app.screen.width;
    const vh = app.screen.height;

    if (screenX > vw - 200) return;

    const tile = screenToTile(screenX, screenY, camera, vw, vh);
    const mapWidth = mode === "singleplayer" ? game.state.config.mapWidth
      : mode === "world" ? (wc.visibleState?.config.mapWidth ?? 100)
      : (mp.visibleState?.config.mapWidth ?? 100);
    const mapHeight = mode === "singleplayer" ? game.state.config.mapHeight
      : mode === "world" ? (wc.visibleState?.config.mapHeight ?? 60)
      : (mp.visibleState?.config.mapHeight ?? 60);

    if (tile.col < 0 || tile.col >= mapWidth || tile.row < 0 || tile.row >= mapHeight) return;

    const loc = tile.row * mapWidth + tile.col;

    // ─── Click on highlighted tile → move/attack ────────────────────
    if (selection.selectedUnitId !== null && currentHighlights.length > 0) {
      if (mode === "singleplayer") {
        handleSinglePlayerClickAction(loc);
      } else if (mode === "multiplayer") {
        handleMultiplayerClickAction(loc);
      } else if (mode === "world") {
        handleWorldClickAction(loc);
      }
      return;
    }

    // ─── Click on own unit → select (re-click cycles to city) ─────
    const clickOwner = mode === "singleplayer" ? playerOwner : mode === "world" ? wc.owner : mp.owner;
    const units = mode === "singleplayer" ? game.state.units : mode === "world" ? (wc.visibleState?.units ?? []) : (mp.visibleState?.units ?? []);
    const playerUnit = units.find(
      (u) => u.loc === loc && u.owner === clickOwner && u.shipId === null,
    );

    // Debug: log what's at the clicked tile
    const allAtLoc = units.filter((u) => u.loc === loc);
    console.log(`[Click] screen=(${screenX},${screenY}) tile=(${tile.row},${tile.col}) loc=${loc} unitsHere=${allAtLoc.length} playerOwner=${clickOwner}`);
    if (allAtLoc.length > 0) {
      console.log(`[Click]   units:`,
        allAtLoc.map(u => `#${u.id} ${UNIT_ATTRIBUTES[u.type].name} owner=${u.owner} shipId=${u.shipId}`));
      console.log(`[Click]   matched=${playerUnit ? `#${playerUnit.id}` : "none"}`);
    }

    const cities = mode === "singleplayer"
      ? game.state.cities
      : mode === "world"
      ? (wc.visibleState?.cities ?? [])
      : (mp.visibleState?.cities ?? []);
    const city = cities.find((c) => c.loc === loc && c.owner === clickOwner);

    if (playerUnit) {
      // If this unit is already selected and there's a city here, cycle to city
      if (selection.selectedUnitId === playerUnit.id && city) {
        selection.selectedCityId = city.id;
        selection.selectedUnitId = null;
        currentHighlights = [];
        audio.playSelect();
        if (shiftKey) {
          ui.cityPanel.open(city as any, mode === "singleplayer" ? game.state.buildings : [], getLockedUnitTypes());
        }
        return;
      }
      selection.selectedUnitId = playerUnit.id;
      selection.selectedCityId = null;
      audio.playSelect();
      refreshHighlights();
      return;
    }

    // ─── Click on own city → select ─────────────────────────────────
    if (city) {
      selection.selectedCityId = city.id;
      selection.selectedUnitId = null;
      currentHighlights = [];

      if (shiftKey) {
        ui.cityPanel.open(city as any, mode === "singleplayer" ? game.state.buildings : [], getLockedUnitTypes());
      }
      return;
    }

    // ─── Click on empty → deselect ──────────────────────────────────
    selection.selectedUnitId = null;
    selection.selectedCityId = null;
    currentHighlights = [];
  }

  function handleSinglePlayerClickAction(loc: number): void {
    const action = getClickAction(
      game.state.units.find((u) => u.id === selection.selectedUnitId)!,
      loc,
      currentHighlights,
    );

    if (!action) return;

    const unitId = selection.selectedUnitId!;
    let success = false;

    if (action.type === "move") {
      const srcLoc = game.state.units.find((u) => u.id === unitId)!.loc;
      success = collector.moveUnit(unitId, directionFromLocs(srcLoc, loc));
      if (success) {
        const u = game.state.units.find((u) => u.id === unitId);
        if (u) {
          console.log(`[MOVE] Unit #${unitId} (${UnitType[u.type]}) → (${locCol(loc)},${locRow(loc)})`);
          audio.playMove(u.type);
        }
      }
    } else {
      const u = game.state.units.find((u) => u.id === unitId);
      console.log(`[ATTACK] Unit #${unitId} (${u ? UnitType[u.type] : "?"}) → (${locCol(loc)},${locRow(loc)})`);
      success = collector.attackTarget(unitId, loc);
      if (success) audio.playCombat();
    }

    if (success) {
      emitNewSinglePlayerParticles();
      const updatedUnit = game.state.units.find((u) => u.id === unitId);
      if (!updatedUnit || updatedUnit.moved >= objMoves(updatedUnit)) {
        ui.turnFlow.markDone(unitId);
        advanceToNextUnit();
      } else {
        refreshHighlights();
      }
    }
  }

  function handleMultiplayerClickAction(loc: number): void {
    if (!mp.visibleState || mp.owner === null) return;

    const unit = mp.visibleState.units.find((u) => u.id === selection.selectedUnitId);
    if (!unit) return;

    const highlight = currentHighlights.find((h) => h.loc === loc);
    if (!highlight) return;

    if (highlight.type === "attack") {
      mp.attackTarget(unit.id, loc);
      audio.playCombat();
    } else {
      const dir = directionFromLocs(unit.loc, loc);
      mp.moveUnit(unit.id, dir);
      audio.playMove(unit.type);
    }

    // After sending, clear highlights — server will send updated state
    ui.turnFlow.markDone(unit.id);
    advanceToNextUnit();
  }

  function handleWorldClickAction(loc: number): void {
    if (!wc.visibleState || wc.owner === null) return;

    const unit = wc.visibleState.units.find((u) => u.id === selection.selectedUnitId);
    if (!unit) return;

    const highlight = currentHighlights.find((h) => h.loc === loc);
    if (!highlight) return;

    if (highlight.type === "attack") {
      wc.attackTarget(unit.id, loc);
      audio.playCombat();
    } else {
      const dir = directionFromLocs(unit.loc, loc);
      wc.moveUnit(unit.id, dir);
      audio.playMove(unit.type);
    }

    ui.turnFlow.markDone(unit.id);
    advanceToNextUnit();
  }

  // ─── Direction from source to adjacent target ────────────────────────

  function directionFromLocs(srcLoc: number, dstLoc: number): Direction {
    const diff = dstLoc - srcLoc;
    for (let d = 0; d < 8; d++) {
      if (DIR_OFFSET[d] === diff) return d as Direction;
    }
    return Direction.North;
  }

  // ─── Particle Emission ────────────────────────────────────────────────

  function emitNewSinglePlayerParticles(): void {
    const events = collector.turnEvents;
    for (let i = lastEventCount; i < events.length; i++) {
      emitParticleForEvent(events[i]);
    }
    lastEventCount = events.length;
  }

  function emitParticlesForEvents(events: TurnEvent[]): void {
    for (const event of events) {
      emitParticleForEvent(event);
    }
  }

  function logEvent(event: TurnEvent): void {
    const col = locCol(event.loc);
    const row = locRow(event.loc);
    const tag = `[${event.type.toUpperCase()}]`;
    const pos = `(${col},${row})`;
    const data = event.data ? ` ${JSON.stringify(event.data)}` : "";
    console.log(`${tag} ${pos} ${event.description}${data}`);
  }

  function emitParticleForEvent(event: TurnEvent): void {
    logEvent(event);
    if (event.type === "combat") {
      particles.emitExplosion(event.loc);
      audio.playExplosion();
      shake.trigger(0.6);
    } else if (event.type === "capture") {
      const owner = mode === "singleplayer" ? playerOwner : mode === "world" ? (wc.owner ?? Owner.Player1) : (mp.owner ?? Owner.Player1);
      particles.emitCapture(event.loc, owner);
      audio.playCapture();
      shake.trigger(0.3);
    } else if (event.type === "death") {
      const owner = event.data?.owner as number ?? Owner.Unowned;
      particles.emitDeath(event.loc, owner);
      audio.playDeath();
      shake.trigger(0.4);
    } else if (event.type === "production") {
      audio.playProduction();
    }
  }

  // ─── Advance to Next Unit ─────────────────────────────────────────────

  function advanceToNextUnit(): void {
    if (mode === "singleplayer") {
      ui.turnFlow.nextUnit(game.state, camera);
    } else if (mode === "world" && wc.visibleState) {
      ui.turnFlow.nextUnit(stateForTurnFlow(wc.visibleState) as any, camera);
    } else if (mp.visibleState) {
      ui.turnFlow.nextUnit(stateForTurnFlow(mp.visibleState) as any, camera);
    }
    if (ui.turnFlow.currentUnitId !== null) {
      selection.selectedUnitId = ui.turnFlow.currentUnitId;
      selection.selectedCityId = null;
    } else {
      selection.selectedUnitId = null;
    }
    refreshHighlights();
  }

  // ─── Diagnostic Logging ────────────────────────────────────────────────

  function getDiagUrl(): string {
    const isDev = window.location.port === "5174";
    return isDev
      ? `http://${window.location.hostname}:3001/api/gamelog`
      : `${window.location.origin}/api/gamelog`;
  }

  function sendDiagnostic(text: string): void {
    fetch(getDiagUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).catch(() => { /* ignore network errors */ });
  }

  function clearDiagnosticLog(): void {
    fetch(getDiagUrl(), { method: "DELETE" }).catch(() => {});
  }

  // ─── End Turn ─────────────────────────────────────────────────────────

  async function handleEndTurn(): Promise<void> {
    if (mode === "singleplayer") {
      // Show economy review screen first, then execute turn on confirm
      await ui.economyReview.open(game.state, playerOwner, [...collector.turnEvents]);
      audio.playTurnEnd();
      handleSinglePlayerEndTurn();
    } else if (mode === "multiplayer") {
      audio.playTurnEnd();
      mp.endTurn();
      // Server will send state_update when both players have ended
    } else if (mode === "world") {
      // In world mode, turns are tick-based — no manual end turn
      // Enter is a no-op (actions are buffered automatically)
    }
  }

  function handleSinglePlayerEndTurn(): void {
    // Start capturing AI logs if diagnostic logging is enabled
    const capturing = ui.debug.flags.diagLog;
    if (capturing) startAILogCapture();

    // Auto-play mode: compute AI actions for Player1 instead of using collected actions
    let result;
    if (ui.debug.flags.playerAI) {
      // Apply debug vision BEFORE AI computes (so AI can see the full map if enabled)
      applyDebugFlags();
      const aiP1Actions = computeAITurn(game.state, playerOwner);
      result = game.submitTurn(aiP1Actions);
    } else {
      result = collector.endTurn();
    }

    // Stop capturing and grab the AI logs
    const aiLogs = capturing ? stopAILogCapture() : undefined;

    // Apply debug flags after turn (reveal map, AI omniscience)
    applyDebugFlags();

    const s = game.state;
    const playerUnitsCount = s.units.filter(u => u.owner === playerOwner).length;
    const enemyUnitsCount = s.units.filter(u => u.owner !== playerOwner && u.owner !== Owner.Unowned).length;
    const playerCitiesCount = s.cities.filter(c => c.owner === playerOwner).length;
    const enemyCitiesCount = s.cities.filter(c => c.owner !== playerOwner && c.owner !== Owner.Unowned).length;
    console.log(`[TURN ${s.turn}] Player: ${playerCitiesCount} cities, ${playerUnitsCount} units | Enemies: ${enemyCitiesCount} cities, ${enemyUnitsCount} units | ${result.events.length} events`);

    // Send diagnostic log to server if enabled
    if (capturing) {
      // Clear log file on first turn of a new game
      if (s.turn === 1) clearDiagnosticLog();
      const diagText = generateDiagnostic(s, result.events, aiLogs);
      sendDiagnostic(diagText);
    }

    ui.eventLog.addEvents(result.events);
    // result.turn is the NEW turn (after increment), so battles happened on turn - 1
    ui.warStats.addEvents(result.turn - 1, result.events);

    for (const event of result.events) {
      emitParticleForEvent(event);
    }

    if (game.isGameOver) {
      const uiState = buildUIState();
      audio.stopAmbient();
      audio.playGameOver(game.winner === playerOwner);
      ui.menus.showGameOver(
        game.winner!,
        playerOwner,
        game.state.turn,
        uiState.playerCityCount,
        uiState.playerUnitCount,
      );
      return;
    }

    collector.reset();
    lastEventCount = 0;
    audio.playTurnStart();
    ui.turnFlow.startTurn(game.state);
    ui.turnFlow.nextUnit(game.state, camera);
    if (ui.turnFlow.currentUnitId !== null) {
      selection.selectedUnitId = ui.turnFlow.currentUnitId;
      selection.selectedCityId = null;
    } else {
      selection.selectedUnitId = null;
      selection.selectedCityId = null;
    }
    refreshHighlights();
  }

  // ─── Remote action helpers (multiplayer or world mode) ─────────────────

  function remoteSetBehavior(unitId: number, behavior: UnitBehavior): void {
    if (mode === "world") {
      wc.setBehavior(unitId, behavior);
    } else {
      mp.setBehavior(unitId, behavior);
    }
  }

  function remoteSetProduction(cityId: number, unitType: UnitType): void {
    if (mode === "world") {
      wc.setProduction(cityId, unitType);
    } else {
      mp.setProduction(cityId, unitType);
    }
  }

  // ─── Handle Key Presses ───────────────────────────────────────────────

  function handleKeyPress(key: string): void {
    if (key === "escape") {
      if (ui.economyReview.isOpen) return; // Economy review handles its own Escape
      if (ui.cityPanel.isOpen) {
        ui.cityPanel.close();
      } else {
        selection.selectedUnitId = null;
        selection.selectedCityId = null;
        currentHighlights = [];
      }
      return;
    }

    if (ui.cityPanel.isOpen) return;
    if (ui.economyReview.isOpen) return;

    const keyOwner = mode === "singleplayer" ? playerOwner : mode === "world" ? wc.owner : mp.owner;

    switch (key) {
      case " ":
        if (selection.selectedUnitId !== null) {
          ui.turnFlow.skipUnit();
          advanceToNextUnit();
        }
        break;

      case "n":
        advanceToNextUnit();
        break;

      case "enter":
        handleEndTurn();
        break;

      case "g":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Sentry);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Sentry);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;

      case "f":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Explore);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Explore);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;

      case "a":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Aggressive);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Aggressive);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;

      case "d":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Cautious);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Cautious);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;

      case "p":
        if (selection.selectedCityId !== null) {
          const cities = mode === "singleplayer"
            ? game.state.cities
            : (mp.visibleState?.cities ?? []);
          const city = cities.find((c: any) => c.id === selection.selectedCityId);
          if (city && city.owner === keyOwner) {
            ui.cityPanel.open(city as any, mode === "singleplayer" ? game.state.buildings : [], getLockedUnitTypes());
          }
        }
        break;

      case "t":
        if (selection.selectedUnitId !== null) {
          const units = mode === "singleplayer" ? game.state.units : (mp.visibleState?.units ?? []);
          const unit = units.find((u) => u.id === selection.selectedUnitId);
          if (unit && unit.type === UnitType.Army) {
            if (mode === "singleplayer") {
              collector.setBehavior(selection.selectedUnitId, UnitBehavior.WaitForTransport);
            } else {
              remoteSetBehavior(selection.selectedUnitId, UnitBehavior.WaitForTransport);
            }
            ui.turnFlow.markDone(selection.selectedUnitId);
            advanceToNextUnit();
          }
        }
        break;

      case "u":
        if (selection.selectedUnitId !== null) {
          const units = mode === "singleplayer" ? game.state.units : (mp.visibleState?.units ?? []);
          const unit = units.find((u) => u.id === selection.selectedUnitId);
          if (unit && unit.shipId !== null) {
            if (mode === "singleplayer") {
              collector.setBehavior(selection.selectedUnitId, UnitBehavior.Land);
            } else {
              remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Land);
            }
            ui.turnFlow.markDone(selection.selectedUnitId);
            advanceToNextUnit();
          }
        }
        break;
    }
  }

  // ─── Handle Panel Actions ─────────────────────────────────────────────

  function handlePanelAction(action: string): void {
    switch (action) {
      case "skip":
        if (selection.selectedUnitId !== null) {
          ui.turnFlow.skipUnit();
          advanceToNextUnit();
        }
        break;
      case "sentry":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Sentry);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Sentry);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "explore":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Explore);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Explore);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "aggressive":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Aggressive);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Aggressive);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "cautious":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Cautious);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Cautious);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "wait-transport":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.WaitForTransport);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.WaitForTransport);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "disembark":
        if (selection.selectedUnitId !== null) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Land);
          } else {
            remoteSetBehavior(selection.selectedUnitId, UnitBehavior.Land);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "open-city-panel":
        if (selection.selectedCityId !== null) {
          const cities = mode === "singleplayer"
            ? game.state.cities
            : (mp.visibleState?.cities ?? []);
          const city = cities.find((c: any) => c.id === selection.selectedCityId);
          const panelOwner = mode === "singleplayer" ? playerOwner : mp.owner;
          if (city && city.owner === panelOwner) {
            ui.cityPanel.open(city as any, mode === "singleplayer" ? game.state.buildings : [], getLockedUnitTypes());
          }
        }
        break;
      case "build-on-deposit":
        if (selection.selectedUnitId !== null && mode === "singleplayer") {
          collector.buildOnDeposit(selection.selectedUnitId);
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "next-unit":
        advanceToNextUnit();
        break;
      case "end-turn":
        handleEndTurn();
        break;
      default:
        // Handle build-upgrade-N actions
        if (action.startsWith("build-upgrade-") && selection.selectedUnitId !== null && mode === "singleplayer") {
          const buildingType = parseInt(action.replace("build-upgrade-", ""), 10);
          if (!isNaN(buildingType)) {
            const unit = findUnit(game.state, selection.selectedUnitId);
            if (unit) {
              const cell = game.state.map[unit.loc];
              if (cell.cityId !== null) {
                const city = game.state.cities[cell.cityId];
                collector.buildCityUpgrade(selection.selectedUnitId, city.id, buildingType);
                ui.turnFlow.markDone(selection.selectedUnitId);
                advanceToNextUnit();
              }
            }
          }
        }
        // Handle build-structure-N actions (defensive/naval structures)
        if (action.startsWith("build-structure-") && selection.selectedUnitId !== null && mode === "singleplayer") {
          const buildingType = parseInt(action.replace("build-structure-", ""), 10);
          if (!isNaN(buildingType)) {
            collector.buildStructure(selection.selectedUnitId, buildingType);
            ui.turnFlow.markDone(selection.selectedUnitId);
            advanceToNextUnit();
          }
        }
        break;
    }
  }

  // ─── Get Current Renderable State ──────────────────────────────────────

  function getCurrentRenderableState(): RenderableState | null {
    if (mode === "singleplayer") {
      return buildRenderableState(game);
    } else if (mode === "multiplayer") {
      return mp.buildRenderableState();
    } else if (mode === "world") {
      return wc.buildRenderableState();
    }
    return null;
  }

  // ─── Game Loop ──────────────────────────────────────────────────────────

  app.ticker.add(() => {
    const dt = app.ticker.deltaMS / 1000;
    const vw = app.screen.width;
    const vh = app.screen.height;

    // ─── Menu handling ──────────────────────────────────────────────────
    const menuAction = ui.menus.consumeAction();
    if (menuAction !== null) {
      audio.playUIClick();
      if (menuAction === "new-game") {
        ui.menus.showGameSetup("singleplayer");
      } else if (menuAction === "multiplayer") {
        // Connect and show lobby
        if (connState === "disconnected") {
          conn.connect();
        }
        refreshLobby();
      } else if (menuAction === "create-online") {
        ui.menus.showGameSetup("multiplayer");
      } else if (menuAction === "show-login") {
        ui.menus.showLoginScreen("login");
      } else if (menuAction === "show-register") {
        ui.menus.showLoginScreen("register");
      } else if (menuAction === "show-store") {
        // Open store — request items if not yet loaded
        if (connState === "disconnected") conn.connect();
        storeClient.requestItems(conn);
        if (authClient.isLoggedIn) {
          storeClient.requestEntitlements(conn);
        }
        ui.store.open(
          storeClient.items,
          storeClient.entitlements,
          storeClient.equipped,
        );
      } else if (menuAction === "logout") {
        authClient.logout();
        ui.menus.setLoggedInUser(null);
        ui.menus.showMainMenu();
      } else if (menuAction === "world-browser") {
        // Connect and show world browser
        if (connState === "disconnected") {
          conn.connect();
        }
        fetchWorldList().then(worlds => {
          ui.menus.showWorldBrowser(worlds, connState, authClient.kingdoms);
        });
      } else if (menuAction === "create-world") {
        ui.menus.showWorldSetup();
      } else if (menuAction === "back-to-main") {
        mp.reset();
        wc.reset();
        conn.disconnect();
        audio.stopAmbient();
        mode = "none";
        gameStarted = false;
        ui.menus.showMainMenu();
      } else if (typeof menuAction === "object" && menuAction.type === "start-game") {
        startSinglePlayer(menuAction.options);
      } else if (typeof menuAction === "object" && menuAction.type === "start-online") {
        if (connState !== "connected") {
          conn.connect();
        }
        mp.reset();
        mp.createGame(menuAction.options);
      } else if (typeof menuAction === "object" && menuAction.type === "join-game") {
        if (connState !== "connected") {
          conn.connect();
        }
        mp.reset();
        mp.joinGame(menuAction.gameId);
      } else if (typeof menuAction === "object" && menuAction.type === "login") {
        authClient.login(menuAction.username, menuAction.password).then(ok => {
          if (ok) {
            // After login, authenticate WS and go to world browser
            if (connState === "disconnected") conn.connect();
            else authClient.authenticateWs(conn);
            fetchWorldList().then(worlds => {
              ui.menus.showWorldBrowser(worlds, connState, authClient.kingdoms);
            });
          } else {
            ui.menus.showLoginScreen("login", "Invalid username or password");
          }
        });
      } else if (typeof menuAction === "object" && menuAction.type === "register") {
        authClient.register(menuAction.username, menuAction.password).then(ok => {
          if (ok) {
            if (connState === "disconnected") conn.connect();
            else authClient.authenticateWs(conn);
            fetchWorldList().then(worlds => {
              ui.menus.showWorldBrowser(worlds, connState, authClient.kingdoms);
            });
          } else {
            ui.menus.showLoginScreen("register", "Registration failed — username may be taken");
          }
        });
      } else if (typeof menuAction === "object" && menuAction.type === "reconnect-kingdom") {
        if (connState !== "connected") {
          conn.connect();
        }
        wc.reset();
        wc.reconnectWorld(menuAction.worldId, menuAction.playerId);
      } else if (typeof menuAction === "object" && menuAction.type === "join-world") {
        if (connState !== "connected") {
          conn.connect();
        }
        wc.reset();
        wc.joinWorld(menuAction.worldId, menuAction.ring, authClient.username || "Player");
      } else if (typeof menuAction === "object" && menuAction.type === "start-world") {
        if (connState !== "connected") {
          conn.connect();
        }
        wc.reset();
        wc.createWorld({ tickIntervalMs: menuAction.tickSpeed });
      }
    }

    if (!gameStarted) {
      input.consumeClicks();
      input.consumeRightClicks();
      input.consumeKeyPresses();
      input.consumeWheel();
      return;
    }

    // ─── World mode tick countdown (local frame-based) ────────────────
    if (mode === "world") {
      const now = performance.now();
      if (worldLastFrameTime > 0) {
        worldTickCountdown -= (now - worldLastFrameTime);
        if (worldTickCountdown < 0) worldTickCountdown = 0;
      }
      worldLastFrameTime = now;
    }

    // ─── City panel actions ─────────────────────────────────────────────
    const citySel = ui.cityPanel.consumeSelection();
    if (citySel) {
      audio.playUIClick();
      if (mode === "singleplayer") {
        collector.setProduction(citySel.cityId, citySel.unitType);
      } else {
        remoteSetProduction(citySel.cityId, citySel.unitType);
      }
    }

    // ─── Action panel button clicks ─────────────────────────────────────
    const panelAction = ui.actionPanel.consumeClick();
    if (panelAction) {
      audio.playUIClick();
      handlePanelAction(panelAction);
    }

    // ─── Process input events ───────────────────────────────────────────
    if (!ui.cityPanel.isOpen && !ui.menus.isVisible && !ui.economyReview.isOpen) {
      const keys = input.consumeKeyPresses();
      for (const key of keys) {
        handleKeyPress(key);
      }

      const clicks = input.consumeClicks();
      for (const click of clicks) {
        handleClick(click.x, click.y, click.shiftKey);
      }

      const rightClicks = input.consumeRightClicks();
      for (const rc of rightClicks) {
        if (selection.selectedUnitId !== null) {
          // Right-click with unit selected → set navigation target
          const tile = screenToTile(rc.x, rc.y, camera, vw, vh);
          const mapWidth = mode === "singleplayer" ? game.state.config.mapWidth
            : mode === "world" ? (wc.visibleState?.config.mapWidth ?? 100)
            : (mp.visibleState?.config.mapWidth ?? 100);
          const mapHeight = mode === "singleplayer" ? game.state.config.mapHeight
            : mode === "world" ? (wc.visibleState?.config.mapHeight ?? 60)
            : (mp.visibleState?.config.mapHeight ?? 60);
          if (tile.col >= 0 && tile.col < mapWidth && tile.row >= 0 && tile.row < mapHeight) {
            const targetLoc = tile.row * mapWidth + tile.col;
            if (mode === "singleplayer") {
              collector.setTarget(selection.selectedUnitId, targetLoc);
            } else {
              // For multiplayer, send setBehavior + target via protocol
              remoteSetBehavior(selection.selectedUnitId, UnitBehavior.GoTo);
            }
            audio.playUIClick();
            ui.turnFlow.markDone(selection.selectedUnitId);
            advanceToNextUnit();
          }
        } else {
          // No unit selected — deselect
          selection.selectedCityId = null;
          currentHighlights = [];
        }
      }
    } else {
      const keys = input.consumeKeyPresses();
      if (ui.cityPanel.isOpen) {
        for (const key of keys) {
          if (key === "escape") ui.cityPanel.close();
        }
      }
      // Economy review handles its own keydown via document listener (capture phase)
      input.consumeClicks();
      input.consumeRightClicks();
    }

    // ─── Update camera ──────────────────────────────────────────────────
    camera.update(input, vw, vh);
    camera.applyTo(worldContainer, vw, vh);

    // ─── Update hover tile ──────────────────────────────────────────────
    const mapWidth = mode === "singleplayer" ? game.state.config.mapWidth
      : mode === "world" ? (wc.visibleState?.config.mapWidth ?? 100)
      : (mp.visibleState?.config.mapWidth ?? 100);
    const mapHeight = mode === "singleplayer" ? game.state.config.mapHeight
      : mode === "world" ? (wc.visibleState?.config.mapHeight ?? 60)
      : (mp.visibleState?.config.mapHeight ?? 60);

    const hover = screenToTile(input.mouseX, input.mouseY, camera, vw, vh);
    if (hover.col >= 0 && hover.col < mapWidth && hover.row >= 0 && hover.row < mapHeight) {
      selection.hoveredTile = hover;
    } else {
      selection.hoveredTile = null;
    }

    // ─── Screen Shake ──────────────────────────────────────────────────
    shake.update(dt);

    // ─── Render ─────────────────────────────────────────────────────────
    const currentState = getCurrentRenderableState();
    if (currentState) {
      tilemap.update(currentState, camera, vw, vh, dt);
      highlightRenderer.update(currentHighlights, selection, currentState.mapWidth, dt);
      unitRenderer.update(currentState.units, selection, dt);
      particles.update(dt);

      // Apply screen shake offset to world container
      worldContainer.x += shake.offsetX;
      worldContainer.y += shake.offsetY;

      // ─── Map Overlays (vision ring, GoTo path) ───────────────────
      const uiState = buildUIState();
      mapOverlays.update(uiState.selectedUnit, dt);

      // ─── Update UI ──────────────────────────────────────────────────
      ui.hud.update(uiState);
      ui.minimap.update(currentState, camera, vw, vh);

      // For action panel, build a minimal state object
      const actionPanelState = mode === "singleplayer"
        ? game.state
        : mode === "world"
        ? stateForTurnFlow(wc.visibleState!) as any
        : stateForTurnFlow(mp.visibleState!) as any;
      ui.actionPanel.update(
        uiState.selectedUnit,
        selection.selectedCityId,
        actionPanelState,
        currentHighlights.length > 0,
        mode === "singleplayer" ? playerOwner : mode === "world" ? (wc.owner ?? Owner.Player1) : (mp.owner ?? Owner.Player1),
      );
      ui.unitInfo.update(
        uiState.selectedUnit,
        selection.selectedCityId,
        actionPanelState,
        currentState.mapWidth,
      );
    }
  });
}

init().catch(console.error);
