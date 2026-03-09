// Empire Reborn — SQLite Persistence Layer

import Database from "better-sqlite3";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { GameState } from "@empire/shared";
import type { GamePhase } from "./protocol.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SavedGame {
  id: string;
  phase: GamePhase;
  turn: number;
  state: string; // JSON-serialized GameState
  created_at: string;
  updated_at: string;
}

export interface SavedGameSummary {
  id: string;
  phase: GamePhase;
  turn: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Database ────────────────────────────────────────────────────────────────

export class GameDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? join(process.cwd(), "data", "empire.db");

    // Ensure data directory exists
    mkdirSync(dirname(path), { recursive: true });

    this.db = new Database(path);

    // Enable WAL mode for better concurrent read/write performance
    this.db.pragma("journal_mode = WAL");

    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        phase TEXT NOT NULL DEFAULT 'lobby',
        turn INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // ─── Save / Load ──────────────────────────────────────────────────────────

  saveGame(id: string, phase: GamePhase, state: GameState): void {
    const stateJson = JSON.stringify(state);
    const stmt = this.db.prepare(`
      INSERT INTO games (id, phase, turn, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        phase = excluded.phase,
        turn = excluded.turn,
        state = excluded.state,
        updated_at = datetime('now')
    `);
    stmt.run(id, phase, state.turn, stateJson);
  }

  loadGame(id: string): { phase: GamePhase; state: GameState } | null {
    const row = this.db.prepare("SELECT phase, state FROM games WHERE id = ?").get(id) as
      | Pick<SavedGame, "phase" | "state">
      | undefined;
    if (!row) return null;
    return {
      phase: row.phase,
      state: JSON.parse(row.state) as GameState,
    };
  }

  deleteGame(id: string): boolean {
    const result = this.db.prepare("DELETE FROM games WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  listGames(): SavedGameSummary[] {
    const rows = this.db
      .prepare("SELECT id, phase, turn, created_at, updated_at FROM games ORDER BY updated_at DESC")
      .all() as Array<Pick<SavedGame, "id" | "phase" | "turn" | "created_at" | "updated_at">>;

    return rows.map((r) => ({
      id: r.id,
      phase: r.phase,
      turn: r.turn,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
