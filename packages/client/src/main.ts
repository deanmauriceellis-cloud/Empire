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
  objMoves,
} from "@empire/shared";
import type { SinglePlayerGame, TurnEvent, VisibleGameState } from "@empire/shared";
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
import { screenToTile } from "./iso/coords.js";
import { createActionCollector, type ActionCollector } from "./game/actionCollector.js";
import { computeHighlights, getClickAction } from "./game/moveCalc.js";
import { createUIManager } from "./ui/UIManager.js";
import { createConnection, getWebSocketUrl, type ConnectionState } from "./net/connection.js";
import { createMultiplayerGame, fetchLobbyGames, type MultiplayerGame } from "./net/multiplayer.js";
import { createAudioManager, type AudioManager } from "./audio/AudioManager.js";
import type { SelectionState, UIState, TileHighlight, RenderableState } from "./types.js";

// ─── Game Mode ───────────────────────────────────────────────────────────────

type GameMode = "none" | "singleplayer" | "multiplayer";

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

  // ─── Camera (single instance, reused across games) ──────────────────
  const camera = createCamera(100, 60);

  // ─── Renderers ────────────────────────────────────────────────────────
  const tilemap = new TilemapRenderer(worldContainer, assets);
  const unitRenderer = new UnitRenderer(worldContainer, assets);
  const particles = new ParticleSystem(effectsContainer);
  const highlightRenderer = new HighlightRenderer(worldContainer, assets);

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

  // ─── Multiplayer Connection ─────────────────────────────────────────────
  let connState: ConnectionState = "disconnected";

  // In dev mode (Vite on port 5173), connect to server on port 3001
  const wsUrl = location.port === "5173"
    ? `ws://${location.hostname}:3001/ws`
    : getWebSocketUrl();

  const conn = createConnection(wsUrl, {
    onStateChange(state) {
      connState = state;
      ui.menus.updateConnectionStatus(state);
      if (state === "connected" && mode === "none") {
        // Refresh lobby on connect
        refreshLobby();
      }
    },
    onMessage(msg) {
      mp.handleMessage(msg);
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

  // ─── Lobby ──────────────────────────────────────────────────────────────

  async function refreshLobby(): Promise<void> {
    const serverUrl = location.port === "5173"
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
      if (!unit || unit.owner !== Owner.Player1) {
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
      // For multiplayer, compute highlights from visible state
      // We can only show adjacent tiles — server validates moves
      currentHighlights = computeMultiplayerHighlights(unit);
    }
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

  function startSinglePlayer(): void {
    mode = "singleplayer";
    game = createSinglePlayerGame();
    collector = createActionCollector(game);

    const playerCity = game.state.cities.find((c) => c.owner === Owner.Player1);
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
    ui.menus.hide();
    gameStarted = true;
    audio.playGameStart();
    audio.startAmbient();
    console.log(`Empire Reborn v${GAME_VERSION} — Single player started`);
  }

  // ─── Start Multiplayer Game ─────────────────────────────────────────────

  function startMultiplayerGame(): void {
    mode = "multiplayer";
    if (mp.owner !== null) {
      ui.turnFlow.setOwner(mp.owner);
    }
    resetSelection();
    ui.eventLog.clear();
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
    }
    // Fallback (menu)
    return {
      turn: 0, owner: Owner.Player1,
      playerCityCount: 0, playerUnitCount: 0, enemyCityCount: 0,
      selectedUnit: null, selectedCity: null,
      pendingActionCount: 0, events: [], isGameOver: false, winner: null,
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

    return {
      turn: state.turn,
      owner: Owner.Player1,
      playerCityCount: state.cities.filter((c) => c.owner === Owner.Player1).length,
      playerUnitCount: state.units.filter((u) => u.owner === Owner.Player1).length,
      enemyCityCount: state.cities.filter((c) => c.owner === Owner.Player2).length,
      selectedUnit,
      selectedCity,
      pendingActionCount: collector.actions.length,
      events: [...collector.turnEvents],
      isGameOver: game.isGameOver,
      winner: game.winner,
    };
  }

  function buildMultiplayerUIState(): UIState {
    const vs = mp.visibleState;
    if (!vs || mp.owner === null) {
      return {
        turn: 0, owner: Owner.Player1,
        playerCityCount: 0, playerUnitCount: 0, enemyCityCount: 0,
        selectedUnit: null, selectedCity: null,
        pendingActionCount: 0, events: [], isGameOver: false, winner: null,
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

    return {
      turn: vs.turn,
      owner: playerOwner,
      playerCityCount: vs.cities.filter((c) => c.owner === playerOwner).length,
      playerUnitCount: vs.units.filter((u) => u.owner === playerOwner).length,
      enemyCityCount: vs.cities.filter((c) => c.owner !== playerOwner && c.owner !== Owner.Unowned).length,
      selectedUnit,
      selectedCity: selectedCity as any, // CityState shape subset
      pendingActionCount: 0,
      events: [...mp.turnEvents],
      isGameOver: mp.isGameOver,
      winner: mp.winner,
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
    const mapWidth = mode === "singleplayer" ? game.state.config.mapWidth : (mp.visibleState?.config.mapWidth ?? 100);
    const mapHeight = mode === "singleplayer" ? game.state.config.mapHeight : (mp.visibleState?.config.mapHeight ?? 60);

    if (tile.col < 0 || tile.col >= mapWidth || tile.row < 0 || tile.row >= mapHeight) return;

    const loc = tile.row * mapWidth + tile.col;

    // ─── Click on highlighted tile → move/attack ────────────────────
    if (selection.selectedUnitId !== null && currentHighlights.length > 0) {
      if (mode === "singleplayer") {
        handleSinglePlayerClickAction(loc);
      } else if (mode === "multiplayer") {
        handleMultiplayerClickAction(loc);
      }
      return;
    }

    // ─── Click on own unit → select ─────────────────────────────────
    const playerOwner = mode === "singleplayer" ? Owner.Player1 : mp.owner;
    const units = mode === "singleplayer" ? game.state.units : (mp.visibleState?.units ?? []);
    const playerUnit = units.find(
      (u) => u.loc === loc && u.owner === playerOwner && u.shipId === null,
    );

    if (playerUnit) {
      selection.selectedUnitId = playerUnit.id;
      selection.selectedCityId = null;
      audio.playSelect();
      refreshHighlights();
      return;
    }

    // ─── Click on own city → select ─────────────────────────────────
    const cities = mode === "singleplayer"
      ? game.state.cities
      : (mp.visibleState?.cities ?? []);
    const city = cities.find((c) => c.loc === loc && c.owner === playerOwner);

    if (city) {
      selection.selectedCityId = city.id;
      selection.selectedUnitId = null;
      currentHighlights = [];

      if (shiftKey) {
        ui.cityPanel.open(city as any);
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
      success = collector.moveUnit(unitId, directionFromLocs(
        game.state.units.find((u) => u.id === unitId)!.loc, loc,
      ));
      if (success) {
        const u = game.state.units.find((u) => u.id === unitId);
        if (u) audio.playMove(u.type);
      }
    } else {
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

  function emitParticleForEvent(event: TurnEvent): void {
    if (event.type === "combat") {
      particles.emitExplosion(event.loc);
      audio.playExplosion();
      shake.trigger(0.6);
    } else if (event.type === "capture") {
      const owner = mode === "singleplayer" ? Owner.Player1 : (mp.owner ?? Owner.Player1);
      particles.emitCapture(event.loc, owner);
      audio.playCapture();
      shake.trigger(0.3);
    } else if (event.type === "death") {
      const owner = event.data?.owner as number ?? Owner.Player2;
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

  // ─── End Turn ─────────────────────────────────────────────────────────

  function handleEndTurn(): void {
    audio.playTurnEnd();
    if (mode === "singleplayer") {
      handleSinglePlayerEndTurn();
    } else if (mode === "multiplayer") {
      mp.endTurn();
      // Server will send state_update when both players have ended
    }
  }

  function handleSinglePlayerEndTurn(): void {
    const result = collector.endTurn();
    ui.eventLog.addEvents(result.events);

    for (const event of result.events) {
      emitParticleForEvent(event);
    }

    if (game.isGameOver) {
      const uiState = buildUIState();
      audio.stopAmbient();
      audio.playGameOver(game.winner === Owner.Player1);
      ui.menus.showGameOver(
        game.winner!,
        Owner.Player1,
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

  // ─── Handle Key Presses ───────────────────────────────────────────────

  function handleKeyPress(key: string): void {
    if (key === "escape") {
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

    const playerOwner = mode === "singleplayer" ? Owner.Player1 : mp.owner;

    switch (key) {
      case " ":
        if (selection.selectedUnitId) {
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
        if (selection.selectedUnitId) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Sentry);
          } else {
            mp.setBehavior(selection.selectedUnitId, UnitBehavior.Sentry);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;

      case "f":
        if (selection.selectedUnitId) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Explore);
          } else {
            mp.setBehavior(selection.selectedUnitId, UnitBehavior.Explore);
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
          if (city && city.owner === playerOwner) {
            ui.cityPanel.open(city as any);
          }
        }
        break;

      case "t":
        if (selection.selectedUnitId) {
          const units = mode === "singleplayer" ? game.state.units : (mp.visibleState?.units ?? []);
          const unit = units.find((u) => u.id === selection.selectedUnitId);
          if (unit && unit.type === UnitType.Army) {
            if (mode === "singleplayer") {
              collector.setBehavior(selection.selectedUnitId, UnitBehavior.WaitForTransport);
            } else {
              mp.setBehavior(selection.selectedUnitId, UnitBehavior.WaitForTransport);
            }
            ui.turnFlow.markDone(selection.selectedUnitId);
            advanceToNextUnit();
          }
        }
        break;

      case "u":
        if (selection.selectedUnitId) {
          const units = mode === "singleplayer" ? game.state.units : (mp.visibleState?.units ?? []);
          const unit = units.find((u) => u.id === selection.selectedUnitId);
          if (unit && unit.shipId !== null) {
            if (mode === "singleplayer") {
              collector.setBehavior(selection.selectedUnitId, UnitBehavior.Land);
            } else {
              mp.setBehavior(selection.selectedUnitId, UnitBehavior.Land);
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
        if (selection.selectedUnitId) {
          ui.turnFlow.skipUnit();
          advanceToNextUnit();
        }
        break;
      case "sentry":
        if (selection.selectedUnitId) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Sentry);
          } else {
            mp.setBehavior(selection.selectedUnitId, UnitBehavior.Sentry);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "explore":
        if (selection.selectedUnitId) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Explore);
          } else {
            mp.setBehavior(selection.selectedUnitId, UnitBehavior.Explore);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "wait-transport":
        if (selection.selectedUnitId) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.WaitForTransport);
          } else {
            mp.setBehavior(selection.selectedUnitId, UnitBehavior.WaitForTransport);
          }
          ui.turnFlow.markDone(selection.selectedUnitId);
          advanceToNextUnit();
        }
        break;
      case "disembark":
        if (selection.selectedUnitId) {
          if (mode === "singleplayer") {
            collector.setBehavior(selection.selectedUnitId, UnitBehavior.Land);
          } else {
            mp.setBehavior(selection.selectedUnitId, UnitBehavior.Land);
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
          const playerOwner = mode === "singleplayer" ? Owner.Player1 : mp.owner;
          if (city && city.owner === playerOwner) {
            ui.cityPanel.open(city as any);
          }
        }
        break;
      case "next-unit":
        advanceToNextUnit();
        break;
      case "end-turn":
        handleEndTurn();
        break;
    }
  }

  // ─── Get Current Renderable State ──────────────────────────────────────

  function getCurrentRenderableState(): RenderableState | null {
    if (mode === "singleplayer") {
      return buildRenderableState(game);
    } else if (mode === "multiplayer") {
      return mp.buildRenderableState();
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
        startSinglePlayer();
      } else if (menuAction === "multiplayer") {
        // Connect and show lobby
        if (connState === "disconnected") {
          conn.connect();
        }
        refreshLobby();
      } else if (menuAction === "create-online") {
        if (connState !== "connected") {
          conn.connect();
        }
        mp.reset();
        mp.createGame();
      } else if (menuAction === "back-to-main") {
        mp.reset();
        conn.disconnect();
        audio.stopAmbient();
        mode = "none";
        gameStarted = false;
        ui.menus.showMainMenu();
      } else if (typeof menuAction === "object" && menuAction.type === "join-game") {
        if (connState !== "connected") {
          conn.connect();
        }
        mp.reset();
        mp.joinGame(menuAction.gameId);
      }
    }

    if (!gameStarted) {
      input.consumeClicks();
      input.consumeRightClicks();
      input.consumeKeyPresses();
      input.consumeWheel();
      return;
    }

    // ─── City panel actions ─────────────────────────────────────────────
    const citySel = ui.cityPanel.consumeSelection();
    if (citySel) {
      audio.playUIClick();
      if (mode === "singleplayer") {
        collector.setProduction(citySel.cityId, citySel.unitType);
      } else {
        mp.setProduction(citySel.cityId, citySel.unitType);
      }
    }

    // ─── Action panel button clicks ─────────────────────────────────────
    const panelAction = ui.actionPanel.consumeClick();
    if (panelAction) {
      audio.playUIClick();
      handlePanelAction(panelAction);
    }

    // ─── Process input events ───────────────────────────────────────────
    if (!ui.cityPanel.isOpen && !ui.menus.isVisible) {
      const keys = input.consumeKeyPresses();
      for (const key of keys) {
        handleKeyPress(key);
      }

      const clicks = input.consumeClicks();
      for (const click of clicks) {
        handleClick(click.x, click.y, click.shiftKey);
      }

      const rightClicks = input.consumeRightClicks();
      if (rightClicks.length > 0) {
        selection.selectedUnitId = null;
        selection.selectedCityId = null;
        currentHighlights = [];
      }
    } else {
      const keys = input.consumeKeyPresses();
      if (ui.cityPanel.isOpen) {
        for (const key of keys) {
          if (key === "escape") ui.cityPanel.close();
        }
      }
      input.consumeClicks();
      input.consumeRightClicks();
    }

    // ─── Update camera ──────────────────────────────────────────────────
    camera.update(input, vw, vh);
    camera.applyTo(worldContainer, vw, vh);

    // ─── Update hover tile ──────────────────────────────────────────────
    const mapWidth = mode === "singleplayer" ? game.state.config.mapWidth : (mp.visibleState?.config.mapWidth ?? 100);
    const mapHeight = mode === "singleplayer" ? game.state.config.mapHeight : (mp.visibleState?.config.mapHeight ?? 60);

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

      // ─── Update UI ──────────────────────────────────────────────────
      const uiState = buildUIState();
      ui.hud.update(uiState);
      ui.minimap.update(currentState, camera, vw, vh);

      // For action panel, build a minimal state object
      const actionPanelState = mode === "singleplayer"
        ? game.state
        : stateForTurnFlow(mp.visibleState!) as any;
      ui.actionPanel.update(
        uiState.selectedUnit,
        selection.selectedCityId,
        actionPanelState,
        currentHighlights.length > 0,
      );
    }
  });
}

init().catch(console.error);
