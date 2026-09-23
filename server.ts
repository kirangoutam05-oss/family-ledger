import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { GoogleGenAI, Type } from '@google/genai';
import webpush from 'web-push';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { EMPTY_LEDGER_STATE } from './src/data/initialData';
import { LedgerState, Transaction, SavingsGoal, BudgetAlert, Category, CategoryId, SpenderId, DeviceInfo, CATEGORY_ICON_OPTIONS, PendingAcknowledgement, LockResetRequest } from './src/types';
import { detectRecurringGroups } from './src/utils/recurringDetector';
import { isInCurrentBillingCycle } from './src/utils/billingCycle';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Render terminates TLS at its edge and proxies plain HTTP internally — without
// this, Express never sees the request as "secure" and the session cookie's
// `Secure` flag (and req.secure generally) would behave incorrectly in production.
app.set('trust proxy', 1);

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Tight JSON payload limit to prevent memory exhaustion DoS
app.use(express.json({ limit: '500kb' }));
// Signs the login session cookie (see resolveSession below) — COOKIE_SECRET
// must be set for real login to work; without it, cookie-parser still runs
// but signed cookies won't verify, so resolveSession just finds nothing.
app.use(cookieParser(process.env.COOKIE_SECRET));

// In-memory sliding-window rate limiter for sensitive operations
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerWindow = 60, windowMs = 60 * 1000) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'client';
    // Keyed by route + IP, not IP alone — every rate-limited route used to
    // share one counter per IP, so a household's normal activity on
    // higher-limit routes (adding/editing transactions, etc.) could exhaust
    // a tight-limit route's budget (e.g. send-verification's 5/min) before
    // it was ever called, making that route look permanently broken.
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const record = rateLimitMap.get(key);

    if (!record || now > record.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxPerWindow) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
        retryAfterMs: Math.max(0, record.resetAt - now),
      });
    }

    record.count += 1;
    next();
  };
}

// Financial PII and Account Masking
function maskSensitiveFinancialData(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    // Mask 10-16 digit account or card numbers preserving last 4 digits
    .replace(/\b(\d{6,12})(\d{4})\b/g, (_, p1, p2) => '*'.repeat(p1.length) + p2)
    // Mask explicit account references: e.g. "a/c 501002345678" -> "a/c ****5678"
    .replace(/(?:a\/c|acct|account|card)\s*(?:no\.?)?\s*[:#-]?\s*([a-zA-Z0-9*]{4,})/gi, (match, acc) => {
      if (acc.length > 4) {
        return `a/c ****${acc.slice(-4)}`;
      }
      return match;
    })
    // Mask balance disclosures to prevent shoulder-surfing financial leaks
    .replace(/(?:bal|balance|avl bal|avail bal|available balance)\s*(?:is|:)?\s*(?:rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?/gi, 'Bal: [Protected]')
    // Strip HTML tags
    .replace(/<[^>]*>?/gm, '')
    .trim();
}

function sanitizeString(str: unknown, maxLen = 150): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>?/gm, '').trim().slice(0, maxLen);
}

// Category ids are dynamic (users can add/rename/delete categories), so validity is
// always checked against the household's current category list, not a fixed enum.
function getValidCategoryIds(state: LedgerState): string[] {
  return state.categories.map((c) => c.id);
}

// Persistent state, scoped per household. When DATABASE_URL is set (production),
// each household lives in its own Postgres row (keyed by household id) and
// survives redeploys, not just restarts. Without it (local dev), each household
// falls back to its own JSON file on disk — convenient locally, but does not
// survive a redeploy on ephemeral hosting.
const DATA_DIR = path.join(process.cwd(), 'data');
const HOUSEHOLDS_DIR = path.join(DATA_DIR, 'households');
// The one household that existed before multi-tenancy shipped keeps its original
// file path so local dev doesn't need any file moved around.
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const DEFAULT_HOUSEHOLD_ID = 'default';

// `pool` is mutable: if Postgres is unreachable or misconfigured at startup, we
// fall back to file storage rather than crashing the whole server — a bad
// DATABASE_URL should degrade the app, not take it down entirely.
let pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

async function ensureLedgerTable() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ledger_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // This Postgres instance is on Supabase, which auto-exposes every public
  // table over its PostgREST API to anon/authenticated callers unless RLS is
  // on — this app only ever talks to Postgres through this server's own
  // privileged connection (which bypasses RLS as the table owner), so
  // enabling it with zero policies is exactly "block Supabase's public API
  // from touching this table at all," not a behavior change for us.
  await pool.query(`ALTER TABLE ledger_state ENABLE ROW LEVEL SECURITY`);
}

// A household id doubles as its invite "password" and, in file-storage mode, as
// part of a file path — keep it to a fixed, safe charset so it can never be used
// for path traversal or malformed SQL parameters.
function isValidHouseholdId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{6,32}$/.test(id);
}

