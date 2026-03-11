// Empire Reborn — Auth Tests

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  validateUsername,
  validatePassword,
  createTokens,
  verifyToken,
  verifyRefreshToken,
} from "../auth.js";
import { GameDatabase } from "../database.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Password Hashing ───────────────────────────────────────────────────────

describe("Password Hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("testpass123");
    expect(hash).not.toBe("testpass123");
    expect(await verifyPassword("testpass123", hash)).toBe(true);
    expect(await verifyPassword("wrongpass", hash)).toBe(false);
  });

  it("produces different hashes for same password", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2); // bcrypt salts are random
  });
});

// ─── JWT Tokens ─────────────────────────────────────────────────────────────

describe("JWT Tokens", () => {
  const payload = { userId: 42, username: "testuser" };

  it("creates and verifies access token", () => {
    const tokens = createTokens(payload);
    expect(tokens.token).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const decoded = verifyToken(tokens.token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(42);
    expect(decoded!.username).toBe("testuser");
  });

  it("access token cannot be used as refresh token", () => {
    const tokens = createTokens(payload);
    const decoded = verifyRefreshToken(tokens.token);
    expect(decoded).toBeNull();
  });

  it("refresh token cannot be used as access token", () => {
    const tokens = createTokens(payload);
    const decoded = verifyToken(tokens.refreshToken);
    expect(decoded).toBeNull();
  });

  it("verifies refresh token correctly", () => {
    const tokens = createTokens(payload);
    const decoded = verifyRefreshToken(tokens.refreshToken);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(42);
    expect(decoded!.username).toBe("testuser");
  });

  it("rejects invalid token", () => {
    expect(verifyToken("garbage.token.here")).toBeNull();
    expect(verifyRefreshToken("garbage.token.here")).toBeNull();
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe("Validation", () => {
  it("validates usernames", () => {
    expect(validateUsername("good_user")).toBeNull();
    expect(validateUsername("ab")).not.toBeNull(); // too short
    expect(validateUsername("a".repeat(25))).not.toBeNull(); // too long
    expect(validateUsername("bad user!")).not.toBeNull(); // invalid chars
    expect(validateUsername("")).not.toBeNull();
    expect(validateUsername("abc")).toBeNull(); // min length
    expect(validateUsername("user-name_123")).toBeNull();
  });

  it("validates passwords", () => {
    expect(validatePassword("good12")).toBeNull();
    expect(validatePassword("short")).not.toBeNull(); // too short
    expect(validatePassword("a".repeat(129))).not.toBeNull(); // too long
    expect(validatePassword("")).not.toBeNull();
    expect(validatePassword("123456")).toBeNull(); // min length
  });
});

// ─── Database User Operations ───────────────────────────────────────────────

describe("Database: Users & Kingdoms", () => {
  let db: GameDatabase;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "empire-auth-test-"));
    db = new GameDatabase(join(tmpDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates and retrieves a user", () => {
    const id = db.createUser("alice", "hash123");
    expect(id).toBeGreaterThan(0);

    const user = db.getUserByUsername("alice");
    expect(user).not.toBeNull();
    expect(user!.id).toBe(id);
    expect(user!.username).toBe("alice");
    expect(user!.password_hash).toBe("hash123");
  });

  it("enforces unique usernames (case-insensitive)", () => {
    db.createUser("alice", "hash1");
    expect(() => db.createUser("Alice", "hash2")).toThrow();
  });

  it("retrieves user by ID", () => {
    const id = db.createUser("bob", "hash456");
    const user = db.getUserById(id);
    expect(user).not.toBeNull();
    expect(user!.username).toBe("bob");
  });

  it("returns null for nonexistent user", () => {
    expect(db.getUserByUsername("nobody")).toBeNull();
    expect(db.getUserById(999)).toBeNull();
  });

  it("updates last login", () => {
    const id = db.createUser("carol", "hash");
    const before = db.getUserById(id)!.last_login;
    // Small delay to get different timestamps
    db.updateLastLogin(id);
    const after = db.getUserById(id)!.last_login;
    expect(after).toBeTruthy();
  });

  // Kingdom operations
  it("creates and retrieves a kingdom", () => {
    const userId = db.createUser("dave", "hash");
    const kingdomId = db.createKingdom(userId, "world-1", 3, "Dave's Kingdom", "middle");
    expect(kingdomId).toBeGreaterThan(0);

    const kingdom = db.getActiveKingdom(userId, "world-1");
    expect(kingdom).not.toBeNull();
    expect(kingdom!.player_id).toBe(3);
    expect(kingdom!.kingdom_name).toBe("Dave's Kingdom");
    expect(kingdom!.isolation_level).toBe("middle");
    expect(kingdom!.status).toBe("active");
  });

  it("lists active kingdoms for user", () => {
    const userId = db.createUser("eve", "hash");
    db.createKingdom(userId, "world-1", 1, "Kingdom A", "inner");
    db.createKingdom(userId, "world-2", 5, "Kingdom B", "outer");

    const kingdoms = db.getActiveKingdomsForUser(userId);
    expect(kingdoms).toHaveLength(2);
  });

  it("updates kingdom status", () => {
    const userId = db.createUser("frank", "hash");
    const kingdomId = db.createKingdom(userId, "world-1", 2, "Frank's", "center");

    db.updateKingdomStatus(kingdomId, "defeated");
    const kingdom = db.getActiveKingdom(userId, "world-1");
    expect(kingdom).toBeNull(); // no longer active

    const all = db.getActiveKingdomsForUser(userId);
    expect(all).toHaveLength(0);
  });

  it("returns null for nonexistent kingdom", () => {
    const userId = db.createUser("grace", "hash");
    expect(db.getActiveKingdom(userId, "nonexistent")).toBeNull();
  });
});
