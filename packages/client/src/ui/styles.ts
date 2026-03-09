// Empire Reborn — UI Styles (injected as <style> tag)

export function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
/* ─── Root Overlay ──────────────────────────────────────────────────────── */

#empire-ui {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #ccc;
  user-select: none;
}

#empire-ui * {
  box-sizing: border-box;
}

/* ─── Top Bar ───────────────────────────────────────────────────────────── */

#hud-top {
  pointer-events: auto;
  position: absolute;
  top: 0;
  left: 0;
  right: 200px;
  padding: 8px 12px;
  background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 80%, transparent 100%);
  display: flex;
  gap: 24px;
  align-items: center;
  font-size: 13px;
}

#hud-top .stat {
  color: #8af;
}

#hud-top .stat-label {
  color: #777;
  margin-right: 4px;
}

/* ─── Bottom Bar ────────────────────────────────────────────────────────── */

#hud-bottom {
  pointer-events: auto;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 200px;
  padding: 8px 12px;
  background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 80%, transparent 100%);
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 16px;
}

#hud-bottom .unit-info {
  display: flex;
  gap: 12px;
  align-items: center;
}

#hud-bottom .unit-name {
  color: #4af;
  font-weight: bold;
  text-transform: capitalize;
}

#hud-bottom .city-name {
  color: #fa4;
  font-weight: bold;
}

#hud-bottom .info-sep {
  color: #444;
}

/* ─── Right Sidebar ─────────────────────────────────────────────────────── */

#sidebar-right {
  pointer-events: auto;
  position: absolute;
  top: 0;
  right: 0;
  width: 200px;
  height: 100%;
  background: rgba(0,0,0,0.8);
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Minimap ───────────────────────────────────────────────────────────── */

#minimap-wrapper {
  padding: 8px;
  border-bottom: 1px solid #333;
}

#minimap-wrapper canvas {
  width: 100%;
  image-rendering: pixelated;
  cursor: pointer;
}

/* ─── Action Panel ──────────────────────────────────────────────────────── */

#action-panel {
  padding: 8px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

#action-panel .section-label {
  color: #666;
  font-size: 11px;
  text-transform: uppercase;
  margin-top: 4px;
  margin-bottom: 2px;
}

.action-btn {
  pointer-events: auto;
  background: rgba(68,136,255,0.15);
  border: 1px solid #335;
  color: #8af;
  padding: 4px 8px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  text-align: left;
  display: flex;
  justify-content: space-between;
  transition: background 0.1s;
}

.action-btn:hover {
  background: rgba(68,136,255,0.3);
  border-color: #48f;
}

.action-btn:active {
  background: rgba(68,136,255,0.5);
}

.action-btn.disabled {
  opacity: 0.35;
  pointer-events: none;
}

.action-btn .hotkey {
  color: #fa4;
  font-size: 11px;
}

.action-btn.end-turn {
  background: rgba(255,170,68,0.2);
  border-color: #553;
  color: #fa4;
  margin-top: 8px;
}

.action-btn.end-turn:hover {
  background: rgba(255,170,68,0.4);
  border-color: #fa4;
}

/* ─── Turn Flow Buttons ─────────────────────────────────────────────────── */

#turn-buttons {
  padding: 8px;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ─── Event Log ─────────────────────────────────────────────────────────── */

#event-log {
  pointer-events: auto;
  position: absolute;
  bottom: 52px;
  left: 0;
  width: 320px;
  max-height: 180px;
  overflow-y: auto;
  padding: 6px 10px;
  background: rgba(0,0,0,0.7);
  border-right: 1px solid #333;
  border-top: 1px solid #333;
  font-size: 11px;
  line-height: 1.4;
}

#event-log:empty {
  display: none;
}

#event-log .event {
  padding: 2px 0;
  cursor: pointer;
}

#event-log .event:hover {
  color: #fff;
}

#event-log .event.combat { color: #f84; }
#event-log .event.capture { color: #fa4; }
#event-log .event.production { color: #4c4; }
#event-log .event.death { color: #888; }
#event-log .event.discovery { color: #4af; }

/* ─── City Panel (Modal) ────────────────────────────────────────────────── */

#city-panel {
  pointer-events: auto;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(10,10,30,0.95);
  border: 1px solid #48f;
  padding: 16px;
  min-width: 360px;
  display: none;
}

#city-panel.visible {
  display: block;
}

#city-panel h2 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #fa4;
  font-family: 'Courier New', monospace;
}

#city-panel .production-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

#city-panel .prod-btn {
  pointer-events: auto;
  background: rgba(68,136,255,0.1);
  border: 1px solid #335;
  color: #aaa;
  padding: 8px 6px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  text-align: center;
  transition: background 0.1s;
}

#city-panel .prod-btn:hover {
  background: rgba(68,136,255,0.25);
  border-color: #48f;
  color: #fff;
}

#city-panel .prod-btn.active {
  background: rgba(68,136,255,0.3);
  border-color: #48f;
  color: #4af;
}

#city-panel .prod-btn .prod-name {
  font-weight: bold;
  display: block;
  margin-bottom: 2px;
}

#city-panel .prod-btn .prod-stat {
  color: #777;
  font-size: 10px;
}

#city-panel .progress-bar {
  margin-top: 12px;
  height: 8px;
  background: #222;
  border: 1px solid #444;
  position: relative;
}

#city-panel .progress-bar .fill {
  height: 100%;
  background: #48f;
  transition: width 0.2s;
}

