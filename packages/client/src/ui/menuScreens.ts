// Empire Reborn — Menu Screens (Main Menu, Lobby, Game Over)

import { Owner, GAME_VERSION, MAP_SIZE_PRESETS, TERRAIN_PRESETS } from "@empire/shared";
import type { MapSizePreset, TerrainPreset, WorldSummary, AuthKingdomInfo } from "@empire/shared";
import type { ConnectionState } from "../net/connection.js";
import type { LobbyGame } from "../net/multiplayer.js";

export interface GameSetupOptions {
  mapSize: MapSizePreset;
  terrain: TerrainPreset;
}

export type MenuAction =
  | "new-game"
  | "multiplayer"
  | "world-browser"
  | "create-online"
  | "create-world"
  | "back-to-main"
  | "show-login"
  | "show-register"
  | "logout"
  | { type: "start-game"; options: GameSetupOptions }
  | { type: "start-online"; options: GameSetupOptions }
  | { type: "join-game"; gameId: string }
  | { type: "join-world"; worldId: string; ring: number }
  | { type: "reconnect-kingdom"; worldId: string; playerId: number }
  | { type: "start-world"; tickSpeed: number }
  | { type: "login"; username: string; password: string }
  | { type: "register"; username: string; password: string }
  | null;

export interface MenuScreens {
  readonly element: HTMLDivElement;
  /** Show the main menu. */
  showMainMenu(): void;
  /** Show game setup screen (map size + terrain). */
  showGameSetup(mode: "singleplayer" | "multiplayer"): void;
  /** Show the multiplayer lobby. */
  showLobby(games: LobbyGame[], connState: ConnectionState): void;
  /** Show the world browser. */
  showWorldBrowser(worlds: WorldSummary[], connState: ConnectionState, kingdoms?: AuthKingdomInfo[]): void;
  /** Show world creation setup screen. */
  showWorldSetup(): void;
  /** Show login/register screen. */
  showLoginScreen(mode: "login" | "register", error?: string): void;
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
  /** Set the currently logged-in username (null = not logged in). */
  setLoggedInUser(username: string | null): void;
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
  let loggedInUser: string | null = null;