function generateHouseholdId(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function householdFilePath(id: string): string {
  return id === DEFAULT_HOUSEHOLD_ID ? LEGACY_DATA_FILE : path.join(HOUSEHOLDS_DIR, `${id}.json`);
}

// In-memory cache of every household currently in use, keyed by household id —
// avoids a disk/DB read on every request once a household has been touched once.
const householdCache = new Map<string, LedgerState>();

// Older persisted data can predate fields added since — backfill them here so
// every household, freshly loaded or long-lived, gets a consistent shape.
function backfillLedgerState(state: LedgerState): LedgerState {
  state.connectedDevices ??= [];
  state.pendingAcknowledgements ??= [];
  state.lockResetRequests ??= [];
  return state;
}

// A "forgot PIN" request left unanswered for 15 minutes stops being valid —
// otherwise a stale request could sit around and get approved long after
// whoever asked for it moved on. Returns whether anything was actually pruned,
// so callers only bother persisting when the array really changed.
function pruneExpiredLockResetRequests(state: LedgerState): boolean {
  const now = Date.now();
  const before = state.lockResetRequests.length;
  state.lockResetRequests = state.lockResetRequests.filter((r) => new Date(r.expiresAt).getTime() > now);
  return state.lockResetRequests.length !== before;
}

// Loads a household's state (from cache, then Postgres/file), or `null` if it
// doesn't exist — except the legacy default household, which is created empty on
// first read so the app keeps working with zero migration for existing installs.
async function loadHouseholdState(id: string): Promise<LedgerState | null> {
  const cached = householdCache.get(id);
  if (cached) return cached;

  if (pool) {
    try {
      await ensureLedgerTable();
      const result = await pool.query('SELECT data FROM ledger_state WHERE id = $1', [id]);
      if (result.rows.length > 0) {
        const state = backfillLedgerState(result.rows[0].data as LedgerState);
        householdCache.set(id, state);
        return state;
      }
      if (id !== DEFAULT_HOUSEHOLD_ID) return null;
    } catch (err) {
      console.error(
        'Could not connect to Postgres (check DATABASE_URL). Falling back to local file storage for this run:',
        err
      );
      pool = null;
    }
  }

  if (!pool) {
    try {
      const raw = fs.readFileSync(householdFilePath(id), 'utf-8');
      const state = backfillLedgerState(JSON.parse(raw) as LedgerState);
      householdCache.set(id, state);
      return state;
    } catch {
      if (id !== DEFAULT_HOUSEHOLD_ID) return null;
    }
  }

  // Legacy default household, seen for the first time on this fresh deploy/DB.
  const initial = backfillLedgerState(JSON.parse(JSON.stringify(EMPTY_LEDGER_STATE)));
  householdCache.set(id, initial);
  await persistHouseholdState(id, initial);
  return initial;
}

// Every household id currently persisted — used only by the daily-reminder
// cron sweep, which has to visit every household rather than one resolved
// from a request header.
async function listHouseholdIds(): Promise<string[]> {
  if (pool) {
    try {
      await ensureLedgerTable();
      const result = await pool.query('SELECT id FROM ledger_state');
      return result.rows.map((r) => r.id as string);
    } catch (err) {
      console.error('Could not list households from Postgres:', err);
      return [];
    }
  }

  const ids: string[] = [];
  if (fs.existsSync(LEGACY_DATA_FILE)) ids.push(DEFAULT_HOUSEHOLD_ID);
  if (fs.existsSync(HOUSEHOLDS_DIR)) {
    for (const file of fs.readdirSync(HOUSEHOLDS_DIR)) {
      if (file.endsWith('.json')) ids.push(file.slice(0, -'.json'.length));
    }
  }
  return ids;
}

async function persistHouseholdState(id: string, state: LedgerState) {
  householdCache.set(id, state);
  try {
    if (pool) {
      await pool.query(
        'INSERT INTO ledger_state (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = now()',
        [id, state]
      );
    } else {
      fs.mkdirSync(path.dirname(householdFilePath(id)), { recursive: true });
      fs.writeFileSync(householdFilePath(id), JSON.stringify(state, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error(`Failed to persist household ${id}:`, err);
  }
}

declare global {
  namespace Express {
    interface Request {
      householdId?: string;
      householdState?: LedgerState;
      // Set by `resolveSession` when a valid `knku_sid` cookie is present —
      // absent for legacy devices that haven't logged in yet, which is fine:
      // every route that reads it treats it as optional during the rollout
      // described where it's consumed below.
      authSession?: { accountId: string; householdId: string; role: SpenderId };
    }
  }
}

// ------------------- LOGIN / PASSWORD AUTH -------------------
//
// A real, per-person login layered on top of the household-id model above.
// The household id (and Postgres row) it persists to are untouched; these
// three tables are deliberately separate because an email must be unique
// *across* households, which doesn't fit inside one household's own JSON
// document. See `.env.example` for the two new secrets this needs
// (RESEND_API_KEY, COOKIE_SECRET).

interface Account {
  id: string;
  householdId: string;
  role: SpenderId;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthSessionRecord {
  id: string;
  accountId: string;
  householdId: string;
  role: SpenderId;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent?: string;
  revokedAt?: string;
}

interface PasswordResetToken {
  tokenHash: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

// Same shape as PasswordResetToken (a hashed, time-limited, single-use
// token) — kept as its own type/table rather than reused, since mixing the
// two would let a password-reset link double as an email-verification link
// or vice versa.
interface EmailVerificationToken {
  tokenHash: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const RESET_TOKENS_FILE = path.join(DATA_DIR, 'password_reset_tokens.json');
const VERIFY_TOKENS_FILE = path.join(DATA_DIR, 'email_verification_tokens.json');
const SESSION_COOKIE = 'knku_sid';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — more forgiving than a password reset

function readJsonArray<T>(filePath: string): T[] {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(filePath: string, arr: T[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf-8');
}

async function ensureAuthTables() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id                TEXT PRIMARY KEY,
      household_id      TEXT NOT NULL,
      role              TEXT NOT NULL CHECK (role IN ('husband','wife')),
      email             TEXT NOT NULL,
      email_normalized  TEXT NOT NULL UNIQUE,
      password_hash     TEXT NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (household_id, role)
    )
  `);
  // `email_verified` shipped after `accounts` did — CREATE TABLE IF NOT
  // EXISTS above is a no-op against the table that's already live in
  // production, so the column needs its own migration statement.
  await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash   TEXT PRIMARY KEY,
      account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      used_at      TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token_hash   TEXT PRIMARY KEY,
      account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      used_at      TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id            TEXT PRIMARY KEY,
      account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      household_id  TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('husband','wife')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at    TIMESTAMPTZ NOT NULL,
      user_agent    TEXT,
      revoked_at    TIMESTAMPTZ
    )
  `);

  // Same reasoning as ledger_state above — these four hold password hashes
  // and live session/reset/verification tokens, so they're exactly the
  // tables that must never be reachable through Supabase's public
  // PostgREST API. Zero policies is intentional: this server's own
  // connection (the table owner) bypasses RLS entirely, while every other
  // Postgres role is fully denied by default once it's on.
  for (const table of ['accounts', 'password_reset_tokens', 'email_verification_tokens', 'sessions']) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  }
}

function rowToAccount(row: any): Account {
  return {
    id: row.id,
    householdId: row.household_id,
    role: row.role,
    email: row.email,
    emailNormalized: row.email_normalized,
    passwordHash: row.password_hash,
    emailVerified: row.email_verified === true,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

async function findAccountByEmail(emailNormalized: string): Promise<Account | null> {
  if (pool) {
    const r = await pool.query('SELECT * FROM accounts WHERE email_normalized = $1', [emailNormalized]);
    return r.rows[0] ? rowToAccount(r.rows[0]) : null;
  }
  return readJsonArray<Account>(ACCOUNTS_FILE).find((a) => a.emailNormalized === emailNormalized) ?? null;
}

async function findAccountByHouseholdRole(householdId: string, role: SpenderId): Promise<Account | null> {
  if (pool) {
    const r = await pool.query('SELECT * FROM accounts WHERE household_id = $1 AND role = $2', [householdId, role]);
    return r.rows[0] ? rowToAccount(r.rows[0]) : null;
  }
  return readJsonArray<Account>(ACCOUNTS_FILE).find((a) => a.householdId === householdId && a.role === role) ?? null;
}

async function findAccountById(id: string): Promise<Account | null> {
  if (pool) {
    const r = await pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
    return r.rows[0] ? rowToAccount(r.rows[0]) : null;
  }
  return readJsonArray<Account>(ACCOUNTS_FILE).find((a) => a.id === id) ?? null;
}

async function insertAccount(account: Account): Promise<void> {
  if (pool) {
    await pool.query(
      `INSERT INTO accounts (id, household_id, role, email, email_normalized, password_hash, email_verified, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [
        account.id,
        account.householdId,
        account.role,
        account.email,
        account.emailNormalized,
        account.passwordHash,
        account.emailVerified,
        account.createdAt,
      ]
    );
    return;
  }
  const accounts = readJsonArray<Account>(ACCOUNTS_FILE);
  accounts.push(account);
  writeJsonArray(ACCOUNTS_FILE, accounts);
}

async function markAccountEmailVerified(accountId: string): Promise<void> {
  if (pool) {
    await pool.query('UPDATE accounts SET email_verified = true, updated_at = now() WHERE id = $1', [accountId]);
    return;
  }
  const accounts = readJsonArray<Account>(ACCOUNTS_FILE);
  const acc = accounts.find((a) => a.id === accountId);
  if (acc) {
    acc.emailVerified = true;
    acc.updatedAt = new Date().toISOString();
    writeJsonArray(ACCOUNTS_FILE, accounts);
  }
}

async function updateAccountPassword(accountId: string, passwordHash: string): Promise<void> {
  if (pool) {
    await pool.query('UPDATE accounts SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, accountId]);
    return;
  }
  const accounts = readJsonArray<Account>(ACCOUNTS_FILE);
  const acc = accounts.find((a) => a.id === accountId);
  if (acc) {
    acc.passwordHash = passwordHash;
    acc.updatedAt = new Date().toISOString();
    writeJsonArray(ACCOUNTS_FILE, accounts);
  }
}

async function createSession(account: Account, userAgent?: string): Promise<AuthSessionRecord> {
  const session: AuthSessionRecord = {
    id: crypto.randomBytes(32).toString('base64url'),
    accountId: account.id,
    householdId: account.householdId,
    role: account.role,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    userAgent,
  };
  if (pool) {
    await pool.query(
      `INSERT INTO sessions (id, account_id, household_id, role, created_at, last_seen_at, expires_at, user_agent)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
      [session.id, session.accountId, session.householdId, session.role, session.createdAt, session.expiresAt, userAgent || null]
    );
  } else {
    const sessions = readJsonArray<AuthSessionRecord>(SESSIONS_FILE);
    sessions.push(session);
    writeJsonArray(SESSIONS_FILE, sessions);
  }
  return session;
}

// Looks up a session and, if valid, slides its expiry forward another 30
// days — an active device never gets logged out mid-use, only one that's
// been idle for the full window.
async function findValidSession(sessionId: string): Promise<AuthSessionRecord | null> {
  const now = new Date();
  const newExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  if (pool) {
    const r = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    const row = r.rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at) < now) return null;
    pool
      .query('UPDATE sessions SET last_seen_at = now(), expires_at = $1 WHERE id = $2', [newExpiry, sessionId])
      .catch((err) => console.error('Failed to refresh session expiry:', err));
    return {
      id: row.id,
      accountId: row.account_id,
      householdId: row.household_id,
      role: row.role,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: newExpiry,
      userAgent: row.user_agent,
      revokedAt: row.revoked_at,
    };
  }
  const sessions = readJsonArray<AuthSessionRecord>(SESSIONS_FILE);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session || session.revokedAt || new Date(session.expiresAt) < now) return null;
  session.lastSeenAt = new Date().toISOString();
  session.expiresAt = newExpiry;
  writeJsonArray(SESSIONS_FILE, sessions);
  return session;
}

async function revokeSession(sessionId: string): Promise<void> {
  if (pool) {
    await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
    return;
  }
  const sessions = readJsonArray<AuthSessionRecord>(SESSIONS_FILE);
  const session = sessions.find((s) => s.id === sessionId);
  if (session) {
    session.revokedAt = new Date().toISOString();
    writeJsonArray(SESSIONS_FILE, sessions);
  }
}

// Called on password reset — a reset is a strong signal the old credential
// may have been compromised, so every device gets signed out, not just the
// one performing the reset.
async function revokeAllSessionsForAccount(accountId: string): Promise<void> {
  if (pool) {
    await pool.query('UPDATE sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL', [accountId]);
    return;
  }
  const sessions = readJsonArray<AuthSessionRecord>(SESSIONS_FILE);
  let changed = false;
  for (const s of sessions) {
    if (s.accountId === accountId && !s.revokedAt) {
      s.revokedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) writeJsonArray(SESSIONS_FILE, sessions);
}

function hashResetToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// The raw token only ever exists in the emailed link — only its hash is
// stored, the same reasoning as a password hash: a leaked database row
// shouldn't hand out working reset links.
async function createPasswordResetToken(accountId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString('base64url');
  const token: PasswordResetToken = {
    tokenHash: hashResetToken(raw),
    accountId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
  };
  if (pool) {
    await pool.query(
      'INSERT INTO password_reset_tokens (token_hash, account_id, created_at, expires_at) VALUES ($1,$2,$3,$4)',
      [token.tokenHash, token.accountId, token.createdAt, token.expiresAt]
    );
  } else {
    const tokens = readJsonArray<PasswordResetToken>(RESET_TOKENS_FILE);
    tokens.push(token);
    writeJsonArray(RESET_TOKENS_FILE, tokens);
  }
  return raw;
}

async function consumePasswordResetToken(raw: string): Promise<PasswordResetToken | null> {
  const tokenHash = hashResetToken(raw);
  const now = new Date();
  if (pool) {
    const r = await pool.query('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
    const row = r.rows[0];
    if (!row || row.used_at || new Date(row.expires_at) < now) return null;
    await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1', [tokenHash]);
    return { tokenHash: row.token_hash, accountId: row.account_id, createdAt: row.created_at, expiresAt: row.expires_at, usedAt: new Date().toISOString() };
  }
  const tokens = readJsonArray<PasswordResetToken>(RESET_TOKENS_FILE);
  const token = tokens.find((t) => t.tokenHash === tokenHash);
  if (!token || token.usedAt || new Date(token.expiresAt) < now) return null;
  token.usedAt = new Date().toISOString();
  writeJsonArray(RESET_TOKENS_FILE, tokens);
  return token;
}

// Same hash-and-store shape as the password-reset token above, kept as its
// own table so a verification link can never double as a password-reset
// link or vice versa.
async function createEmailVerificationToken(accountId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString('base64url');
  const token: EmailVerificationToken = {
    tokenHash: hashResetToken(raw),
    accountId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString(),
  };
  if (pool) {
    await pool.query(
      'INSERT INTO email_verification_tokens (token_hash, account_id, created_at, expires_at) VALUES ($1,$2,$3,$4)',
      [token.tokenHash, token.accountId, token.createdAt, token.expiresAt]
    );
  } else {
    const tokens = readJsonArray<EmailVerificationToken>(VERIFY_TOKENS_FILE);
    tokens.push(token);
    writeJsonArray(VERIFY_TOKENS_FILE, tokens);
  }
  return raw;
}

async function consumeEmailVerificationToken(raw: string): Promise<EmailVerificationToken | null> {
  const tokenHash = hashResetToken(raw);
  const now = new Date();
  if (pool) {
    const r = await pool.query('SELECT * FROM email_verification_tokens WHERE token_hash = $1', [tokenHash]);
    const row = r.rows[0];
    if (!row || row.used_at || new Date(row.expires_at) < now) return null;
    await pool.query('UPDATE email_verification_tokens SET used_at = now() WHERE token_hash = $1', [tokenHash]);
    return { tokenHash: row.token_hash, accountId: row.account_id, createdAt: row.created_at, expiresAt: row.expires_at, usedAt: new Date().toISOString() };
  }
  const tokens = readJsonArray<EmailVerificationToken>(VERIFY_TOKENS_FILE);
  const token = tokens.find((t) => t.tokenHash === tokenHash);
  if (!token || token.usedAt || new Date(token.expiresAt) < now) return null;
  token.usedAt = new Date().toISOString();
  writeJsonArray(VERIFY_TOKENS_FILE, tokens);
  return token;
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function isValidPassword(pw: unknown): pw is string {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;
}

// Sends via Resend's REST API directly (a plain fetch) rather than adding
// their SDK as a dependency for two call sites. A missing key logs and
// no-ops instead of failing signup/reset — email delivery shouldn't be able
// to break the rest of auth.
async function sendEmail(toEmail: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY not set — skipping email send ("${subject}").`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'KNKU <onboarding@resend.dev>',
        to: [toEmail],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error('Resend email send failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Resend email send error:', err);
  }
}

async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  await sendEmail(
    toEmail,
    'Reset your KNKU password',
    `<p>We received a request to reset your KNKU password.</p><p><a href="${resetUrl}">Click here to set a new password</a>. This link expires in 30 minutes.</p><p>If you didn't request this, you can safely ignore this email.</p>`
  );
}

async function sendVerificationEmail(toEmail: string, verifyUrl: string): Promise<void> {
  await sendEmail(
    toEmail,
    'Verify your KNKU email',
    `<p>Confirm this is your email address to finish securing your KNKU account.</p><p><a href="${verifyUrl}">Click here to verify your email</a>. This link expires in 24 hours.</p><p>If you didn't request this, you can safely ignore this email.</p>`
  );
}

function setSessionCookie(res: express.Response, sessionId: string) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Optional/best-effort — a missing or invalid session cookie does NOT reject
// the request, so legacy devices that haven't logged in yet keep working
// unchanged. Routes that require a real login check `req.authSession` for
// themselves (see /api/auth/logout, /change-password, /me below).
async function resolveSession(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const sid = req.signedCookies?.[SESSION_COOKIE];
    if (sid && typeof sid === 'string') {
      const session = await findValidSession(sid);
      if (session) {
        req.authSession = { accountId: session.accountId, householdId: session.householdId, role: session.role };
      }
    }
  } catch (err) {
    console.error('resolveSession failed:', err);
  }
  next();
}

// The single point of truth for "who is making this request" across the
// ownership-enforcement routes below: a verified session always wins; the
// client-claimed body field is only trusted as a fallback for devices that
// haven't logged in yet (Phase A of the rollout — see the plan this shipped
// from). `bodyValue` is whatever field that route already reads (different
// routes historically used different names: authenticatedSpender, approvedBy,
// requestedBy).
function ownerSpender(req: express.Request, bodyValue: unknown): SpenderId | null {
  if (req.authSession?.role) return req.authSession.role;
  return bodyValue === 'husband' || bodyValue === 'wife' ? bodyValue : null;
}

// Web Push is only wired up once real VAPID keys are configured — without them
// every push send is a silent no-op rather than a crash, so the rest of the app
// (including the in-app alert half of a notification) still works.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

function otherSpender(role: SpenderId): SpenderId {
  return role === 'husband' ? 'wife' : 'husband';
}

// Sends a push to whichever device is registered for `role` in this household,
// if any. Clears a subscription the push service reports as gone (410/404 —
// e.g. the PWA was uninstalled) so we stop wasting sends on it.
async function sendPushToRole(
  state: LedgerState,
  householdId: string,
  role: SpenderId,
  payload: { title: string; body: string; tag?: string }
): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  const device = state.connectedDevices.find((d) => d.owner === role);
  if (!device?.pushSubscription) return;

  try {
    await webpush.sendNotification(
      device.pushSubscription as any,
      JSON.stringify(payload)
    );
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      device.pushSubscription = undefined;
      await persistHouseholdState(householdId, state);
    } else {
      console.error(`Push to ${role} failed:`, err?.message || err);
    }
  }
}

// Notifies the *other* spender the moment a real transaction is created —
// both as an in-app alert (always) and a push (if they've subscribed).
// Called right after a transaction is added, before the state is persisted,
// so the alert lands in the same write.
function notifyExpenseAdded(state: LedgerState, householdId: string, addedBy: SpenderId, tx: Transaction) {
  const other = otherSpender(addedBy);
  const spenderName = addedBy === 'husband' ? state.husbandName : state.wifeName;

  state.alerts.unshift({
    id: `alert-expense-${Date.now()}`,
    type: 'expense_added',
    title: 'New expense logged',
    message: `${spenderName} added ₹${tx.amount.toLocaleString('en-IN')} for ${tx.title}.`,
    timestamp: 'Just now',
    read: false,
    forSpender: other,
  });

  // Fire-and-forget — a slow/failed push should never block the transaction
  // write it's reporting on.
  sendPushToRole(state, householdId, other, {
    title: 'New expense logged',
    body: `${spenderName} added ₹${tx.amount.toLocaleString('en-IN')} for ${tx.title}.`,
    tag: 'expense-added',
  }).catch(() => {});
}

// Resolves which household a request is for (from the X-Household-Id header,
// defaulting to the legacy household for any client that hasn't been upgraded to
// send one yet) and loads its state onto the request — every handler below reads
// and mutates `req.householdState`, never a shared global, so concurrent requests
// for different households can't cross-contaminate each other mid-`await`.
async function resolveHousehold(req: express.Request, res: express.Response, next: express.NextFunction) {
  // A verified session (see resolveSession, mounted before this everywhere
  // it matters) always wins over the header — a stale or forged
  // X-Household-Id becomes irrelevant the moment someone is logged in.
  const headerValue = req.header('X-Household-Id');
  const id = req.authSession?.householdId ?? (headerValue ? headerValue.trim() : DEFAULT_HOUSEHOLD_ID);

  if (!isValidHouseholdId(id)) {
    return res.status(400).json({ error: 'Invalid household id' });
  }

  const state = await loadHouseholdState(id);
  if (!state) {
    return res.status(404).json({ error: 'Household not found. Check your invite link.' });
  }

  if (pruneExpiredLockResetRequests(state)) {
    persistHouseholdState(id, state).catch((err) => console.error('Failed to persist pruned state:', err));
  }

  req.householdId = id;
  req.householdState = state;
  next();
}

// Lazy-initialized Gemini client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// Bank/UPI SMS usually carry the actual transaction date & time in the text
// itself (e.g. "on 15-09-26", "15-Sep-2026 19:06:23", "at 07:06 PM") rather
// than arriving the moment the spend happened — so a naive "date: now" loses
// that. Pull it out of the raw text with regex instead of trusting an LLM to
// do date arithmetic; falls back to null (caller uses "now") if nothing matches.
const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Guard against a false-positive date match (a card number fragment, a
// hallucinated LLM date) that resolves implausibly far in the future or
// past — a transaction SMS is essentially always about "now" or the past.
function isPlausibleTransactionDate(d: Date): boolean {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const fiveYearsMs = 5 * 365 * oneDayMs;
  return d.getTime() <= now + oneDayMs && d.getTime() >= now - fiveYearsMs;
}

// Gemini reads dates far more flexibly than any regex (odd phrasing,
// relative dates, unfamiliar formats), so its own dateTime field is trusted
// first when present and sane — extractDateTimeFromSms remains the fallback
// for when Gemini omits it or isn't configured at all.
function geminiDate(dateTime: unknown): string | null {
  if (!dateTime || typeof dateTime !== 'string') return null;
  const parsed = new Date(dateTime);
  if (isNaN(parsed.getTime()) || !isPlausibleTransactionDate(parsed)) return null;
  return parsed.toISOString();
}

function extractDateTimeFromSms(sms: string): string | null {
  // Indian bank/UPI SMS use a surprising variety of date shapes: ISO
  // year-first (some card alerts glue it straight onto the time), the usual
  // day-first "15-Sep-26" / "15/09/2026" with any of -, /, ., or a plain
  // space as the separator (occasionally with a "16th" ordinal), and less
  // commonly a US-style month-first "Sep 16, 2026". Tried in that order,
  // since each shape's first token (4-digit year, digit day, or letter
  // month) makes them unambiguous to tell apart.
  const isoDateMatch = sms.match(/\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  const dayFirstMatch = sms.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?[-\/.,\s]+([A-Za-z]{3,9}|\d{1,2})[-\/.,\s]+(\d{2,4})\b/
  );
  const monthFirstMatch = sms.match(
    /\b([A-Za-z]{3,9})[-\/.,\s]+(\d{1,2})(?:st|nd|rd|th)?[-\/.,\s]+(\d{2,4})\b/
  );

  let day: number;
  let month: number | undefined;
  let year: number;
  let matchedDateText: string;

  if (isoDateMatch) {
    year = parseInt(isoDateMatch[1], 10);
    month = parseInt(isoDateMatch[2], 10) - 1;
    day = parseInt(isoDateMatch[3], 10);
    matchedDateText = isoDateMatch[0];
  } else if (dayFirstMatch) {
    day = parseInt(dayFirstMatch[1], 10);
    const monthPart = dayFirstMatch[2];
    month = /^\d+$/.test(monthPart)
      ? parseInt(monthPart, 10) - 1
      : MONTH_ABBR[monthPart.slice(0, 3).toLowerCase()];
    year = parseInt(dayFirstMatch[3], 10);
    if (year < 100) year += 2000;
    matchedDateText = dayFirstMatch[0];
  } else if (monthFirstMatch) {
    month = MONTH_ABBR[monthFirstMatch[1].slice(0, 3).toLowerCase()];
    day = parseInt(monthFirstMatch[2], 10);
    year = parseInt(monthFirstMatch[3], 10);
    if (year < 100) year += 2000;
    matchedDateText = monthFirstMatch[0];
  } else {
    return null;
  }

  if (month === undefined || month < 0 || month > 11 || day < 1 || day > 31) return null;

  // Search for a time everywhere EXCEPT inside the matched date itself — some
  // banks glue date and time together with no separator (as above), and the
  // date's own digits can otherwise look like a stray "HH:MM" to this regex.
  const smsWithoutDate = sms.replace(matchedDateText, '');
  let hours = 12;
  let minutes = 0;
  let seconds = 0;
  const timeMatch = smsWithoutDate.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const meridiem = timeMatch[4]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  }

  const parsed = new Date(year, month, day, hours, minutes, seconds);
  if (isNaN(parsed.getTime()) || !isPlausibleTransactionDate(parsed)) return null;

  return parsed.toISOString();
}

// Heuristic fallback SMS parser
function parseSmsHeuristic(
  sms: string,
  defaultSpender: 'husband' | 'wife' = 'husband',
  husbandName = 'your partner',
  wifeName = 'your partner'
): Partial<Transaction> {
  const cleanSms = sms.trim();
  
  // Extract amount: e.g. Rs. 2,500.00, INR 1,420, Rs 3850
  let amount = 0;
  const amountMatch = cleanSms.match(/(?:Rs\.?|INR|Rs)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                      cleanSms.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:debited|spent|withdrawn|charged)/i);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, '')) || 0;
  }

  // Type: debit vs credit. Bank SMS for a UPI transfer often mention BOTH
  // sides in one message — e.g. "Acct debited for Rs 40; Minhajul Karim
  // credited" — where "credited" describes the payee, not the user's own
  // account. Checking for "credited" alone misreads that as an incoming
  // payment, so "debited" (money leaving the user's account) wins whenever
  // both keywords are present.
  const hasDebitKeyword = /debited|spent|withdrawn|charged|paid/i.test(cleanSms);
  const hasCreditKeyword = /credited|received|refund|deposited/i.test(cleanSms);
  const type: 'debit' | 'credit' = hasDebitKeyword ? 'debit' : hasCreditKeyword ? 'credit' : 'debit';

  // Detect payment mode
  let paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'AmazonPayLater' | 'Pluxee' = 'UPI';
  if (/ATM|withdrawn|cash/i.test(cleanSms)) {
    paymentMode = 'Cash';
  } else if (/amazon\s*pay\s*later/i.test(cleanSms)) {
    paymentMode = 'AmazonPayLater';
  } else if (/pluxee|sodexo/i.test(cleanSms)) {
    paymentMode = 'Pluxee';
  } else if (/Card|ending|POS|spent at/i.test(cleanSms)) {
    paymentMode = 'Card';
  } else if (/NetBanking|NEFT|RTGS|NACH|mandate/i.test(cleanSms)) {
    paymentMode = 'NetBanking';
  }

  // Detect bank
  let bankName = 'UPI Bank';
  if (/HDFC/i.test(cleanSms)) bankName = 'HDFC Bank';
  else if (/ICICI/i.test(cleanSms)) bankName = 'ICICI Bank';
  else if (/SBI|State Bank/i.test(cleanSms)) bankName = 'SBI';
  else if (/Axis/i.test(cleanSms)) bankName = 'Axis Bank';
  else if (/Kotak/i.test(cleanSms)) bankName = 'Kotak Bank';

  // UPI Ref
  let upiRef = '';
  const refMatch = cleanSms.match(/(?:Ref|Txn|ID|txn)[:\s]+([A-Za-z0-9]+)/i);
  if (refMatch) upiRef = refMatch[1];

  // Detect Merchant / Payee
  let title = 'Recent Transaction';
  let category: CategoryId = 'bills';
  let isGreyArea = false;
  let greyAreaReason = '';
  let contextQuestion = '';

  const lower = cleanSms.toLowerCase();

  if (paymentMode === 'Cash' || /atm/i.test(lower)) {
    title = 'ATM Cash Withdrawal';
    category = 'grey_area';
    isGreyArea = true;
    greyAreaReason = 'Cash withdrawal intent (groceries, maid salary, or personal cash)';
    contextQuestion = `Hey ${defaultSpender === 'husband' ? husbandName : wifeName}, was this cash withdrawal for household expenses (cook/maid salary) or personal pocket cash?`;
  } else if (/swiggy|zomato|starbucks|mcdonald|restaurant|cafe|bistro|dining|eatclub|pizza/i.test(lower)) {
    const m = cleanSms.match(/to\s+([A-Z0-9\s]+?)(?:ref|via|on|\.|$)/i);
    title = m ? m[1].trim() : 'Food & Dining Order';
    category = 'dining';
  } else if (/blinkit|zepto|instamart|bigbasket|grofers|dmart|supermarket|kirana|nature'?s basket/i.test(lower)) {
    const m = cleanSms.match(/to\s+([A-Z0-9\s]+?)(?:ref|via|on|\.|$)/i);
    title = m ? m[1].trim() : 'Groceries & Household';
    category = 'groceries';
  } else if (/bescom|electricity|bill|rent|wifi|fibernet|act|airtel|jio|maintenance|water/i.test(lower)) {
    const m = cleanSms.match(/to\s+([A-Z0-9\s]+?)(?:ref|via|on|\.|$)/i);
    title = m ? m[1].trim() : 'Utility & Bill Payment';
    category = 'bills';
  } else if (/zara|myntra|amazon|flipkart|h&m|ajio|shopping|apparel/i.test(lower)) {
    const m = cleanSms.match(/at\s+([A-Z0-9\s]+?)(?:on|ref|\.|$)/i);
    title = m ? m[1].trim() : 'Retail & Shopping';
    category = 'shopping';
  } else if (/uber|ola|rapido|shell|fuel|petrol|hpcl|iocl|toll|fastag/i.test(lower)) {
    const m = cleanSms.match(/to\s+([A-Z0-9\s]+?)(?:ref|via|on|\.|$)/i);
    title = m ? m[1].trim() : 'Travel & Fuel';
    category = 'transport';
  } else if (/cult|pharmacy|apollo|1mg|doctor|clinic|hospital|wellness/i.test(lower)) {
    title = 'Health & Pharmacy';
    category = 'health';
  } else if (/google\s*play|apple\s*media|apple\.com|itunes|app\s*store|subscription|netflix|spotify|prime\s*(video)?|linkedin|icloud/i.test(lower)) {
    title = 'Subscription';
    category = 'subscription';
  } else if (/hotstar|cinema|pvr|inox/i.test(lower)) {
    title = 'Entertainment';
    category = 'entertainment';
  } else if (/groww|zerodha|sip|mutual fund|uti|hdfc mf|etf/i.test(lower)) {
    title = 'Investment SIP';
    category = 'investments';
  } else {
    // Ambiguous UPI to person / number — the payee is named either as
    // "...to NAME" or, in ICICI-style two-sided messages, as "NAME credited".
    const personMatch =
      cleanSms.match(/to\s+([A-Za-z\s]+?)(?:\s*\([^\)]*\)|\s*ref|\s*on|\s*via|\.|$)/i) ||
      cleanSms.match(/;\s*([A-Za-z][A-Za-z\s]{2,40}?)\s+credited/i);
    if (personMatch && personMatch[1].trim().length > 2) {
      title = `UPI to ${personMatch[1].trim()}`;
    } else {
      title = 'UPI Peer Transfer';
    }
    category = 'grey_area';
    isGreyArea = true;
    greyAreaReason = 'Direct peer transfer to an individual without merchant invoice';
    contextQuestion = `Hey ${defaultSpender === 'husband' ? husbandName : wifeName}, was this ${amount ? '₹' + amount.toLocaleString('en-IN') : 'UPI'} transfer to ${title} for a household expense or personal loan/split?`;
  }

  return {
    title,
    amount: amount || 500,
    type,
    category,
    paymentMode,
    bankName,
    upiRef: upiRef || `UPI-${Date.now().toString().slice(-6)}`,
    status: isGreyArea ? 'grey_area' : 'verified',
    greyAreaReason,
    contextQuestion,
    spender: defaultSpender,
    date: extractDateTimeFromSms(cleanSms) || new Date().toISOString(),
  };
}

