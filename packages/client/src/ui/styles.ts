// Empire Reborn — UI Styles (injected as <style> tag)

export function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
/* ─── Design Tokens ────────────────────────────────────────────────────── */

:root {
  --ui-font: 'Courier New', monospace;
  --color-text: #ccc;
  --color-text-bright: #fff;
  --color-text-muted: #888;
  --color-text-dim: #666;
  --color-text-subtle: #777;
  --color-text-faint: #aaa;
  --color-accent: #4af;
  --color-accent-light: #8af;
  --color-accent-hex: #48f;
  --color-accent-rgb: 68, 136, 255;
  --color-orange: #fa4;
  --color-orange-rgb: 255, 170, 68;
  --color-green: #4c4;
  --color-green-active: #4c8;
  --color-green-bright: #4f4;
  --color-red: #f44;
  --color-red-dim: #f84;
  --color-border: #333;
  --color-border-dim: #335;
  --color-border-dark: #444;
  --color-bg-dark: rgba(0,0,0,0.8);
  --color-bg-overlay: rgba(0,0,0,0.7);
  --color-bg-modal: rgba(10,10,30,0.95);
  --color-bg-menu: rgba(5,5,15,0.95);
}

/* ─── Root Overlay ──────────────────────────────────────────────────────── */

#empire-ui {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  font-family: var(--ui-font);
  font-size: 13px;
  color: var(--color-text);
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

#hud-top-content {
  display: contents;
}

#hud-top .stat {
  color: var(--color-accent-light);
}

#hud-top .stat-label {
  color: var(--color-text-subtle);
  margin-right: 4px;
}

#hud-top .unit-count {
  color: var(--color-accent-light);
  margin-right: 6px;
  font-size: 12px;
}

#hud-top .resources {
  display: inline-flex;
  gap: 10px;
  margin-left: 8px;
  font-size: 12px;
}

#hud-top .res-ore::before { content: "Ore "; color: #c08040; }
#hud-top .res-oil::before { content: "Oil "; color: #8888aa; }
#hud-top .res-txt::before { content: "Txt "; color: #60b050; }

#hud-top .res-ore,
#hud-top .res-oil,
#hud-top .res-txt {
  color: var(--color-accent-light);
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
  color: var(--color-accent);
  font-weight: bold;
  text-transform: capitalize;
}

#hud-bottom .city-name {
  color: var(--color-orange);
  font-weight: bold;
}

#hud-bottom .info-sep {
  color: var(--color-border-dark);
}

/* ─── Right Sidebar ─────────────────────────────────────────────────────── */

#sidebar-right {
  pointer-events: auto;
  position: absolute;
  top: 0;
  right: 0;
  width: 200px;
  height: 100%;
  background: var(--color-bg-dark);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Minimap ───────────────────────────────────────────────────────────── */

#minimap-wrapper {
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
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
  color: var(--color-text-dim);
  font-size: 11px;
  text-transform: uppercase;
  margin-top: 4px;
  margin-bottom: 2px;
}

.action-btn {
  pointer-events: auto;
  background: rgba(var(--color-accent-rgb), 0.15);
  border: 1px solid var(--color-border-dim);
  color: var(--color-accent-light);
  padding: 4px 8px;
  cursor: pointer;
  font-family: var(--ui-font);
  font-size: 12px;
  text-align: left;
  display: flex;
  justify-content: space-between;
  transition: background 0.1s;
}

.action-btn:hover {
  background: rgba(var(--color-accent-rgb), 0.3);
  border-color: var(--color-accent-hex);
}

.action-btn:active {
  background: rgba(var(--color-accent-rgb), 0.5);
}

.action-btn.active {
  background: rgba(68,200,100,0.25);
  border-color: var(--color-green-active);
  color: var(--color-green-active);
}

.action-btn.active:hover {
  background: rgba(68,200,100,0.35);
}

.action-btn.disabled {
  opacity: 0.35;
  pointer-events: none;
}

.action-btn .hotkey {
  color: var(--color-orange);
  font-size: 11px;
}

.action-btn.end-turn {
  background: rgba(var(--color-orange-rgb), 0.2);
  border-color: #553;
  color: var(--color-orange);
  margin-top: 8px;
}

.action-btn.end-turn:hover {
  background: rgba(var(--color-orange-rgb), 0.4);
  border-color: var(--color-orange);
}

/* ─── Turn Flow Buttons ─────────────────────────────────────────────────── */

#turn-buttons {
  padding: 8px;
  border-top: 1px solid var(--color-border);
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
  background: var(--color-bg-overlay);
  border-right: 1px solid var(--color-border);
  border-top: 1px solid var(--color-border);
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
  color: var(--color-text-bright);
}

