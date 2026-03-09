# Empire Reborn — Changelog

## v0.0.2 — Session 001 (2026-03-09)

### Changed
- **Simplified architecture** — rewrote `PLAN.md` with leaner tech stack:
  - Removed Colyseus → plain WebSocket (`ws`) + Express
  - Removed Redis → in-memory `Map` for active game state
  - Removed PostgreSQL → SQLite (`better-sqlite3`)
  - Removed Better Auth → deferred (add OAuth later if needed)
  - Removed Turborepo → plain pnpm workspaces
  - Removed tsup → shared package consumed as raw TypeScript
  - Removed 3-service deploy → single Dockerfile (Node serves client + WebSocket + API)
- Phase 5: Colyseus Server → Node.js WebSocket game manager (4 steps, was 5)
- Phase 6: Database & Auth → Persistence only (2 steps, was 3)
- Phase 9: Client-Server Integration simplified (4 steps, was 5)
- Phase 11: Deployment simplified (2 steps, was 4)
- Total steps: 48 (was 55)
- All game logic, AI, rendering, and UI phases unchanged

## v0.0.1 — Session 000 (2026-03-09)

### Added
- Cloned original VMS-Empire source from github.com/slacy/empire
- Created `PLAN.md` — 12-phase, 55-step implementation plan
- Created `STATE.md` — project state tracking
- Created `CHANGELOG.md` — this file
- Created session protocol with archive-first optimization policy
- Created `MEMORY.md` in Claude memory directory
- Set up `docs/sessions/` and `docs/archive/` directory structure

### Research
- Full analysis of original game: 9 unit types, combat mechanics, AI strategy, map generation, fog of war
- Tech stack selection: PixiJS v8, TypeScript, Vite, Colyseus, PostgreSQL, Redis, Better Auth
- Deployment strategy: Cloudflare Pages + Fly.io + Cloudflare R2
