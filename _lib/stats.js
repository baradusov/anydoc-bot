import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.STATS_DB_PATH || join(__dirname, '..', 'data', 'stats.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS "event" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "chatId" INTEGER NOT NULL,
    "format" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "bytes" INTEGER,
    "ms" INTEGER,
    "queueMs" INTEGER,
    "createdAt" INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS "event_createdAt" ON "event"("createdAt");
  CREATE INDEX IF NOT EXISTS "event_chatId" ON "event"("chatId");
`);

const insert = db.prepare(
  'INSERT INTO "event" ("chatId", "format", "outcome", "reason", "bytes", "ms", "queueMs", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);

// The format is often just the extension off a filename a stranger chose, so
// only the shape of an extension is allowed to reach the table.
const clean = (format) => {
  const value = String(format || '').toLowerCase();

  return /^[a-z0-9]{1,10}$/.test(value) ? value : null;
};

const round = (value) => (value == null ? null : Math.round(value));

// The admin chat is where the bot gets tested, and testing is not usage. It
// is dropped here rather than filtered in each query, so a query added later
// cannot forget about it.
const isAdmin = (chatId) => {
  const admin = process.env.ADMIN_CHAT_ID;

  return Boolean(admin) && String(chatId) === String(admin);
};

export const record = (
  chatId,
  format,
  outcome,
  reason = null,
  { bytes = null, ms = null, queueMs = null } = {}
) => {
  if (isAdmin(chatId)) return;

  try {
    insert.run(
      Number(chatId),
      format ? clean(format) : null,
      outcome,
      reason,
      round(bytes),
      round(ms),
      round(queueMs),
      Date.now()
    );
  } catch (error) {
    console.error('stats.record error:', error.message);
  }
};

const since = (days) => Date.now() - days * 86400000;

const percentiles = (rows) => {
  if (!rows.length) return { count: 0, median: null, p90: null, p99: null, max: null };

  const at = (p) => rows[Math.min(rows.length - 1, Math.floor(rows.length * p))];

  return {
    count: rows.length,
    median: at(0.5),
    p90: at(0.9),
    p99: at(0.99),
    max: rows[rows.length - 1],
  };
};

export const summary = (days = 30) => {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS requests,
              COUNT(DISTINCT "chatId") AS users,
              SUM(CASE WHEN "outcome" = 'markdown' THEN 1 ELSE 0 END) AS converted
       FROM "event" WHERE "createdAt" >= ?`
    )
    .get(since(days));

  return { requests: row.requests, users: row.users, converted: row.converted ?? 0 };
};

export const topUsers = (days = 30, limit = 10) =>
  db
    .prepare(
      `SELECT "chatId" AS chatId, COUNT(*) AS count
       FROM "event" WHERE "createdAt" >= ?
       GROUP BY "chatId" ORDER BY count DESC LIMIT ?`
    )
    .all(since(days), limit);

export const topFormats = (days = 30, limit = 10) =>
  db
    .prepare(
      `SELECT "format" AS format, COUNT(*) AS count,
              SUM(CASE WHEN "outcome" = 'markdown' THEN 1 ELSE 0 END) AS converted
       FROM "event" WHERE "createdAt" >= ? AND "format" IS NOT NULL
       GROUP BY "format" ORDER BY count DESC LIMIT ?`
    )
    .all(since(days), limit);

export const timings = (days = 30) =>
  percentiles(
    db
      .prepare(
        `SELECT "ms" AS ms FROM "event"
         WHERE "createdAt" >= ? AND "ms" IS NOT NULL AND "outcome" = 'markdown'
         ORDER BY "ms"`
      )
      .all(since(days))
      .map((r) => r.ms)
  );

export const queueTimings = (days = 30) =>
  percentiles(
    db
      .prepare(
        `SELECT "queueMs" AS q FROM "event"
         WHERE "createdAt" >= ? AND "queueMs" IS NOT NULL
         ORDER BY "queueMs"`
      )
      .all(since(days))
      .map((r) => r.q)
  );

export const sizes = (days = 30) =>
  percentiles(
    db
      .prepare(
        `SELECT "bytes" AS b FROM "event"
         WHERE "createdAt" >= ? AND "bytes" IS NOT NULL ORDER BY "bytes"`
      )
      .all(since(days))
      .map((r) => r.b)
  );

export const slowestFormats = (days = 30, limit = 5, minSamples = 5) =>
  db
    .prepare(
      `SELECT "format" AS format, COUNT(*) AS count, CAST(AVG("ms") AS INTEGER) AS avgMs
       FROM "event"
       WHERE "createdAt" >= ? AND "ms" IS NOT NULL AND "format" IS NOT NULL
         AND "outcome" = 'markdown'
       GROUP BY "format" HAVING COUNT(*) >= ?
       ORDER BY avgMs DESC LIMIT ?`
    )
    .all(since(days), minSamples, limit);

export const reasons = (days = 30) =>
  db
    .prepare(
      `SELECT "reason" AS reason, COUNT(*) AS count
       FROM "event" WHERE "createdAt" >= ? AND "reason" IS NOT NULL
       GROUP BY "reason" ORDER BY count DESC`
    )
    .all(since(days));

export const outcomes = (days = 30) =>
  db
    .prepare(
      `SELECT "outcome" AS outcome, COUNT(*) AS count
       FROM "event" WHERE "createdAt" >= ?
       GROUP BY "outcome" ORDER BY count DESC`
    )
    .all(since(days));

export const returning = (days = 30) => {
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM (
         SELECT "chatId" FROM "event" WHERE "createdAt" >= ?
         INTERSECT
         SELECT "chatId" FROM "event" WHERE "createdAt" >= ? AND "createdAt" < ?
       )`
    )
    .get(now - days * 86400000, now - 2 * days * 86400000, now - days * 86400000);

  return row.count;
};