// ------------------- API ROUTES -------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create a brand new, empty household and return its id — the invite "password"
// the creator shares with their partner. This is the only place a new household
// id is ever allocated; every other route 404s on an id it doesn't recognize
// rather than silently creating one.
app.post('/api/household/create', rateLimit(10, 60000), async (req, res) => {
  try {
    const id = generateHouseholdId();
    const state = backfillLedgerState(JSON.parse(JSON.stringify(EMPTY_LEDGER_STATE)));
    await persistHouseholdState(id, state);
    res.json({ success: true, householdId: id, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while creating the household.' });
  }
});

// Fired by an external scheduler (Render's free plan sleeps, so an in-process
// timer can't be trusted to run at a fixed time) once a day, guarded by a
// shared secret rather than X-Household-Id since it sweeps every household:
// - nudges whichever spouse hasn't logged an expense today
// - flags any recurring bill (see recurringDetector) due in the next 3 days
app.post('/api/cron/daily-reminder', async (req, res) => {
  if (!process.env.CRON_SECRET || req.header('X-Cron-Secret') !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const householdIds = await listHouseholdIds();
  const results: Record<string, string> = {};

  for (const id of householdIds) {
    try {
      const state = await loadHouseholdState(id);
      if (!state || state.lastReminderRun === today) {
        results[id] = 'skipped';
        continue;
      }

      const rolesMissingToday = (['husband', 'wife'] as SpenderId[]).filter(
        (role) =>
          !state.transactions.some(
            (t) => t.spender === role && t.type === 'debit' && t.date.slice(0, 10) === today
          )
      );

      for (const role of rolesMissingToday) {
        state.alerts.unshift({
          id: `alert-reminder-${role}-${Date.now()}`,
          type: 'daily_reminder',
          title: "Don't forget today's expenses",
          message: "You haven't logged any expenses today — add them before you forget.",
          timestamp: 'Just now',
          read: false,
          forSpender: role,
        });
        await sendPushToRole(state, id, role, {
          title: 'Family Ledger',
          body: "Don't forget to log today's expenses.",
          tag: 'daily-reminder',
        });
      }

      const dueSoon = detectRecurringGroups(state.transactions).filter((g) => {
        const daysUntil = (new Date(g.nextExpectedDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        return daysUntil >= 0 && daysUntil <= 3;
      });

      for (const group of dueSoon) {
        for (const role of ['husband', 'wife'] as SpenderId[]) {
          state.alerts.unshift({
            id: `alert-recurring-${role}-${group.title}-${Date.now()}`,
            type: 'recurring_due',
            title: 'Recurring expense due soon',
            message: `${group.title} (~₹${Math.round(group.avgAmount).toLocaleString('en-IN')}) usually recurs around now.`,
            timestamp: 'Just now',
            read: false,
            forSpender: role,
          });
          await sendPushToRole(state, id, role, {
            title: 'Recurring expense due soon',
            body: `${group.title} (~₹${Math.round(group.avgAmount).toLocaleString('en-IN')}) usually recurs around now.`,
            tag: `recurring-${group.title}`,
          });
        }
      }

      state.lastReminderRun = today;
      await persistHouseholdState(id, state);
      results[id] = 'sent';
    } catch (err) {
      console.error(`Daily reminder failed for household ${id}:`, err);
      results[id] = 'error';
    }
  }

  res.json({ success: true, results });
});

// ------------------- AUTH ROUTES -------------------
// Email is the login identifier (doubles as the recovery destination — no
// separate "recovery email" field). Each household has exactly two accounts,
// one per role, created via signup below.

app.post('/api/auth/signup', rateLimit(10, 60000), resolveHousehold, async (req, res) => {
  try {
    const state = req.householdState!;
    const householdId = req.householdId!;
    const emailNormalized = normalizeEmail(req.body?.email);
    const rawPassword = req.body?.password;
    const role: unknown = req.body?.role;

    if (!emailNormalized) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!isValidPassword(rawPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (role !== 'husband' && role !== 'wife') {
      return res.status(400).json({ error: 'role must be "husband" or "wife"' });
    }

    const existingForRole = await findAccountByHouseholdRole(householdId, role);
    if (existingForRole) {
      const ownerName = role === 'husband' ? state.husbandName : state.wifeName;
      return res.status(409).json({ error: `${ownerName} already has a login for this household.` });
    }
    const existingForEmail = await findAccountByEmail(emailNormalized);
    if (existingForEmail) {
      return res.status(409).json({ error: 'This email is already registered — log in instead.' });
    }

    const passwordHash = await bcrypt.hash(rawPassword, 12);
    const account: Account = {
      id: crypto.randomBytes(9).toString('base64url'),
      householdId,
      role,
      email: sanitizeString(req.body.email, 254) || emailNormalized,
      emailNormalized,
      passwordHash,
      emailVerified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await insertAccount(account);

    const session = await createSession(account, req.header('User-Agent'));
    setSessionCookie(res, session.id);

    // Fire-and-forget — verification is a nice-to-have that shouldn't block
    // or fail the signup response itself if Resend has a hiccup.
    createEmailVerificationToken(account.id)
      .then((rawToken) => {
        const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
        return sendVerificationEmail(account.email, `${appUrl}/verify-email?token=${rawToken}`);
      })
      .catch((err) => console.error('Could not send verification email:', err));

    res.json({
      success: true,
      account: { id: account.id, email: account.email, role: account.role, householdId, emailVerified: false },
    });
  } catch (err) {
    console.error('Signup failed:', err);
    res.status(500).json({ error: 'An error occurred while creating your login.' });
  }
});

// Lets the client know which of the two roles already has a login — used to
// auto-infer an invited partner's role (whichever slot is still open) and to
// decide whether the migration prompt should appear for an existing device.
app.get('/api/auth/household-status', resolveHousehold, async (req, res) => {
  try {
    const householdId = req.householdId!;
    const [husband, wife] = await Promise.all([
      findAccountByHouseholdRole(householdId, 'husband'),
      findAccountByHouseholdRole(householdId, 'wife'),
    ]);
    res.json({ husbandHasAccount: !!husband, wifeHasAccount: !!wife });
  } catch (err) {
    console.error('household-status failed:', err);
    res.status(500).json({ error: 'An error occurred.' });
  }
});

// Not household-scoped — the email alone finds the household. Deliberately
// generic error on any failure (wrong email vs wrong password) so a login
// attempt can't be used to enumerate registered emails.
app.post('/api/auth/login', rateLimit(10, 60000), async (req, res) => {
  try {
    const emailNormalized = normalizeEmail(req.body?.email);
    const rawPassword = req.body?.password;
    if (!emailNormalized || typeof rawPassword !== 'string') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const account = await findAccountByEmail(emailNormalized);
    if (!account || !(await bcrypt.compare(rawPassword, account.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const session = await createSession(account, req.header('User-Agent'));
    setSessionCookie(res, session.id);
    res.json({
      success: true,
      householdId: account.householdId,
      role: account.role,
      email: account.email,
      emailVerified: account.emailVerified,
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'An error occurred while logging in.' });
  }
});

app.post('/api/auth/logout', resolveSession, async (req, res) => {
  try {
    const sid = req.signedCookies?.[SESSION_COOKIE];
    if (sid) await revokeSession(sid);
    clearSessionCookie(res);
    res.json({ success: true });
  } catch (err) {
    console.error('Logout failed:', err);
    res.status(500).json({ error: 'An error occurred while logging out.' });
  }
});

// Always returns the same response regardless of whether the email is
// registered — the whole point is that a failed attempt can't be used to
// find out who has an account.
app.post('/api/auth/forgot-password', rateLimit(5, 60000), async (req, res) => {
  try {
    const emailNormalized = normalizeEmail(req.body?.email);
    if (emailNormalized) {
      const account = await findAccountByEmail(emailNormalized);
      if (account) {
        const rawToken = await createPasswordResetToken(account.id);
        const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
        await sendPasswordResetEmail(account.email, `${appUrl}/reset-password?token=${rawToken}`);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Forgot-password failed:', err);
    res.json({ success: true });
  }
});

app.post('/api/auth/reset-password', rateLimit(10, 60000), async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ error: 'Missing reset token.' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const consumed = await consumePasswordResetToken(token);
    if (!consumed) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await updateAccountPassword(consumed.accountId, passwordHash);
    await revokeAllSessionsForAccount(consumed.accountId);
    res.json({ success: true });
  } catch (err) {
    console.error('Reset-password failed:', err);
    res.status(500).json({ error: 'An error occurred while resetting your password.' });
  }
});

app.post('/api/auth/change-password', resolveSession, async (req, res) => {
  try {
    if (!req.authSession) {
      return res.status(401).json({ error: 'You need to be logged in to change your password.' });
    }
    const { currentPassword, newPassword } = req.body || {};
    const account = await findAccountById(req.authSession.accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    await updateAccountPassword(account.id, await bcrypt.hash(newPassword, 12));
    res.json({ success: true });
  } catch (err) {
    console.error('Change-password failed:', err);
    res.status(500).json({ error: 'An error occurred while changing your password.' });
  }
});

// Used on client boot to silently skip the login screen when a valid session
// cookie already exists.
app.get('/api/auth/me', resolveSession, async (req, res) => {
  try {
    if (!req.authSession) {
      return res.json({ authenticated: false });
    }
    const account = await findAccountById(req.authSession.accountId);
    if (!account) {
      return res.json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      email: account.email,
      role: account.role,
      householdId: account.householdId,
      emailVerified: account.emailVerified,
    });
  } catch (err) {
    console.error('/api/auth/me failed:', err);
    res.json({ authenticated: false });
  }
});

// Diagnostic only — reports whether email-sending is configured, never the
// secret values themselves. Gated behind an active login session so it's
// not publicly probeable.
app.get('/api/auth/debug-email-config', resolveSession, async (req, res) => {
  if (!req.authSession) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  res.json({
    resendApiKeySet: !!process.env.RESEND_API_KEY,
    resendFromEmailSet: !!process.env.RESEND_FROM_EMAIL,
    appUrlSet: !!process.env.APP_URL,
    appUrlValue: process.env.APP_URL || null,
  });
});

// Re-sends the verification link — used by Account Settings' "Resend" when
// the first email didn't arrive, or an existing unverified account wants
// another shot at it. Rate-limited per-IP the same as everything else here.
app.post('/api/auth/send-verification', rateLimit(5, 60000), resolveSession, async (req, res) => {
  try {
    if (!req.authSession) {
      return res.status(401).json({ error: 'You need to be logged in to verify your email.' });
    }
    const account = await findAccountById(req.authSession.accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    if (account.emailVerified) {
      return res.json({ success: true, alreadyVerified: true });
    }
    const rawToken = await createEmailVerificationToken(account.id);
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    await sendVerificationEmail(account.email, `${appUrl}/verify-email?token=${rawToken}`);
    res.json({ success: true, alreadyVerified: false });
  } catch (err) {
    console.error('send-verification failed:', err);
    res.status(500).json({ error: 'An error occurred while sending the verification email.' });
  }
});

app.post('/api/auth/verify-email', rateLimit(10, 60000), async (req, res) => {
  try {
    const { token } = req.body || {};
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ error: 'Missing verification token.' });
    }
    const consumed = await consumeEmailVerificationToken(token);
    if (!consumed) {
      return res.status(400).json({ error: 'This verification link is invalid or has expired.' });
    }
    await markAccountEmailVerified(consumed.accountId);
    res.json({ success: true });
  } catch (err) {
    console.error('verify-email failed:', err);
    res.status(500).json({ error: 'An error occurred while verifying your email.' });
  }
});

// Every route below operates on a specific household, resolved from a
// verified login session if one exists, else the X-Household-Id header
// (defaulting to the legacy pre-multi-tenancy household).
app.use('/api/ledger', resolveSession, resolveHousehold);
app.use('/api/household/setup', resolveSession, resolveHousehold);
app.use('/api/household/update', resolveSession, resolveHousehold);
app.use('/api/parse-sms', resolveSession, resolveHousehold);

// Get current state
app.get('/api/ledger', (req, res) => {
  res.json(req.householdState);
});

// Full state sync from client
app.post('/api/ledger/sync', async (req, res) => {
  try {
    const state = req.householdState!;
    const incoming = req.body as Partial<LedgerState>;
    if (incoming.transactions) {
      state.transactions = incoming.transactions;
    }
    if (incoming.goals) {
      state.goals = incoming.goals;
    }
    if (incoming.alerts) {
      state.alerts = incoming.alerts;
    }
    if (incoming.categories) {
      state.categories = incoming.categories;
    }
    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// Add new transaction
app.post('/api/ledger/transaction', rateLimit(60, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const rawTx = req.body as Partial<Transaction>;
    if (!rawTx || typeof rawTx !== 'object') {
      return res.status(400).json({ error: 'Invalid transaction payload' });
    }

    const cleanTitle = sanitizeString(rawTx.title, 90);
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Transaction title is required' });
    }

    const amountNum = Number(rawTx.amount);
    if (!isFinite(amountNum) || amountNum <= 0 || amountNum > 50000000) {
      return res.status(400).json({ error: 'Amount must be a positive number under ₹5,00,00,000' });
    }

    // An unrecognized category (a deleted category, a stale client, an
    // SMS-suggested category that doesn't exist yet) used to silently land
    // in "Bills" — a real spending category, with zero signal that anything
    // was substituted. Falling back to the household's reserved grey-area
    // bucket instead makes the substitution visible rather than confusing.
    const categoryFellBack = !getValidCategoryIds(state).includes(rawTx.category as string);
    const category: CategoryId = categoryFellBack ? 'grey_area' : (rawTx.category as CategoryId);

    const spender: SpenderId = rawTx.spender === 'wife' ? 'wife' : 'husband';
    const type: 'debit' | 'credit' = rawTx.type === 'credit' ? 'credit' : 'debit';
    const paymentMode: 'UPI' | 'Card' | 'NetBanking' | 'Cash' | 'AmazonPayLater' | 'Pluxee' =
      ['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'Pluxee'].includes(rawTx.paymentMode as any)
        ? (rawTx.paymentMode as any)
        : 'UPI';

    const tx: Transaction = {
      id: rawTx.id && typeof rawTx.id === 'string' ? sanitizeString(rawTx.id, 50) : `tx-${Date.now()}`,
      title: cleanTitle,
      amount: amountNum,
      type,
      date: rawTx.date && !isNaN(Date.parse(rawTx.date)) ? rawTx.date : new Date().toISOString(),
      spender,
      category,
      paymentMode,
      upiRef: sanitizeString(rawTx.upiRef, 60) || undefined,
      bankName: sanitizeString(rawTx.bankName, 50) || undefined,
      rawSms: rawTx.rawSms ? maskSensitiveFinancialData(rawTx.rawSms) : undefined,
      status: categoryFellBack
        ? 'grey_area'
        : rawTx.status === 'grey_area'
        ? 'grey_area'
        : rawTx.status === 'resolved'
        ? 'resolved'
        : 'verified',
      greyAreaReason: categoryFellBack
        ? "Original category no longer exists on this household — recheck and recategorize."
        : sanitizeString(rawTx.greyAreaReason, 150) || undefined,
      contextQuestion: categoryFellBack
        ? undefined
        : sanitizeString(rawTx.contextQuestion, 200) || undefined,
      notes: sanitizeString(rawTx.notes, 250) || undefined,
      isRecurring: rawTx.isRecurring === true || undefined,
    };

    state.transactions.unshift(tx);
    state.lastSyncTime = new Date().toISOString();
    notifyExpenseAdded(state, req.householdId!, spender, tx);

    // Check if budget exceeded for this category — scoped to the current
    // billing cycle (same window the client uses), so this stays a "monthly"
    // figure instead of climbing against all-time spend forever.
    const cat = state.categories.find((c) => c.id === tx.category);
    if (cat && cat.budgetMonthly > 0) {
      const totalSpent = state.transactions
        .filter((t) => t.category === cat.id && t.type === 'debit' && isInCurrentBillingCycle(t.date))
        .reduce((sum, t) => sum + t.amount, 0);

      const pct = (totalSpent / cat.budgetMonthly) * 100;
      if (pct >= 100) {
        state.alerts.unshift({
          id: `alert-budget-${Date.now()}`,
          type: 'critical',
          title: `Budget Exceeded: ${cat.name}`,
          message: `Monthly spend of ₹${totalSpent.toLocaleString('en-IN')} has exceeded the ₹${cat.budgetMonthly.toLocaleString('en-IN')} budget (${Math.round(pct)}%).`,
          timestamp: 'Just now',
          read: false,
          actionType: 'view_budget',
          targetId: cat.id,
        });
      } else if (pct >= 85) {
        state.alerts.unshift({
          id: `alert-budget-${Date.now()}`,
          type: 'warning',
          title: `Budget Alert: ${cat.name} at ${Math.round(pct)}%`,
          message: `You've spent ₹${totalSpent.toLocaleString('en-IN')} of your ₹${cat.budgetMonthly.toLocaleString('en-IN')} limit.`,
          timestamp: 'Just now',
          read: false,
          actionType: 'view_budget',
          targetId: cat.id,
        });
      }
    }

    // If grey area, trigger an alert
    if (tx.status === 'grey_area') {
      state.alerts.unshift({
        id: `alert-grey-${Date.now()}`,
        type: 'grey_area',
        title: `Context Needed: ${tx.title}`,
        message: tx.greyAreaReason || `Please clarify if ₹${tx.amount.toLocaleString('en-IN')} is a shared or personal expense.`,
        timestamp: 'Just now',
        read: false,
        actionType: 'resolve_grey',
        targetId: tx.id,
      });
    }

    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, transaction: tx, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while adding the transaction.' });
  }
});

// Resolve grey area context
app.post('/api/ledger/resolve-grey', rateLimit(60, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { transactionId, category, note, title } = req.body;
    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'Valid transactionId is required' });
    }

    const tx = state.transactions.find((t) => t.id === transactionId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (category && getValidCategoryIds(state).includes(category)) {
      tx.category = category;
    }

    const cleanTitle = sanitizeString(title, 80);
    if (cleanTitle) {
      tx.title = cleanTitle;
    }

    tx.status = 'resolved';

    const cleanNote = sanitizeString(note, 200);
    tx.contextResolution = {
      note: cleanNote,
      resolvedAt: new Date().toISOString(),
    };
    if (cleanNote) {
      tx.notes = tx.notes ? `${tx.notes} • ${cleanNote}` : cleanNote;
    }

    // Dismiss associated grey area alert
    state.alerts = state.alerts.filter(
      (a) => !(a.actionType === 'resolve_grey' && a.targetId === transactionId)
    );

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, transaction: tx, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while resolving the transaction.' });
  }
});

// Flag an expense as "paid for the other spouse" — it's held here, entirely
// separate from the household's transactions, until the person it's for
// accepts it below. This is deliberate: it must never count toward any
// total/trend/category figure until then, so it can't just be a Transaction
// with a special status (every aggregation site would need to remember to
// exclude it).
app.post('/api/ledger/pending-ack', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { title, amount, category, paymentMode, notes, bankName, upiRef, rawSms, date, paidBy, paidFor } = req.body;

    const cleanTitle = sanitizeString(title, 90);
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const amountNum = Number(amount);
    if (!isFinite(amountNum) || amountNum <= 0 || amountNum > 50000000) {
      return res.status(400).json({ error: 'Amount must be a positive number under ₹5,00,00,000' });
    }

    if (paidBy !== 'husband' && paidBy !== 'wife') {
      return res.status(400).json({ error: 'Valid paidBy is required' });
    }
    if (paidFor !== 'husband' && paidFor !== 'wife') {
      return res.status(400).json({ error: 'Valid paidFor is required' });
    }
    if (paidBy === paidFor) {
      return res.status(400).json({ error: 'paidBy and paidFor must be different people' });
    }

    const validCategory: CategoryId = getValidCategoryIds(state).includes(category) ? category : 'grey_area';
    const validPaymentMode = ['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'Pluxee'].includes(paymentMode)
      ? paymentMode
      : 'UPI';

    const pending: PendingAcknowledgement = {
      id: `ack-${Date.now()}`,
      title: cleanTitle,
      amount: amountNum,
      date: date && !isNaN(Date.parse(date)) ? date : new Date().toISOString(),
      category: validCategory,
      paymentMode: validPaymentMode,
      notes: sanitizeString(notes, 250) || undefined,
      bankName: sanitizeString(bankName, 50) || undefined,
      upiRef: sanitizeString(upiRef, 60) || undefined,
      rawSms: rawSms ? maskSensitiveFinancialData(rawSms) : undefined,
      paidBy,
      paidFor,
      createdAt: new Date().toISOString(),
    };

    state.pendingAcknowledgements.unshift(pending);

    const payerName = paidBy === 'husband' ? state.husbandName : state.wifeName;
    state.alerts.unshift({
      id: `alert-ack-${Date.now()}`,
      type: 'ack_needed',
      title: `${payerName} paid for you`,
      message: `${payerName} logged ₹${amountNum.toLocaleString('en-IN')} for "${cleanTitle}" on your behalf — review it to add it to your spend.`,
      timestamp: 'Just now',
      read: false,
      actionType: 'review_ack',
      targetId: pending.id,
    });

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, pending, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while flagging the expense.' });
  }
});

// Accept a pending "paid for you" expense — becomes a real transaction
// attributed to the person it was for (not whoever physically paid),
// optionally with corrections applied first.
app.post('/api/ledger/pending-ack/accept', rateLimit(60, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { id, updates } = req.body;
    const authenticatedSpender = ownerSpender(req, req.body?.authenticatedSpender);
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Valid id is required' });
    }

    const idx = state.pendingAcknowledgements.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Pending item not found' });
    }
    const pending = state.pendingAcknowledgements[idx];

    if (authenticatedSpender && authenticatedSpender !== pending.paidFor) {
      return res.status(403).json({ error: 'Only the person this expense was for can accept it.' });
    }

    const title = sanitizeString(updates?.title, 90) || pending.title;
    const amount = updates?.amount && Number(updates.amount) > 0 ? Number(updates.amount) : pending.amount;
    const category: CategoryId =
      updates?.category && getValidCategoryIds(state).includes(updates.category) ? updates.category : pending.category;
    const notes = updates?.notes !== undefined ? sanitizeString(updates.notes, 250) || undefined : pending.notes;
    const date = updates?.date && !isNaN(Date.parse(updates.date)) ? updates.date : pending.date;

    const tx: Transaction = {
      id: `tx-ack-${Date.now()}`,
      title,
      amount,
      type: 'debit',
      date,
      spender: pending.paidFor,
      category,
      paymentMode: pending.paymentMode,
      upiRef: pending.upiRef,
      bankName: pending.bankName,
      rawSms: pending.rawSms,
      status: 'verified',
      notes,
    };

    state.transactions.unshift(tx);
    state.pendingAcknowledgements.splice(idx, 1);
    state.alerts = state.alerts.filter(
      (a) => !(a.actionType === 'review_ack' && a.targetId === id)
    );
    notifyExpenseAdded(state, req.householdId!, pending.paidFor, tx);

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, transaction: tx, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while accepting the expense.' });
  }
});

// Reject a pending "paid for you" expense — removed entirely; it never
// becomes a transaction.
app.post('/api/ledger/pending-ack/reject', rateLimit(60, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { id } = req.body;
    const authenticatedSpender = ownerSpender(req, req.body?.authenticatedSpender);
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Valid id is required' });
    }

    const idx = state.pendingAcknowledgements.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Pending item not found' });
    }
    const pending = state.pendingAcknowledgements[idx];

    if (authenticatedSpender && authenticatedSpender !== pending.paidFor) {
      return res.status(403).json({ error: 'Only the person this expense was for can reject it.' });
    }

    state.pendingAcknowledgements.splice(idx, 1);
    state.alerts = state.alerts.filter(
      (a) => !(a.actionType === 'review_ack' && a.targetId === id)
    );

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while rejecting the expense.' });
  }
});

