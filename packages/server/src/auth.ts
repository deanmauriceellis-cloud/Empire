// Empire Reborn — Authentication & JWT
// Username/password registration, login, JWT token management.

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";

// ─── Config ─────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;
const TOKEN_EXPIRY = "7d";
const REFRESH_EXPIRY = "30d";

/** JWT secret — generated at startup if not set via env. */
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString("hex");

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TokenPayload {
  userId: number;
  username: string;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
}

// ─── Password Hashing ───────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT ────────────────────────────────────────────────────────────────────

export function createTokens(payload: TokenPayload): AuthTokens {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  const refreshToken = jwt.sign(
    { ...payload, refresh: true },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRY },
  );
  return { token, refreshToken };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload & { refresh?: boolean };
    if (decoded.refresh) return null; // Refresh token can't be used as access token
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload & { refresh?: boolean };
    if (!decoded.refresh) return null;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

export function validateUsername(username: string): string | null {
  if (!username || typeof username !== "string") return "Username is required";
  if (!USERNAME_RE.test(username)) return "Username must be 3-24 characters (letters, numbers, _ -)";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || typeof password !== "string") return "Password is required";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return "Password is too long";
  return null;
}
