// Empire Reborn — Menu Screens (Main Menu, Lobby, Game Over)

import { Owner, GAME_VERSION, MAP_SIZE_PRESETS, TERRAIN_PRESETS } from "@empire/shared";
import type { MapSizePreset, TerrainPreset } from "@empire/shared";
import type { ConnectionState } from "../net/connection.js";
import type { LobbyGame } from "../net/multiplayer.js";

export interface GameSetupOptions {
  mapSize: MapSizePreset;
  terrain: TerrainPreset;
}

export type MenuAction =
  | "new-game"
  | "multiplayer"
  | "create-online"
  | "back-to-main"
  | { type: "start-game"; options: GameSetupOptions }
  | { type: "start-online"; options: GameSetupOptions }
  | { type: "join-game"; gameId: string }
  | null;

export interface MenuScreens {
  readonly element: HTMLDivElement;
  /** Show the main menu. */
  showMainMenu(): void;
  /** Show game setup screen (map size + terrain). */
  showGameSetup(mode: "singleplayer" | "multiplayer"): void;
  /** Show the multiplayer lobby. */
  showLobby(games: LobbyGame[], connState: ConnectionState): void;
  /** Show a "Waiting for opponent" screen. */
  showWaiting(gameId: string): void;
  /** Show the game over screen. */
  showGameOver(winner: Owner, playerOwner: Owner, turn: number, cities: number, units: number): void;
  /** Hide all menus. */
  hide(): void;
  /** Consume a menu action (button click). */
  consumeAction(): MenuAction;
  /** Update connection status indicator. */
  updateConnectionStatus(state: ConnectionState): void;
  readonly isVisible: boolean;
}