const LOCK_RESET_TIMEOUT_MS = 15 * 60 * 1000;

// A device's local PIN is unrecoverable on its own (there's no server-known
// secret backing it) — the normal recovery path is asking the other partner to
// approve a reset from their own, already-unlocked device.
app.post('/api/ledger/lock-reset/request', rateLimit(10, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { requestedBy } = req.body;
    if (requestedBy !== 'husband' && requestedBy !== 'wife') {
      return res.status(400).json({ error: 'requestedBy must be "husband" or "wife"' });
    }

    // Idempotent: re-tapping "Forgot PIN" while a request is already pending
    // just returns the existing one instead of spawning duplicates/duplicate alerts.
    const existing = state.lockResetRequests.find((r) => r.requestedBy === requestedBy && r.status === 'pending');
    if (existing) {
      return res.json({ success: true, request: existing, ledger: state });
    }

    const now = new Date();
    const request: LockResetRequest = {
      id: `lockreset-${Date.now()}`,
      requestedBy,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LOCK_RESET_TIMEOUT_MS).toISOString(),
      status: 'pending',
    };
    state.lockResetRequests.push(request);

    const requesterName = requestedBy === 'husband' ? state.husbandName : state.wifeName;
    state.alerts.unshift({
      id: `alert-lockreset-${Date.now()}`,
      type: 'lock_reset_requested',
      title: `${requesterName} forgot their PIN`,
      message: `${requesterName} is locked out of their device and needs you to approve a PIN reset.`,
      timestamp: 'Just now',
      read: false,
      actionType: 'approve_lock_reset',
      targetId: request.id,
    });

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, request, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while requesting a PIN reset.' });
  }
});

