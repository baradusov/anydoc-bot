import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert, inFlight } from './convert.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const docx = readFileSync(join(__dirname, '__fixtures__', 'sample.docx'));

test('a document comes back as markdown', async () => {
  const { markdown, reason } = await convert(docx, 'docx');

  assert.equal(reason, undefined);
  assert.match(markdown, /^# Quarterly report/);
  assert.match(markdown, /\*\*12 percent\*\*/);
});

test('a signature-less format is converted under the name it was given', async () => {
  const { markdown } = await convert(Buffer.from('name,age\nAnn,30\n'), 'csv');

  assert.match(markdown, /\| Ann \| 30 \|/);
});

test('an unreadable file is a reason, not a throw', async () => {
  const { markdown, reason } = await convert(Buffer.from('hello, not a document'));

  assert.equal(markdown, undefined);
  assert.equal(reason, 'unsupported');
});

test('a broken document is told apart from an unknown one', async () => {
  const { reason } = await convert(Buffer.from('%PDF-1.4 and then nothing'), 'pdf');

  assert.equal(reason, 'malformed');
});

test('a document with nothing in it is empty, not converted', async () => {
  const { markdown, reason } = await convert(Buffer.from(''), 'csv');

  assert.equal(markdown, undefined);
  assert.equal(reason, 'empty');
});

test('documents past the concurrency limit still all convert', async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () => convert(docx, 'docx'))
  );

  assert.ok(results.every((r) => r.markdown?.startsWith('# Quarterly report')));
  // Every worker slot is handed back, or the bot would wedge after a burst.
  assert.equal(inFlight(), 0);
});

test('a document that takes too long is given up on', async () => {
  const { markdown, reason } = await convert(docx, 'docx', { timeoutMs: 1 });

  assert.equal(markdown, undefined);
  assert.equal(reason, 'timeout');
});

test('markdown past the size limit is refused instead of sent', async () => {
  const { markdown, reason } = await convert(docx, 'docx', { maxBytes: 4 });

  assert.equal(markdown, undefined);
  assert.equal(reason, 'too_large');
});