#event-log .event.combat { color: var(--color-red-dim); }
#event-log .event.capture { color: var(--color-orange); }
#event-log .event.production { color: var(--color-green); }
#event-log .event.death { color: var(--color-text-muted); }
#event-log .event.discovery { color: var(--color-accent); }

/* ─── City Panel (Modal) ────────────────────────────────────────────────── */

#city-panel {
  pointer-events: auto;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-bg-modal);
  border: 1px solid var(--color-accent-hex);
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
  color: var(--color-orange);
  font-family: var(--ui-font);
}

#city-panel .production-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

#city-panel .prod-btn {
  pointer-events: auto;
  background: rgba(var(--color-accent-rgb), 0.1);
  border: 1px solid var(--color-border-dim);
  color: var(--color-text-faint);
  padding: 8px 6px;
  cursor: pointer;
  font-family: var(--ui-font);
  font-size: 11px;
  text-align: center;
  transition: background 0.1s;
}

#city-panel .prod-btn:hover {
  background: rgba(var(--color-accent-rgb), 0.25);
  border-color: var(--color-accent-hex);
  color: var(--color-text-bright);
}

#city-panel .prod-btn.active {
  background: rgba(var(--color-accent-rgb), 0.3);
  border-color: var(--color-accent-hex);
  color: var(--color-accent);
}

#city-panel .prod-btn .prod-name {
  font-weight: bold;
  display: block;
  margin-bottom: 2px;
}

#city-panel .prod-btn .prod-stat {
  color: var(--color-text-subtle);
  font-size: 10px;
}

#city-panel .progress-bar {
  margin-top: 12px;
  height: 8px;
  background: #222;
  border: 1px solid var(--color-border-dark);
  position: relative;
}

#city-panel .progress-bar .fill {
  height: 100%;
  background: var(--color-accent-hex);
  transition: width 0.2s;
}

#city-panel .progress-info {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-muted);
}

#city-panel .penalty-warning {
  color: var(--color-red-dim);
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
  color: var(--color-text-muted);
  font-size: 18px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
}

#city-panel .close-btn:hover {
  color: var(--color-text-bright);
}

/* ─── Menu Screens ──────────────────────────────────────────────────────── */

#menu-screen {
  pointer-events: auto;
  position: absolute;
  inset: 0;
  background: var(--color-bg-menu);
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
  font-family: var(--ui-font);
  font-size: 36px;
  color: var(--color-accent);
  margin: 0 0 8px 0;
  letter-spacing: 4px;
}

#menu-screen .subtitle {
  color: var(--color-text-dim);
  font-size: 14px;
  margin-bottom: 32px;
}

#menu-screen .menu-btn {
  pointer-events: auto;
  background: rgba(var(--color-accent-rgb), 0.15);
  border: 1px solid var(--color-accent-hex);
  color: var(--color-accent-light);
  padding: 12px 40px;
  margin: 6px;
  cursor: pointer;
  font-family: var(--ui-font);
  font-size: 16px;
  min-width: 200px;
  text-align: center;
  transition: background 0.15s;
}

#menu-screen .menu-btn:hover {
  background: rgba(var(--color-accent-rgb), 0.35);
  color: var(--color-text-bright);
}

#menu-screen .result-text {
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 16px;
}

#menu-screen .result-text.victory { color: var(--color-green-bright); }
#menu-screen .result-text.defeat { color: var(--color-red); }

#menu-screen .stats {
  color: var(--color-text-muted);
  font-size: 13px;
  margin-bottom: 24px;
  text-align: center;
  line-height: 1.6;
}

#menu-screen h2 {
  font-family: var(--ui-font);
  font-size: 24px;
  color: var(--color-accent);
  margin: 0 0 12px 0;
  letter-spacing: 2px;
}

#menu-screen .menu-btn-secondary {
  pointer-events: auto;
  background: transparent;
  border: 1px solid #555;
  color: var(--color-text-muted);
  padding: 8px 24px;
  margin: 6px;
  cursor: pointer;
  font-family: var(--ui-font);
  font-size: 13px;
  min-width: 160px;
  text-align: center;
  transition: all 0.15s;
}

#menu-screen .menu-btn-secondary:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text);
}

/* ─── Connection Status ──────────────────────────────────────────────────── */

#menu-screen .conn-status {
  font-size: 12px;
  margin-bottom: 16px;
  padding: 4px 12px;
  border-radius: 3px;
}

#menu-screen .conn-ok { color: var(--color-green); }
#menu-screen .conn-warn { color: var(--color-orange); }
#menu-screen .conn-err { color: var(--color-red); }

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
  color: var(--color-text-muted);
  font-size: 12px;
  text-transform: uppercase;
  margin: 0 0 6px 0;
  font-family: var(--ui-font);
}