// The other partner approves — the requester's own device picks this up on its
// next poll and sets a new PIN. Whoever asked can't approve their own request.
app.post('/api/ledger/lock-reset/approve', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { id } = req.body;
    const approvedBy = ownerSpender(req, req.body?.approvedBy);
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Valid id is required' });
    }

    pruneExpiredLockResetRequests(state);
    const request = state.lockResetRequests.find((r) => r.id === id);
    if (!request) {
      return res.status(404).json({ error: 'This request has expired or no longer exists.' });
    }
    if (approvedBy && approvedBy === request.requestedBy) {
      return res.status(403).json({ error: "You can't approve your own reset request." });
    }

    request.status = 'approved';
    state.alerts = state.alerts.filter((a) => !(a.actionType === 'approve_lock_reset' && a.targetId === id));

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while approving the PIN reset.' });
  }
});

// Either the requester (cancelling their own ask) or the other partner
// (declining it) removes the request the same way — no reset happens.
app.post('/api/ledger/lock-reset/deny', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { id } = req.body;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Valid id is required' });
    }

    state.lockResetRequests = state.lockResetRequests.filter((r) => r.id !== id);
    state.alerts = state.alerts.filter((a) => !(a.actionType === 'approve_lock_reset' && a.targetId === id));

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while denying the PIN reset.' });
  }
});