  // Handle Enter key in login/register forms
  element.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const submitBtn = element.querySelector("[data-menu='do-login'], [data-menu='do-register']") as HTMLElement | null;
      if (submitBtn) submitBtn.click();
    }
  });

  element.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest("[data-menu]") as HTMLElement | null;
    if (target) {
      const action = target.dataset.menu!;
      if (action.startsWith("join:")) {
        pendingAction = { type: "join-game", gameId: action.slice(5) };
      } else if (action.startsWith("joinworld:")) {
        const parts = action.split(":");
        pendingAction = { type: "join-world", worldId: parts[1], ring: parseInt(parts[2]) };
      } else if (action.startsWith("reconnect:")) {
        const parts = action.split(":");
        pendingAction = { type: "reconnect-kingdom", worldId: parts[1], playerId: parseInt(parts[2]) };
      } else if (action.startsWith("startworld:")) {
        const tickSpeed = parseInt(action.slice(11));
        pendingAction = { type: "start-world", tickSpeed };
      } else if (action.startsWith("mapsize:")) {
        selectedMapSize = parseInt(action.slice(8));
        showGameSetupInner();
      } else if (action.startsWith("terrain:")) {
        selectedTerrain = parseInt(action.slice(8));
        showGameSetupInner();
      } else if (action === "do-login" || action === "do-register") {
        const form = element.querySelector(".auth-form") as HTMLFormElement | null;
        if (form) {
          const username = (form.querySelector("[name=username]") as HTMLInputElement)?.value ?? "";
          const password = (form.querySelector("[name=password]") as HTMLInputElement)?.value ?? "";
          if (username && password) {
            pendingAction = action === "do-login"
              ? { type: "login", username, password }
              : { type: "register", username, password };
          }
        }
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
      const userHtml = loggedInUser
        ? `<div class="auth-status">Logged in as <strong>${loggedInUser}</strong> <button class="auth-link" data-menu="logout">Logout</button></div>`
        : "";
      element.innerHTML = `
        <h1>EMPIRE REBORN</h1>
        <div class="subtitle">A 4X Strategy Game &mdash; v${GAME_VERSION}</div>
        ${userHtml}
        <button class="menu-btn" data-menu="new-game">Single Player</button>
        <button class="menu-btn" data-menu="multiplayer">Multiplayer</button>
        <button class="menu-btn" data-menu="${loggedInUser ? "world-browser" : "show-login"}">Kingdom World</button>
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

    showWorldBrowser(worlds: WorldSummary[], connState: ConnectionState, kingdoms?: AuthKingdomInfo[]): void {
      isVisible = true;
      element.classList.remove("hidden");

      const connLabel = connState === "connected" ? "Connected"
        : connState === "connecting" ? "Connecting..."
        : "Disconnected";
      const connClass = connState === "connected" ? "conn-ok"
        : connState === "connecting" ? "conn-warn"
        : "conn-err";

      // Show existing kingdoms for reconnection
      let kingdomsHtml = "";
      if (kingdoms && kingdoms.length > 0) {
        kingdomsHtml = `<div class="kingdoms-list"><h3>Your Kingdoms</h3>`;
        for (const k of kingdoms) {
          kingdomsHtml += `
            <div class="kingdom-entry">
              <span>${k.kingdomName} (${k.worldId})</span>
              <button class="lobby-btn" data-menu="reconnect:${k.worldId}:${k.playerId}">Reconnect</button>
            </div>`;
        }
        kingdomsHtml += `</div>`;
      }

      let worldsHtml = "";
      if (worlds.length > 0) {
        worldsHtml = `<div class="lobby-section"><h3>Active Worlds</h3>`;
        for (const w of worlds) {
          const tickLabel = w.tickIntervalMs <= 60000 ? "Fast (1min)"
            : w.tickIntervalMs <= 300000 ? "Standard (5min)"
            : w.tickIntervalMs <= 900000 ? "Slow (15min)"
            : "Epic (1hr)";
          const daysLeft = Math.ceil(w.seasonRemainingS / 86400);
          worldsHtml += `
            <div class="lobby-game">
              <span class="game-id">${w.id}</span>
              <span class="game-info">Turn ${w.turn} | ${w.humanPlayers}/${w.totalKingdoms} players | ${tickLabel} | ${daysLeft}d left</span>
              <button class="lobby-btn" data-menu="joinworld:${w.id}:1">Join (Inner)</button>
              <button class="lobby-btn" data-menu="joinworld:${w.id}:2">Join (Outer)</button>
            </div>`;
        }
        worldsHtml += `</div>`;
      } else {
        worldsHtml = `<div class="lobby-empty">No active worlds. Create one!</div>`;
      }

      const userHtml = loggedInUser
        ? `<div class="auth-status">Logged in as <strong>${loggedInUser}</strong></div>`
        : "";

      element.innerHTML = `
        <h2>KINGDOM WORLD</h2>
        <div class="conn-status ${connClass}">${connLabel}</div>
        ${userHtml}
        <div class="subtitle">Persistent tick-based kingdoms with AI takeover</div>
        ${kingdomsHtml}
        <button class="menu-btn" data-menu="create-world">Create World</button>
        <div class="lobby-list">${worldsHtml}</div>
        <button class="menu-btn-secondary" data-menu="back-to-main">Back</button>
      `;
    },

    showWorldSetup(): void {
      isVisible = true;
      element.classList.remove("hidden");

      element.innerHTML = `
        <h2>CREATE WORLD</h2>
        <div class="setup-section">
          <div class="setup-label">Tick Speed</div>
          <div class="setup-grid">
            <button class="setup-option" data-menu="startworld:60000">
              <span class="option-name">Fast</span>
              <span class="option-desc">1 tick per minute</span>
            </button>
            <button class="setup-option selected" data-menu="startworld:300000">
              <span class="option-name">Standard</span>
              <span class="option-desc">1 tick per 5 minutes</span>
            </button>
            <button class="setup-option" data-menu="startworld:900000">
              <span class="option-name">Slow</span>
              <span class="option-desc">1 tick per 15 minutes</span>
            </button>
            <button class="setup-option" data-menu="startworld:3600000">
              <span class="option-name">Epic</span>
              <span class="option-desc">1 tick per hour</span>
            </button>
          </div>
        </div>
        <button class="menu-btn-secondary" data-menu="world-browser">Back</button>
      `;
    },

    showLoginScreen(mode: "login" | "register", error?: string): void {
      isVisible = true;
      element.classList.remove("hidden");

      const isLogin = mode === "login";
      const title = isLogin ? "LOG IN" : "CREATE ACCOUNT";
      const submitAction = isLogin ? "do-login" : "do-register";
      const submitLabel = isLogin ? "Log In" : "Register";
      const switchAction = isLogin ? "show-register" : "show-login";
      const switchLabel = isLogin ? "Need an account? Register" : "Already have an account? Log In";
      const errorHtml = error ? `<div class="auth-error">${error}</div>` : "";

      element.innerHTML = `
        <h2>${title}</h2>
        <div class="subtitle">Required for Kingdom World mode</div>
        ${errorHtml}
        <div class="auth-form">
          <input type="text" name="username" placeholder="Username" autocomplete="username" maxlength="24" />
          <input type="password" name="password" placeholder="Password" autocomplete="${isLogin ? "current-password" : "new-password"}" />
          <button class="menu-btn" data-menu="${submitAction}">${submitLabel}</button>
        </div>
        <button class="menu-btn-secondary" data-menu="${switchAction}">${switchLabel}</button>
        <button class="menu-btn-secondary" data-menu="back-to-main">Back</button>
      `;

      // Focus username field
      const usernameInput = element.querySelector("[name=username]") as HTMLInputElement | null;
      if (usernameInput) setTimeout(() => usernameInput.focus(), 50);
    },

    setLoggedInUser(username: string | null): void {
      loggedInUser = username;
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
