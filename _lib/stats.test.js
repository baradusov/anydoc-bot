import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'anydoc-stats-'));
process.env.STATS_DB_PATH = join(dir, 'stats.db');

const {
  record,
  summary,
  topUsers,
  topFormats,
  outcomes,
  reasons,
  returning,
  timings,
  sizes,
  slowestFormats,
  queueTimings,
} = await import('./stats.js');

const raw = new DatabaseSync(process.env.STATS_DB_PATH);
const DAY = 86400000;

const backdate = (id, at) =>
  raw.prepare('UPDATE "event" SET "createdAt" = ? WHERE "id" = ?').run(at, id);

const lastId = () => raw.prepare('SELECT MAX("id") AS id FROM "event"').get().id;

after(() => {
  raw.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a converted document is recorded', () => {
  record(1, 'docx', 'markdown');

  const s = summary(30);
  assert.equal(s.requests, 1);
  assert.equal(s.users, 1);
  assert.equal(s.converted, 1);
});

test('a failure is recorded with its reason', () => {
  record(2, 'pdf', 'failed', 'needs_ocr');

  assert.equal(reasons(30).find((r) => r.reason === 'needs_ocr').count, 1);
  assert.equal(outcomes(30).find((o) => o.outcome === 'failed').count, 1);
});

test('only something shaped like an extension is stored', () => {
  record(3, 'application/vnd.openxmlformats; charset=utf-8', 'failed', 'unsupported');

  const stored = raw
    .prepare('SELECT "format" AS format FROM "event" WHERE "id" = ?')
    .get(lastId());

  assert.equal(stored.format, null);
});

test('formats are counted with how often they worked', () => {
  record(4, 'xlsx', 'markdown');
  record(4, 'xlsx', 'failed', 'malformed');

  const xlsx = topFormats(30).find((f) => f.format === 'xlsx');
  assert.equal(xlsx.count, 2);
  assert.equal(xlsx.converted, 1);
});

test('people are counted once, requests every time', () => {
  record(5, 'docx', 'markdown');
  record(5, 'docx', 'markdown');

  const busiest = topUsers(30).find((u) => u.chatId === 5);
  assert.equal(busiest.count, 2);
});

test('how long it took and how big it was are kept', () => {
  record(6, 'epub', 'markdown', null, { ms: 900, queueMs: 40, bytes: 2048 });

  assert.equal(timings(30).count > 0, true);
  assert.equal(queueTimings(30).median, 40);
  assert.equal(sizes(30).median, 2048);
});

test('a slow format needs enough samples to be called slow', () => {
  for (let i = 0; i < 5; i += 1) record(7, 'pptx', 'markdown', null, { ms: 5000 });

  const slow = slowestFormats(30, 5, 5);
  assert.equal(slow[0].format, 'pptx');
  assert.equal(slow[0].avgMs, 5000);
  assert.equal(slow.some((f) => f.format === 'epub'), false);
});

test('a period only counts what happened inside it', () => {
  record(8, 'rtf', 'markdown');
  backdate(lastId(), Date.now() - 40 * DAY);

  assert.equal(
    topFormats(30).some((f) => f.format === 'rtf'),
    false
  );
  assert.equal(
    topFormats(60).some((f) => f.format === 'rtf'),
    true
  );
});

test('someone active in both periods is returning', () => {
  record(9, 'odt', 'markdown');
  backdate(lastId(), Date.now() - 20 * DAY);
  record(9, 'odt', 'markdown');

  assert.equal(returning(15), 1);
});

test('recording never takes the bot down', () => {
  assert.doesNotThrow(() => record(undefined, undefined, 'markdown'));
});