// The requester's device calls this once it notices its own request was
// approved, to clear it out of the ledger after actually using it.
app.post('/api/ledger/lock-reset/consume', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { id } = req.body;
    const requestedBy = ownerSpender(req, req.body?.requestedBy);
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Valid id is required' });
    }

    const idx = state.lockResetRequests.findIndex((r) => r.id === id);
    if (idx === -1) {
      return res.json({ success: true, ledger: state });
    }
    const request = state.lockResetRequests[idx];
    if (request.status !== 'approved' || (requestedBy && requestedBy !== request.requestedBy)) {
      return res.status(403).json({ error: 'This request cannot be consumed.' });
    }

    state.lockResetRequests.splice(idx, 1);
    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while completing the PIN reset.' });
  }
});

// Update an existing transaction with strict ownership check
app.post('/api/ledger/transaction/update', rateLimit(60, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const authenticatedSpender = ownerSpender(req, req.body?.authenticatedSpender);
    const transactionId = req.body.transactionId || req.body.transaction?.id;
    const updates = req.body.updates || req.body.transaction;

    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'Valid transactionId is required' });
    }

    const tx = state.transactions.find((t) => t.id === transactionId);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Strict Ownership Enforcement: Users cannot edit other spouse's expenses
    if (authenticatedSpender && tx.spender !== authenticatedSpender) {
      const ownerName = tx.spender === 'husband' ? state.husbandName : state.wifeName;
      return res.status(403).json({
        error: `Permission Denied: You cannot edit another person's expense. Only ${ownerName} can edit this entry.`,
      });
    }

    if (updates && typeof updates === 'object') {
      if (updates.title) {
        tx.title = sanitizeString(updates.title, 90);
      }
      if (updates.amount && Number(updates.amount) > 0) {
        tx.amount = Number(updates.amount);
      }
      if (updates.category) {
        if (getValidCategoryIds(state).includes(updates.category)) {
          tx.category = updates.category;
        }
      }
      if (updates.paymentMode) {
        if (['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'Pluxee'].includes(updates.paymentMode)) {
          tx.paymentMode = updates.paymentMode;
        }
      }
      if (updates.notes !== undefined) {
        tx.notes = sanitizeString(updates.notes, 250) || undefined;
      }
      if (updates.isRecurring !== undefined) {
        tx.isRecurring = updates.isRecurring === true || undefined;
      }
      if (updates.date && typeof updates.date === 'string' && !isNaN(Date.parse(updates.date))) {
        tx.date = updates.date;
      }
    }

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, transaction: tx, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while updating the transaction.' });
  }
});

