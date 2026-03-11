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

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  last_login: string;
}

export interface KingdomRow {
  id: number;
  user_id: number;
  world_id: string;
  player_id: number;
  kingdom_name: string;
  isolation_level: string;
  status: string;
  joined_at: string;
  last_active: string;
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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kingdoms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        world_id TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        kingdom_name TEXT NOT NULL,
        isolation_level TEXT NOT NULL DEFAULT 'middle',
        status TEXT NOT NULL DEFAULT 'active',
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kingdoms_user_world ON kingdoms(user_id, world_id)
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

  // ─── Users ─────────────────────────────────────────────────────────────────

  createUser(username: string, passwordHash: string): number {
    const stmt = this.db.prepare(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
    );
    const result = stmt.run(username, passwordHash);
    return result.lastInsertRowid as number;
  }

  getUserByUsername(username: string): UserRow | null {
    return (this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined) ?? null;
  }

  getUserById(id: number): UserRow | null {
    return (this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined) ?? null;
  }

  updateLastLogin(userId: number): void {
    this.db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId);
  }

  // ─── Kingdoms ─────────────────────────────────────────────────────────────

  createKingdom(
    userId: number,
    worldId: string,
    playerId: number,
    kingdomName: string,
    isolationLevel: string,
  ): number {
    const stmt = this.db.prepare(
      "INSERT INTO kingdoms (user_id, world_id, player_id, kingdom_name, isolation_level) VALUES (?, ?, ?, ?, ?)",
    );
    const result = stmt.run(userId, worldId, playerId, kingdomName, isolationLevel);
    return result.lastInsertRowid as number;
  }

  getActiveKingdom(userId: number, worldId: string): KingdomRow | null {
    return (this.db.prepare(
      "SELECT * FROM kingdoms WHERE user_id = ? AND world_id = ? AND status = 'active'",
    ).get(userId, worldId) as KingdomRow | undefined) ?? null;
  }

  getActiveKingdomsForUser(userId: number): KingdomRow[] {
    return this.db.prepare(
      "SELECT * FROM kingdoms WHERE user_id = ? AND status = 'active' ORDER BY last_active DESC",
    ).all(userId) as KingdomRow[];
  }

  updateKingdomStatus(kingdomId: number, status: string): void {
    this.db.prepare("UPDATE kingdoms SET status = ?, last_active = datetime('now') WHERE id = ?").run(status, kingdomId);
  }

  updateKingdomLastActive(kingdomId: number): void {
    this.db.prepare("UPDATE kingdoms SET last_active = datetime('now') WHERE id = ?").run(kingdomId);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
