import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH =
  process.env.ATTEMPTS_DB_PATH || join(__dirname, '..', 'data', 'attempts.db');

export const MAX_TRIES = Number(process.env.MAX_UPDATE_TRIES) || 3;

const KEEP_MS = 86400000;

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS "attempt" (
    "updateId" INTEGER PRIMARY KEY,
    "tries" INTEGER NOT NULL,
    "firstSeen" INTEGER NOT NULL
  );
`);

const bump = db.prepare(`
  INSERT INTO "attempt" ("updateId", "tries", "firstSeen") VALUES (?, 1, ?)
  ON CONFLICT("updateId") DO UPDATE SET "tries" = "tries" + 1
  RETURNING "tries"
`);

const drop = db.prepare('DELETE FROM "attempt" WHERE "updateId" = ?');
const prune = db.prepare('DELETE FROM "attempt" WHERE "firstSeen" < ?');
const count = db.prepare('SELECT COUNT(*) AS c FROM "attempt"');

export const startAttempt = (updateId) => {
  try {
    prune.run(Date.now() - KEEP_MS);
    const { tries } = bump.get(Number(updateId), Date.now());

    return { tries, giveUp: tries > MAX_TRIES };
  } catch (error) {
    console.error('attempts.startAttempt error:', error.message);
    return { tries: 1, giveUp: false };
  }
};

export const finishAttempt = (updateId) => {
  try {
    drop.run(Number(updateId));
  } catch (error) {
    console.error('attempts.finishAttempt error:', error.message);
  }
};

export const pending = () => count.get().c;