// Apply the same category/payment mode/notes change to many transactions at
// once (e.g. recategorizing a batch of subscription charges). Same ownership
// rule as the single-transaction update — an id that isn't the caller's own
// is silently skipped (reported back, not treated as an error) rather than
// failing the whole batch.
app.post('/api/ledger/transaction/bulk-update', rateLimit(20, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { transactionIds, updates } = req.body;
    const authenticatedSpender = ownerSpender(req, req.body?.authenticatedSpender);

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'transactionIds must be a non-empty array' });
    }
    if (transactionIds.length > 200) {
      return res.status(400).json({ error: 'Cannot bulk-update more than 200 transactions at once' });
    }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates is required' });
    }

    const validCategoryIds = getValidCategoryIds(state);
    const hasCategory = updates.category && validCategoryIds.includes(updates.category);
    const hasPaymentMode =
      updates.paymentMode && ['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'Pluxee'].includes(updates.paymentMode);
    const hasNotes = updates.notes !== undefined;

    if (!hasCategory && !hasPaymentMode && !hasNotes) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const skippedIds: string[] = [];
    let updatedCount = 0;

    for (const id of transactionIds) {
      const tx = state.transactions.find((t) => t.id === id);
      if (!tx || (authenticatedSpender && tx.spender !== authenticatedSpender)) {
        skippedIds.push(id);
        continue;
      }
      if (hasCategory) tx.category = updates.category;
      if (hasPaymentMode) tx.paymentMode = updates.paymentMode;
      if (hasNotes) tx.notes = sanitizeString(updates.notes, 250) || undefined;
      updatedCount += 1;
    }

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, updatedCount, skippedIds, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while bulk-updating transactions.' });
  }
});

// Delete a transaction with strict ownership check
app.post('/api/ledger/transaction/delete', rateLimit(60, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { transactionId } = req.body;
    const authenticatedSpender = ownerSpender(req, req.body?.authenticatedSpender);
    if (!transactionId || typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'Valid transactionId is required' });
    }

    const txIndex = state.transactions.findIndex((t) => t.id === transactionId);
    if (txIndex === -1) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = state.transactions[txIndex];

    // Strict Ownership Enforcement: Users cannot delete other spouse's expenses
    if (authenticatedSpender && tx.spender !== authenticatedSpender) {
      const ownerName = tx.spender === 'husband' ? state.husbandName : state.wifeName;
      return res.status(403).json({
        error: `Permission Denied: You cannot delete another person's expense. Only ${ownerName} can delete this entry.`,
      });
    }

    state.transactions.splice(txIndex, 1);
    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while deleting the transaction.' });
  }
});

// Contribute to savings goal
app.post('/api/ledger/goal-contribution', rateLimit(60, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { goalId, contributor, amount } = req.body;
    const amountNum = Number(amount);
    if (!isFinite(amountNum) || amountNum <= 0 || amountNum > 10000000) {
      return res.status(400).json({ error: 'Contribution amount must be a positive number under ₹1,00,00,000' });
    }

    const goal = state.goals.find((g) => g.id === goalId);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const cleanContributor: SpenderId = contributor === 'wife' ? 'wife' : 'husband';
    goal.currentAmount += amountNum;
    goal.contributions.push({
      id: `c-${Date.now()}`,
      contributor: cleanContributor,
      amount: amountNum,
      date: new Date().toISOString(),
    });

    if (goal.currentAmount >= goal.targetAmount) {
      state.alerts.unshift({
        id: `alert-goal-done-${Date.now()}`,
        type: 'goal',
        title: `Goal Achieved! 🎉`,
        message: `${goal.title} has reached 100% of its target ₹${goal.targetAmount.toLocaleString('en-IN')}!`,
        timestamp: 'Just now',
        read: false,
        actionType: 'view_goal',
        targetId: goal.id,
      });
    }

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, goal, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while contributing to the savings goal.' });
  }
});

// Wipe all household data (transactions/goals/alerts) but keep the household's
// identity (names, currency, setup, paired devices) intact.
app.post('/api/ledger/reset', async (req, res) => {
  const state = req.householdState!;
  state.transactions = [];
  state.goals = [];
  state.alerts = [];
  state.lastSyncTime = new Date().toISOString();
  await persistHouseholdState(req.householdId!, state);
  res.json({ success: true, ledger: state });
});

// One-time household setup: real family/partner names, currency
app.post('/api/household/setup', async (req, res) => {
  try {
    const state = req.householdState!;
    const { familyName, husbandName, wifeName, currency, myRole } = req.body;

    const cleanFamilyName = sanitizeString(familyName, 60);
    const cleanHusbandName = sanitizeString(husbandName, 40);
    const cleanWifeName = sanitizeString(wifeName, 40);
    const cleanCurrency = typeof currency === 'string' && currency.trim() ? currency.trim().slice(0, 3) : '₹';

    if (!cleanFamilyName || !cleanHusbandName || !cleanWifeName) {
      return res.status(400).json({ error: 'Household name and both partner names are required' });
    }
    if (myRole !== 'husband' && myRole !== 'wife') {
      return res.status(400).json({ error: 'myRole must be "husband" or "wife"' });
    }

    state.familyName = cleanFamilyName;
    state.husbandName = cleanHusbandName;
    state.wifeName = cleanWifeName;
    state.currency = cleanCurrency;
    state.setupComplete = true;
    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);

    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while setting up the household.' });
  }
});

// Update household/partner names or currency after initial setup — same
// validation as /api/household/setup, but doesn't touch setupComplete and
// doesn't require myRole (this isn't a "which phone is this" flow).
app.post('/api/household/update', async (req, res) => {
  try {
    const state = req.householdState!;
    const { familyName, husbandName, wifeName, currency } = req.body;

    const cleanFamilyName = sanitizeString(familyName, 60);
    const cleanHusbandName = sanitizeString(husbandName, 40);
    const cleanWifeName = sanitizeString(wifeName, 40);
    const cleanCurrency = typeof currency === 'string' && currency.trim() ? currency.trim().slice(0, 3) : state.currency;

    if (!cleanFamilyName || !cleanHusbandName || !cleanWifeName) {
      return res.status(400).json({ error: 'Household name and both partner names are required' });
    }

    state.familyName = cleanFamilyName;
    state.husbandName = cleanHusbandName;
    state.wifeName = cleanWifeName;
    state.currency = cleanCurrency;
    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);

    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while updating the household.' });
  }
});

// A single shared toggle for the "Amount vs Category" card's time window —
// its own endpoint rather than folded into /api/household/update, since that
// route requires the full household-identity form together and this is an
// unrelated one-field preference.
app.post('/api/ledger/settings/category-period', async (req, res) => {
  try {
    const state = req.householdState!;
    const { period } = req.body;
    if (period !== 'month' && period !== 'year' && period !== 'all') {
      return res.status(400).json({ error: 'period must be "month", "year", or "all"' });
    }
    state.categoryBreakdownPeriod = period;
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while updating this setting.' });
  }
});

// Register a device's real per-device identity (which role picked this phone)
app.post('/api/ledger/register-device', async (req, res) => {
  try {
    const state = req.householdState!;
    const { role } = req.body;
    if (role !== 'husband' && role !== 'wife') {
      return res.status(400).json({ error: 'role must be "husband" or "wife"' });
    }

    const name = role === 'husband' ? state.husbandName : state.wifeName;
    const existing = state.connectedDevices.find((d) => d.owner === role);

    const device: DeviceInfo = {
      id: existing?.id || `dev-${role}-${Date.now()}`,
      name: `${name}'s device`,
      owner: role,
      deviceModel: 'Web / PWA',
      lastActive: 'Just now',
      isOnline: true,
      pushSubscription: existing?.pushSubscription,
    };

    if (existing) {
      state.connectedDevices = state.connectedDevices.map((d) =>
        d.owner === role ? device : d
      );
    } else {
      state.connectedDevices.push(device);
    }

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while registering this device.' });
  }
});