#city-panel .progress-info {
  margin-top: 4px;
  font-size: 11px;
  color: #888;
}

#city-panel .penalty-warning {
  color: #f84;
  font-size: 11px;
  margin-top: 8px;
  display: none;
}

#city-panel .close-btn {
  pointer-events: auto;
  position: absolute;
  top: 8px;
  right: 12px;
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
}

#city-panel .close-btn:hover {
  color: #fff;
}

/* ─── Menu Screens ──────────────────────────────────────────────────────── */

#menu-screen {
  pointer-events: auto;
  position: absolute;
  inset: 0;
  background: rgba(5,5,15,0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

#menu-screen.hidden {
  display: none;
}

#menu-screen h1 {
  font-family: 'Courier New', monospace;
  font-size: 36px;
  color: #4af;
  margin: 0 0 8px 0;
  letter-spacing: 4px;
}

#menu-screen .subtitle {
  color: #666;
  font-size: 14px;
  margin-bottom: 32px;
}

#menu-screen .menu-btn {
  pointer-events: auto;
  background: rgba(68,136,255,0.15);
  border: 1px solid #48f;
  color: #8af;
  padding: 12px 40px;
  margin: 6px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 16px;
  min-width: 200px;
  text-align: center;
  transition: background 0.15s;
}

#menu-screen .menu-btn:hover {
  background: rgba(68,136,255,0.35);
  color: #fff;
}

#menu-screen .result-text {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 16px;
}

#menu-screen .result-text.victory { color: #4f4; }
#menu-screen .result-text.defeat { color: #f44; }

#menu-screen .stats {
  color: #888;
  font-size: 13px;
  margin-bottom: 24px;
  text-align: center;
  line-height: 1.6;
}

#menu-screen h2 {
  font-family: 'Courier New', monospace;
  font-size: 24px;
  color: #4af;
  margin: 0 0 12px 0;
  letter-spacing: 2px;
}

#menu-screen .menu-btn-secondary {
  pointer-events: auto;
  background: transparent;
  border: 1px solid #555;
  color: #888;
  padding: 8px 24px;
  margin: 6px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  min-width: 160px;
  text-align: center;
  transition: all 0.15s;
}

#menu-screen .menu-btn-secondary:hover {
  border-color: #888;
  color: #ccc;
}

/* ─── Connection Status ──────────────────────────────────────────────────── */

#menu-screen .conn-status {
  font-size: 12px;
  margin-bottom: 16px;
  padding: 4px 12px;
  border-radius: 3px;
}

#menu-screen .conn-ok { color: #4c4; }
#menu-screen .conn-warn { color: #fa4; }
#menu-screen .conn-err { color: #f44; }

/* ─── Lobby ──────────────────────────────────────────────────────────────── */

#menu-screen .lobby-list {
  width: 400px;
  max-height: 300px;
  overflow-y: auto;
  margin: 16px 0;
}

#menu-screen .lobby-section {
  margin-bottom: 12px;
}

#menu-screen .lobby-section h3 {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  margin: 0 0 6px 0;
  font-family: 'Courier New', monospace;
}

#menu-screen .lobby-game {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid #333;
  margin-bottom: 4px;
}

#menu-screen .lobby-game .game-id {
  color: #4af;
  font-weight: bold;
  flex: 0 0 80px;
}

#menu-screen .lobby-game .game-info {
  color: #777;
  font-size: 11px;
  flex: 1;
}

#menu-screen .lobby-btn {
  pointer-events: auto;
  background: rgba(68,136,255,0.15);
  border: 1px solid #48f;
  color: #8af;
  padding: 4px 12px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  transition: background 0.15s;
}

#menu-screen .lobby-btn:hover {
  background: rgba(68,136,255,0.35);
  color: #fff;
}

#menu-screen .lobby-empty {
  color: #666;
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}

/* ─── Game Setup ────────────────────────────────────────────────────────── */

#menu-screen .setup-section {
  margin-bottom: 20px;
  width: 420px;
}

#menu-screen .setup-label {
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

#menu-screen .setup-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

#menu-screen .setup-option {
  pointer-events: auto;
  background: rgba(255,255,255,0.03);
  border: 1px solid #333;
  color: #aaa;
  padding: 10px 12px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  text-align: left;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

#menu-screen .setup-option:hover {
  background: rgba(68,136,255,0.1);
  border-color: #48f;
  color: #ccc;
}

#menu-screen .setup-option.selected {
  background: rgba(68,136,255,0.2);
  border-color: #48f;
  color: #fff;
}

#menu-screen .setup-option .option-name {
  font-weight: bold;
  color: inherit;
  font-size: 13px;
}

#menu-screen .setup-option .option-detail {
  color: #4af;
  font-size: 11px;
}

#menu-screen .setup-option .option-desc {
  color: #666;
  font-size: 10px;
}

#menu-screen .setup-option.selected .option-desc {
  color: #888;
}

/* ─── Waiting Spinner ────────────────────────────────────────────────────── */

#menu-screen .waiting-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #333;
  border-top-color: #4af;
  border-radius: 50%;
  margin: 16px auto;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── Scrollbar ─────────────────────────────────────────────────────────── */

#empire-ui ::-webkit-scrollbar {
  width: 4px;
}

#empire-ui ::-webkit-scrollbar-track {
  background: transparent;
}

#empire-ui ::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 2px;
}
`;