export function createMenuScreens(): MenuScreens {
  const element = document.createElement("div");
  element.id = "menu-screen";

  let pendingAction: MenuAction = null;
  let isVisible = true;
  let selectedMapSize = 1; // index into MAP_SIZE_PRESETS (Standard)
  let selectedTerrain = 0; // index into TERRAIN_PRESETS (Continents)
  let setupMode: "singleplayer" | "multiplayer" = "singleplayer";

  element.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("[data-menu]") as HTMLElement | null;
    if (target) {
      const action = target.dataset.menu!;
      if (action.startsWith("join:")) {
        pendingAction = { type: "join-game", gameId: action.slice(5) };
      } else if (action.startsWith("mapsize:")) {
        selectedMapSize = parseInt(action.slice(8));
        showGameSetupInner();
      } else if (action.startsWith("terrain:")) {
        selectedTerrain = parseInt(action.slice(8));
        showGameSetupInner();
      } else if (action === "start-game") {
        const options: GameSetupOptions = {
          mapSize: MAP_SIZE_PRESETS[selectedMapSize],
          terrain: TERRAIN_PRESETS[selectedTerrain],
        };
        if (setupMode === "singleplayer") {
          pendingAction = { type: "start-game", options };
        } else {
          pendingAction = { type: "start-online", options };
        }
      } else {
        pendingAction = action as MenuAction;
      }
    }
  });

  function showGameSetupInner(): void {
    const mapSizeHtml = MAP_SIZE_PRESETS.map((p, i) => `
      <button class="setup-option ${i === selectedMapSize ? "selected" : ""}" data-menu="mapsize:${i}">
        <span class="option-name">${p.name}</span>
        <span class="option-detail">${p.width}x${p.height}</span>
        <span class="option-desc">${p.description}</span>
      </button>
    `).join("");

    const terrainHtml = TERRAIN_PRESETS.map((p, i) => `
      <button class="setup-option ${i === selectedTerrain ? "selected" : ""}" data-menu="terrain:${i}">
        <span class="option-name">${p.name}</span>
        <span class="option-desc">${p.description}</span>
      </button>
    `).join("");

    const title = setupMode === "singleplayer" ? "SINGLE PLAYER" : "CREATE GAME";

    element.innerHTML = `
      <h2>${title}</h2>
      <div class="setup-section">
        <div class="setup-label">Map Size</div>
        <div class="setup-grid">${mapSizeHtml}</div>
      </div>
      <div class="setup-section">
        <div class="setup-label">Terrain</div>
        <div class="setup-grid">${terrainHtml}</div>
      </div>
      <button class="menu-btn" data-menu="start-game">Start Game</button>
      <button class="menu-btn-secondary" data-menu="back-to-main">Back</button>
    `;
  }

  return {
    element,
    get isVisible() { return isVisible; },

    showMainMenu(): void {
      isVisible = true;
      element.classList.remove("hidden");
      element.innerHTML = `
        <h1>EMPIRE REBORN</h1>
        <div class="subtitle">A 4X Strategy Game &mdash; v${GAME_VERSION}</div>
        <button class="menu-btn" data-menu="new-game">Single Player</button>
        <button class="menu-btn" data-menu="multiplayer">Multiplayer</button>
      `;
    },

    showGameSetup(mode: "singleplayer" | "multiplayer"): void {
      isVisible = true;
      element.classList.remove("hidden");
      setupMode = mode;
      selectedMapSize = 1; // reset to Standard
      selectedTerrain = 0; // reset to Continents
      showGameSetupInner();
    },

    showLobby(games: LobbyGame[], connState: ConnectionState): void {
      isVisible = true;
      element.classList.remove("hidden");

      const connLabel = connState === "connected" ? "Connected"
        : connState === "connecting" ? "Connecting..."
        : "Disconnected";
      const connClass = connState === "connected" ? "conn-ok"
        : connState === "connecting" ? "conn-warn"
        : "conn-err";

      const lobbyGames = games.filter((g) => g.phase === "lobby" && g.players < 2);
      const activeGames = games.filter((g) => g.phase === "playing");

      let gamesHtml = "";
      if (lobbyGames.length > 0) {
        gamesHtml += `<div class="lobby-section"><h3>Open Games</h3>`;
        for (const g of lobbyGames) {
          gamesHtml += `
            <div class="lobby-game">
              <span class="game-id">${g.id}</span>
              <span class="game-info">${g.players}/2 players</span>
              <button class="lobby-btn" data-menu="join:${g.id}">Join</button>
            </div>`;
        }
        gamesHtml += `</div>`;
      }

      if (activeGames.length > 0) {
        gamesHtml += `<div class="lobby-section"><h3>Active Games</h3>`;
        for (const g of activeGames) {
          gamesHtml += `
            <div class="lobby-game">
              <span class="game-id">${g.id}</span>
              <span class="game-info">Turn ${g.turn} &bull; ${g.players}/2 online</span>
              <button class="lobby-btn" data-menu="join:${g.id}">Rejoin</button>
            </div>`;
        }
        gamesHtml += `</div>`;
      }

      if (lobbyGames.length === 0 && activeGames.length === 0) {
        gamesHtml = `<div class="lobby-empty">No games available. Create one!</div>`;
      }

      element.innerHTML = `
        <h2>MULTIPLAYER LOBBY</h2>
        <div class="conn-status ${connClass}">${connLabel}</div>
        <button class="menu-btn" data-menu="create-online">Create Game</button>
        <div class="lobby-list">${gamesHtml}</div>
        <button class="menu-btn-secondary" data-menu="back-to-main">Back</button>
      `;
    },

    showWaiting(gameId: string): void {
      isVisible = true;
      element.classList.remove("hidden");
      element.innerHTML = `
        <h2>WAITING FOR OPPONENT</h2>
        <div class="subtitle">Game ID: <strong>${gameId}</strong></div>
        <div class="subtitle">Share this ID with a friend to join</div>
        <div class="waiting-spinner"></div>
        <button class="menu-btn-secondary" data-menu="back-to-main">Cancel</button>
      `;
    },

    showGameOver(winner: Owner, playerOwner: Owner, turn: number, cities: number, units: number): void {
      isVisible = true;
      element.classList.remove("hidden");
      const isVictory = winner === playerOwner;
      element.innerHTML = `
        <div class="result-text ${isVictory ? "victory" : "defeat"}">
          ${isVictory ? "VICTORY" : "DEFEAT"}
        </div>
        <div class="stats">
          Turn ${turn}<br>
          Cities: ${cities} | Units: ${units}
        </div>
        <button class="menu-btn" data-menu="new-game">New Game</button>
        <button class="menu-btn-secondary" data-menu="back-to-main">Main Menu</button>
      `;
    },

    hide(): void {
      isVisible = false;
      element.classList.add("hidden");
    },

    consumeAction(): MenuAction {
      const action = pendingAction;
      pendingAction = null;
      return action;
    },

    updateConnectionStatus(state: ConnectionState): void {
      const el = element.querySelector(".conn-status");
      if (!el) return;
      el.className = `conn-status ${
        state === "connected" ? "conn-ok" : state === "connecting" ? "conn-warn" : "conn-err"
      }`;
      el.textContent = state === "connected" ? "Connected"
        : state === "connecting" ? "Connecting..."
        : "Disconnected";
    },
  };
}