// The client needs the VAPID public key to call pushManager.subscribe(); this
// is intentionally public (not household-scoped) since it carries no secret.
app.get('/api/push/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server.' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/ledger/push/subscribe', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { role, subscription } = req.body;
    if (role !== 'husband' && role !== 'wife') {
      return res.status(400).json({ error: 'role must be "husband" or "wife"' });
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription' });
    }

    const device = state.connectedDevices.find((d) => d.owner === role);
    if (!device) {
      return res.status(404).json({ error: 'Register this device before subscribing to push.' });
    }
    device.pushSubscription = {
      endpoint: sanitizeString(subscription.endpoint, 500) || subscription.endpoint,
      keys: {
        p256dh: sanitizeString(subscription.keys.p256dh, 200) || subscription.keys.p256dh,
        auth: sanitizeString(subscription.keys.auth, 100) || subscription.keys.auth,
      },
    };
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'An error occurred while subscribing to push notifications.' });
  }
});

app.post('/api/ledger/push/unsubscribe', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { role } = req.body;
    if (role !== 'husband' && role !== 'wife') {
      return res.status(400).json({ error: 'role must be "husband" or "wife"' });
    }
    const device = state.connectedDevices.find((d) => d.owner === role);
    if (device) device.pushSubscription = undefined;
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'An error occurred while unsubscribing from push notifications.' });
  }
});

const DEFAULT_CATEGORY_COLOR = '#8E8E93';

function slugifyToCategoryId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'category';
  return `${base}-${Date.now().toString(36)}`;
}

// Add a new custom category
app.post('/api/ledger/categories', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const cleanName = sanitizeString(req.body?.name, 40);
    if (!cleanName) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const icon = CATEGORY_ICON_OPTIONS.includes(req.body?.icon) ? req.body.icon : 'HelpCircle';
    const color = typeof req.body?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(req.body.color)
      ? req.body.color
      : DEFAULT_CATEGORY_COLOR;
    const budgetMonthly = Math.max(0, Math.min(10000000, Number(req.body?.budgetMonthly) || 0));

    const newCategory: Category = {
      id: slugifyToCategoryId(cleanName),
      name: cleanName,
      color,
      badgeBg: '',
      badgeText: '',
      badgeBorder: 'border-black/[0.08] dark:border-white/[0.1]',
      icon,
      budgetMonthly,
    };

    state.categories.push(newCategory);
    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, category: newCategory, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while adding the category.' });
  }
});

// Update an existing category's name, icon, color, or budget
app.post('/api/ledger/categories/update', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { categoryId } = req.body;
    if (!categoryId || typeof categoryId !== 'string') {
      return res.status(400).json({ error: 'Valid categoryId is required' });
    }

    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (req.body.name !== undefined) {
      const cleanName = sanitizeString(req.body.name, 40);
      if (cleanName) category.name = cleanName;
    }
    if (CATEGORY_ICON_OPTIONS.includes(req.body.icon)) {
      category.icon = req.body.icon;
    }
    if (typeof req.body.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(req.body.color)) {
      category.color = req.body.color;
    }
    if (req.body.budgetMonthly !== undefined) {
      category.budgetMonthly = Math.max(0, Math.min(10000000, Number(req.body.budgetMonthly) || 0));
    }

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, category, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while updating the category.' });
  }
});

// Delete a category. Existing transactions in it are reassigned to "bills" so
// nothing is left pointing at a category that no longer exists.
app.post('/api/ledger/categories/delete', rateLimit(30, 60000), async (req, res) => {
  try {
    const state = req.householdState!;
    const { categoryId } = req.body;
    if (!categoryId || typeof categoryId !== 'string') {
      return res.status(400).json({ error: 'Valid categoryId is required' });
    }
    if (categoryId === 'grey_area') {
      return res.status(403).json({ error: 'The Grey Area category is used by the app and cannot be deleted.' });
    }

    const exists = state.categories.some((c) => c.id === categoryId);
    if (!exists) {
      return res.status(404).json({ error: 'Category not found' });
    }

    state.categories = state.categories.filter((c) => c.id !== categoryId);
    // Orphaned transactions move to the reserved grey-area bucket (always
    // present, can't be deleted) rather than a real category like "Bills" —
    // a deleted category's old transactions deserve a visible "needs a new
    // category" state, not a silent, unrelated new home.
    state.transactions.forEach((tx) => {
      if (tx.category === categoryId) tx.category = 'grey_area';
    });

    state.lastSyncTime = new Date().toISOString();
    await persistHouseholdState(req.householdId!, state);
    res.json({ success: true, ledger: state });
  } catch {
    res.status(500).json({ error: 'An error occurred while deleting the category.' });
  }
});

// AI & Heuristic SMS / UPI Parser Endpoint
app.post('/api/parse-sms', rateLimit(30, 60000), async (req, res) => {
  const state = req.householdState!;
  const { smsText, defaultSpender = 'husband', husbandName, wifeName } = req.body;
  if (!smsText || typeof smsText !== 'string' || smsText.trim().length < 3) {
    return res.status(400).json({ error: 'Valid smsText of at least 3 characters is required' });
  }

  if (smsText.length > 2000) {
    return res.status(400).json({ error: 'smsText exceeds maximum allowed length of 2,000 characters' });
  }

  const safeSpender: SpenderId = defaultSpender === 'wife' ? 'wife' : 'husband';
  const safeHusbandName = sanitizeString(husbandName, 40) || state.husbandName || 'your partner';
  const safeWifeName = sanitizeString(wifeName, 40) || state.wifeName || 'your partner';
  const cleanSms = sanitizeString(smsText, 2000);
  const maskedSms = maskSensitiveFinancialData(cleanSms);
  const ai = getGenAI();

  // If Gemini API is configured, use Gemini 3.8-Flash with structured schema
  if (ai) {
    try {
      // Built from the household's actual live category list (not a fixed
      // enum) so Gemini always sees whatever categories exist right now,
      // custom ones included, instead of drifting out of sync over time.
      const categoryList = state.categories
        .filter((c) => c.id !== 'grey_area')
        .map((c) => `- ${c.id} (${c.name})`)
        .join('\n');

      const nowIso = new Date().toISOString();
      const prompt = `You are an expert Indian UPI and banking SMS parsing intelligence for a family finance app called Family Ledger.
Analyze the following bank SMS or UPI notification:
"${maskedSms}"

Categories must be strictly one of:
${categoryList}
- grey_area (ambiguous peer UPI transfer to an individual name or phone number with no clear merchant context, ATM cash withdrawal, generic "UPI/..." transfers, or splits where it is unclear if it is personal vs household)

Determine:
1. title: Clean merchant or payee name
2. amount: Clean positive number (INR)
3. type: "debit" or "credit" — many bank SMS describe BOTH sides of a UPI
   transfer in one message (e.g. "Acct debited for Rs 40; Rahul Sharma
   credited"), where "credited" refers to the payee's account, not the
   user's own. If the message says the user's account/card was debited,
   the type is "debit" even if a payee's name also appears next to the
   word "credited".
4. category: one of the above
5. paymentMode: "UPI" | "Card" | "NetBanking" | "Cash" | "AmazonPayLater" | "Pluxee"
6. bankName: detected bank (e.g. HDFC Bank, ICICI Bank, SBI, etc.)
7. upiRef: UPI reference or transaction ID if present
8. isGreyArea: boolean (true if payee is an individual or ATM or ambiguous transfer)
9. greyAreaReason: why context is needed
10. contextQuestion: A polite, natural question addressing ${safeSpender === 'husband' ? safeHusbandName : safeWifeName} asking for the exact nature of the spend (e.g. household repair vs personal loan).
11. dateTime: The exact date and time the transaction happened, AS STATED IN THE SMS — read it however the bank wrote it (any date order, separator, ordinal, relative phrase like "today"/"yesterday", or a date and time glued together with no space) and return it as strict ISO 8601 ("YYYY-MM-DDTHH:mm:ss"). If the SMS gives a date but no time, use "12:00:00". If the SMS gives no date at all, omit this field entirely — do not guess. The current date/time, for resolving relative phrases only, is ${nowIso}.`;

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              type: { type: Type.STRING },
              category: { type: Type.STRING },
              paymentMode: { type: Type.STRING },
              bankName: { type: Type.STRING },
              upiRef: { type: Type.STRING },
              isGreyArea: { type: Type.BOOLEAN },
              greyAreaReason: { type: Type.STRING },
              contextQuestion: { type: Type.STRING },
              dateTime: { type: Type.STRING },
            },
            required: ['title', 'amount', 'type', 'category', 'isGreyArea'],
          },
        },
      });

      const parsedJson = JSON.parse(geminiResponse.text || '{}');

      let validCat: CategoryId = 'grey_area';
      if (getValidCategoryIds(state).includes(parsedJson.category)) {
        validCat = parsedJson.category as CategoryId;
      }
      if (parsedJson.isGreyArea) {
        validCat = 'grey_area';
      }

      const rawAmt = Number(parsedJson.amount);
      const safeAmount = isFinite(rawAmt) && rawAmt > 0 && rawAmt <= 50000000 ? Math.round(rawAmt * 100) / 100 : 500;

      const tx: Partial<Transaction> = {
        title: sanitizeString(parsedJson.title, 80) || 'UPI Transaction',
        amount: safeAmount,
        type: parsedJson.type === 'credit' ? 'credit' : 'debit',
        category: validCat,
        paymentMode: ['UPI', 'Card', 'NetBanking', 'Cash', 'AmazonPayLater', 'Pluxee'].includes(parsedJson.paymentMode)
          ? parsedJson.paymentMode
          : 'UPI',
        bankName: sanitizeString(parsedJson.bankName, 50) || 'UPI Bank',
        upiRef: sanitizeString(parsedJson.upiRef, 60) || `UPI-${Date.now().toString().slice(-6)}`,
        rawSms: maskedSms,
        status: parsedJson.isGreyArea ? 'grey_area' : 'verified',
        greyAreaReason: sanitizeString(parsedJson.greyAreaReason, 150) || '',
        contextQuestion: sanitizeString(parsedJson.contextQuestion, 200) || '',
        spender: safeSpender,
        date: geminiDate(parsedJson.dateTime) || extractDateTimeFromSms(cleanSms) || new Date().toISOString(),
      };

      return res.json({
        success: true,
        source: 'gemini',
        transaction: tx,
      });
    } catch (err: any) {
      console.warn('Gemini parser fallback to heuristic:', err?.message);
    }
  }

  // Fallback heuristic parser
  const heuristicResult = parseSmsHeuristic(maskedSms, safeSpender, safeHusbandName, safeWifeName);
  return res.json({
    success: true,
    source: 'heuristic',
    transaction: {
      ...heuristicResult,
      rawSms: maskedSms,
    },
  });
});

// Start server with Vite middleware in dev or static files in production
async function startServer() {
  // Households are loaded lazily, per request, by loadHouseholdState — there's no
  // single state to load eagerly anymore.
  console.log(`Ledger storage: ${pool ? 'Postgres (persistent across deploys)' : 'local files under data/'}`);
  await ensureAuthTables();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Family Ledger Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