#menu-screen .lobby-game {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--color-border);
  margin-bottom: 4px;
}

#menu-screen .lobby-game .game-id {
  color: var(--color-accent);
  font-weight: bold;
  flex: 0 0 80px;
}

#menu-screen .lobby-game .game-info {
  color: var(--color-text-subtle);
  font-size: 11px;
  flex: 1;
}

#menu-screen .lobby-btn {
  pointer-events: auto;
  background: rgba(var(--color-accent-rgb), 0.15);
  border: 1px solid var(--color-accent-hex);
  color: var(--color-accent-light);
  padding: 4px 12px;
  cursor: pointer;
  font-family: var(--ui-font);
  font-size: 12px;
  transition: background 0.15s;
}

#menu-screen .lobby-btn:hover {
  background: rgba(var(--color-accent-rgb), 0.35);
  color: var(--color-text-bright);
}

#menu-screen .lobby-empty {
  color: var(--color-text-dim);
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
  color: var(--color-text-muted);
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
  border: 1px solid var(--color-border);
  color: var(--color-text-faint);
  padding: 10px 12px;
  cursor: pointer;
  font-family: var(--ui-font);
  font-size: 12px;
  text-align: left;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

#menu-screen .setup-option:hover {
  background: rgba(var(--color-accent-rgb), 0.1);
  border-color: var(--color-accent-hex);
  color: var(--color-text);
}

#menu-screen .setup-option.selected {
  background: rgba(var(--color-accent-rgb), 0.2);
  border-color: var(--color-accent-hex);
  color: var(--color-text-bright);
}

#menu-screen .setup-option .option-name {
  font-weight: bold;
  color: inherit;
  font-size: 13px;
}

#menu-screen .setup-option .option-detail {
  color: var(--color-accent);
  font-size: 11px;
}

#menu-screen .setup-option .option-desc {
  color: var(--color-text-dim);
  font-size: 10px;
}

#menu-screen .setup-option.selected .option-desc {
  color: var(--color-text-muted);
}

/* ─── Waiting Spinner ────────────────────────────────────────────────────── */

#menu-screen .waiting-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  margin: 16px auto;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── War Stats Button ─────────────────────────────────────────────────── */

#war-stats-btn {
  pointer-events: auto;
  background: rgba(var(--color-accent-rgb), 0.15);
  border: 1px solid var(--color-border-dim);
  color: var(--color-accent-light);
  padding: 3px 10px;
  cursor: pointer;
  font-family: var(--ui-font);
  font-size: 12px;
  transition: background 0.1s;
  white-space: nowrap;
}

#war-stats-btn:hover {
  background: rgba(var(--color-accent-rgb), 0.3);
  border-color: var(--color-accent-hex);
  color: var(--color-text-bright);
}

/* ─── War Stats Panel ──────────────────────────────────────────────────── */

#war-stats-panel {
  pointer-events: auto;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-bg-modal);
  border: 1px solid var(--color-accent-hex);
  padding: 16px;
  min-width: 500px;
  max-width: 600px;
  max-height: 70vh;
  display: none;
  flex-direction: column;
  z-index: 50;
}

#war-stats-panel.visible {
  display: flex;
}

#war-stats-panel .war-stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

#war-stats-panel h2 {
  margin: 0;
  font-size: 16px;
  color: var(--color-accent);
  font-family: var(--ui-font);
}

#war-stats-panel .close-btn {
  pointer-events: auto;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 18px;
  cursor: pointer;
  font-family: var(--ui-font);
}

#war-stats-panel .close-btn:hover {
  color: var(--color-text-bright);
}

/* Summary */

.war-stats-summary {
  padding: 6px 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 6px;
  font-size: 11px;
}

.war-stats-summary .summary-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.war-stats-summary .summary-p1 { color: var(--color-green); }
.war-stats-summary .summary-p2 { color: var(--color-red); }

/* Filters */

