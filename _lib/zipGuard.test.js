import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkZip, inspectZip, isZip } from './zipGuard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const docx = readFileSync(join(__dirname, '__fixtures__', 'sample.docx'));

/**
 * A central directory claiming one entry of `size` uncompressed bytes. Only
 * the declared numbers are read, so no data has to exist behind them — which
 * is the point of the guard.
 */
const zipClaiming = (size, name = 'word/document.xml') => {
  const nameBytes = Buffer.from(name, 'latin1');
  const entry = Buffer.alloc(46 + nameBytes.length);

  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt32LE(1024, 20); // compressed
  entry.writeUInt32LE(size, 24); // uncompressed
  entry.writeUInt16LE(nameBytes.length, 28);
  nameBytes.copy(entry, 46);

  const local = Buffer.alloc(4);
  local.writeUInt32LE(0x04034b50, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 10); // entries
  eocd.writeUInt32LE(entry.length, 12); // size of the directory
  eocd.writeUInt32LE(local.length, 16); // where it starts

  return Buffer.concat([local, entry, eocd]);
};

test('a real document passes', () => {
  assert.equal(checkZip(docx), null);

  const found = inspectZip(docx);
  assert.ok(found.entries > 0);
  assert.ok(found.xml > 0);
  assert.ok(found.xml <= found.total);
});

test('a small file claiming enormous markup is refused', () => {
  assert.equal(checkZip(zipClaiming(500 * 1024 * 1024)), 'too_complex');
});

test('media does not count as markup', () => {
  // Well past the markup ceiling, under the ceiling for everything else.
  const media = zipClaiming(100 * 1024 * 1024, 'word/media/image1.png');

  assert.equal(inspectZip(media).xml, 0);
  assert.equal(checkZip(media), null);
});

test('bulk is refused even when it is not markup', () => {
  assert.equal(
    checkZip(zipClaiming(900 * 1024 * 1024, 'word/media/image1.png')),
    'too_complex'
  );
});

test('zip64 is refused rather than parsed', () => {
  assert.equal(checkZip(zipClaiming(0xffffffff)), 'too_complex');
});

test('what is not a zip is not this guard’s business', () => {
  assert.equal(isZip(Buffer.from('%PDF-1.7')), false);
  assert.equal(checkZip(Buffer.from('%PDF-1.7')), null);
  assert.equal(checkZip(Buffer.alloc(0)), null);
  assert.equal(inspectZip(Buffer.from('name,age\n1,2\n')), null);
});

test('a broken zip is left to the parser instead of throwing', () => {
  const truncated = docx.subarray(0, 64);
  assert.doesNotThrow(() => checkZip(truncated));
  assert.equal(checkZip(truncated), null);

  const noDirectory = Buffer.concat([docx.subarray(0, 4), Buffer.alloc(200)]);
  assert.doesNotThrow(() => checkZip(noDirectory));
});
