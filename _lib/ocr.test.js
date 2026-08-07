import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inFlight, queued, readPicture } from './ocr.js';
import { OCR_QUEUE_LIMIT } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fixture = (name) => readFileSync(join(__dirname, '__fixtures__', name));

// Every one of these starts a Tesseract run, which is seconds rather than the
// milliseconds a document takes.
const SLOW = { timeout: 120000 };

test('a picture of text comes back as markdown', SLOW, async () => {
  const { markdown, reason } = await readPicture(fixture('scan.png'));

  assert.equal(reason, undefined);
  assert.match(markdown, /Certificate of Employment/);
  assert.match(markdown, /HR-2025-04471/);
});

test('a PDF holding pictures of text is read too', SLOW, async () => {
  const { markdown, reason } = await readPicture(fixture('scan.pdf'));

  assert.equal(reason, undefined);
  assert.match(markdown, /Certificate of Employment/);
});

test('a PDF with a text layer is handed back, not read letter by letter', SLOW, async () => {
  const { markdown, reason } = await readPicture(fixture('text.pdf'));

  assert.equal(markdown, undefined);
  assert.equal(reason, 'no_ocr_needed');
});

test('a picture with no text in it is a reason, not empty markdown', SLOW, async () => {
  const { markdown, reason } = await readPicture(fixture('blank.png'));

  assert.equal(markdown, undefined);
  assert.equal(reason, 'no_text_found');
});

test('a page of a scan does not open with an empty code block', SLOW, async () => {
  const { markdown } = await readPicture(fixture('scan.pdf'));

  assert.doesNotMatch(markdown, /```/);
  assert.match(markdown, /^Certificate/);
});

test('a read the parser was unsure of says so in the file', SLOW, async () => {
  const { markdown } = await readPicture(fixture('scan.png'), { minConfidence: 1.1 });

  assert.match(markdown, /Certificate of Employment/);
  assert.match(markdown, /not sure about many of the words/);
});

test('a read the parser was sure of carries no warning', SLOW, async () => {
  const { markdown } = await readPicture(fixture('scan.png'));

  assert.doesNotMatch(markdown, /not sure about many of the words/);
});

test('an unreadable file is a reason, not a throw', SLOW, async () => {
  const { markdown, reason } = await readPicture(Buffer.from('hello, not a picture'));

  assert.equal(markdown, undefined);
  assert.equal(reason, 'worker_crashed');
});

test('a picture that takes too long is given up on', SLOW, async () => {
  const { markdown, reason } = await readPicture(fixture('scan.png'), { timeoutMs: 1 });

  assert.equal(markdown, undefined);
  assert.equal(reason, 'timeout');
});

test('markdown past the size limit is refused instead of sent', SLOW, async () => {
  const { markdown, reason } = await readPicture(fixture('scan.png'), { maxBytes: 4 });

  assert.equal(markdown, undefined);
  assert.equal(reason, 'too_large');
});

test('a worker over the memory ceiling is killed', SLOW, async () => {
  // Polled far tighter than in production: this fixture is read in under a
  // second, and the default half-second interval could miss it entirely.
  const { markdown, reason } = await readPicture(fixture('scan.png'), {
    maxRssMb: 1,
    pollMs: 5,
  });

  // Only Linux has /proc to watch; elsewhere the picture simply gets read.
  if (process.platform === 'linux') {
    assert.equal(markdown, undefined);
    assert.equal(reason, 'too_large');
  } else {
    assert.equal(reason, undefined);
  }
});

test('past the queue limit people are told to come back, not left waiting', SLOW, async () => {
  const scan = fixture('scan.png');
  // One running, the queue full, and one more than the queue will hold.
  const results = await Promise.all(
    Array.from({ length: OCR_QUEUE_LIMIT + 3 }, () => readPicture(scan))
  );

  const busy = results.filter((r) => r.reason === 'ocr_busy');
  const read = results.filter((r) => r.markdown);

  assert.ok(busy.length >= 1, 'somebody should have been turned away');
  assert.ok(read.length >= 1, 'the ones that fit should still be read');
  assert.equal(busy.length + read.length, results.length);

  // Every slot handed back, or the lane would wedge after one burst.
  assert.equal(inFlight(), 0);
  assert.equal(queued(), 0);
});