.war-stats-filters {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.war-filter-btn {
  pointer-events: auto;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  padding: 3px 10px;
  cursor: pointer;
  font-family: var(--ui-font);
  font-size: 11px;
  transition: all 0.1s;
}

.war-filter-btn:hover {
  background: rgba(var(--color-accent-rgb), 0.15);
  color: var(--color-text);
}

.war-filter-btn.active {
  background: rgba(var(--color-accent-rgb), 0.2);
  border-color: var(--color-accent-hex);
  color: var(--color-accent-light);
}

/* Battle List */

.war-stats-list {
  overflow-y: auto;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.war-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  background: rgba(255,255,255,0.02);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.1s;
}

.war-row:hover {
  background: rgba(var(--color-accent-rgb), 0.1);
  border-color: var(--color-border);
}

.war-row .war-icon {
  flex: 0 0 18px;
  text-align: center;
  font-size: 13px;
}

.war-row .war-turn {
  flex: 0 0 32px;
  color: var(--color-text-dim);
  font-size: 11px;
}

.war-row .war-desc {
  flex: 1;
  color: var(--color-text);
}

.war-row .war-desc .p1 { color: var(--color-green); }
.war-row .war-desc .p2 { color: var(--color-red); }

.war-row .war-deaths {
  color: var(--color-text-muted);
  font-size: 10px;
  flex: 0 0 auto;
}

.war-row .war-loc {
  flex: 0 0 auto;
  color: var(--color-accent);
  font-size: 10px;
  cursor: pointer;
}

.war-row .war-loc:hover {
  color: var(--color-text-bright);
  text-decoration: underline;
}

.war-empty {
  color: var(--color-text-dim);
  text-align: center;
  padding: 24px 0;
  font-size: 13px;
}

/* ─── Unit Info Panel ──────────────────────────────────────────────────── */

#unit-info-panel {
  display: none;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
  flex-direction: column;
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
}

#unit-info-panel.visible {
  display: flex;
}

#unit-info-panel .info-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

#unit-info-panel .info-icon {
  width: 28px;
  height: 28px;
  border: 2px solid var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  color: var(--color-text-bright);
  flex-shrink: 0;
}

#unit-info-panel .info-city-icon {
  font-size: 14px;
}

#unit-info-panel .info-title {
  flex: 1;
  min-width: 0;
}

#unit-info-panel .info-name {
  color: var(--color-accent);
  font-weight: bold;
  font-size: 13px;
  text-transform: capitalize;
}

#unit-info-panel .info-owner {
  font-size: 10px;
}

#unit-info-panel .info-section {
  margin: 3px 0;
}

#unit-info-panel .info-label {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}

#unit-info-panel .info-value {
  color: var(--color-text);
  font-size: 12px;
}

#unit-info-panel .info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1px 0;
}

#unit-info-panel .info-loc {
  margin-top: 4px;
  border-top: 1px solid var(--color-border);
  padding-top: 4px;
}

#unit-info-panel .info-divider {
  height: 1px;
  background: var(--color-border);
  margin: 6px 0;
}

/* HP bar — segmented */
#unit-info-panel .info-hp-bar {
  display: flex;
  gap: 2px;
  margin: 2px 0;
}

#unit-info-panel .info-hp-seg {
  flex: 1;
  height: 6px;
  background: #222;
  border: 1px solid var(--color-border);
  max-width: 16px;
}

#unit-info-panel .info-hp-seg.filled {
  border-color: transparent;
}

/* Production progress */
#unit-info-panel .info-progress-bar {
  height: 6px;
  background: #222;
  border: 1px solid var(--color-border);
  margin: 2px 0;
}

#unit-info-panel .info-progress-fill {
  height: 100%;
  background: var(--color-accent-hex);
  transition: width 0.2s;
}

/* Cargo manifest */
#unit-info-panel .info-cargo {
  display: flex;
  gap: 3px;
  margin-top: 2px;
}

#unit-info-panel .info-cargo-item {
  width: 20px;
  height: 20px;
  background: rgba(var(--color-accent-rgb), 0.15);
  border: 1px solid var(--color-border-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: var(--color-accent-light);
}

/* ─── Debug Panel ──────────────────────────────────────────────────────── */

#debug-panel {
  padding: 8px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

#debug-panel .debug-title {
  color: var(--color-red);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 2px;
}

.debug-toggle {
  pointer-events: auto;
  background: rgba(255,50,50,0.08);
  border: 1px solid #433;
  color: #866;
  padding: 3px 8px;
  cursor: pointer;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  text-align: left;
  display: flex;
  justify-content: space-between;
  transition: background 0.1s;
}

.debug-toggle:hover {
  background: rgba(255,50,50,0.2);
  border-color: var(--color-red);
  color: #faa;
}

.debug-toggle.on {
  background: rgba(255,50,50,0.25);
  border-color: var(--color-red);
  color: #f88;
}

.debug-toggle .debug-state {
  font-size: 10px;
  font-weight: bold;
}

.debug-toggle.on .debug-state {
  color: var(--color-green-bright);
}

/* ─── Scrollbar ─────────────────────────────────────────────────────────── */

#empire-ui ::-webkit-scrollbar {
  width: 4px;
}

#empire-ui ::-webkit-scrollbar-track {
  background: transparent;
}

#empire-ui ::-webkit-scrollbar-thumb {
  background: var(--color-border-dark);
  border-radius: 2px;
}
`;
