import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFormat, extensionOf, markdownName } from './formats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const docx = readFileSync(join(__dirname, '__fixtures__', 'sample.docx'));
const csv = Buffer.from('name,age\nAnn,30\n');

test('the signature names the format', () => {
  assert.equal(detectFormat(docx, 'sample.docx'), 'docx');
});

test('the signature wins over a misleading name', () => {
  assert.equal(detectFormat(docx, 'sample.pdf'), 'docx');
});

test('signature-less formats fall back to the extension', () => {
  assert.equal(detectFormat(csv, 'table.csv'), 'csv');
  assert.equal(detectFormat(csv, 'table.CSV'), 'csv');
});

test('an unknown file is not a format', () => {
  assert.equal(detectFormat(csv, 'notes.txt'), null);
  assert.equal(detectFormat(csv, null), null);
  assert.equal(detectFormat(Buffer.alloc(0), 'file'), null);
});

test('only a real extension counts', () => {
  assert.equal(extensionOf('report.final.docx'), 'docx');
  assert.equal(extensionOf('.hidden'), null);
  assert.equal(extensionOf('noextension'), null);
  assert.equal(extensionOf(undefined), null);
});

test('the markdown keeps the name of the document', () => {
  assert.equal(markdownName('Quarterly report.docx'), 'Quarterly report.md');
  assert.equal(markdownName('archive.tar.gz'), 'archive.tar.md');
  assert.equal(markdownName(''), 'document.md');
});

test('the name stays a single path segment', () => {
  assert.equal(markdownName('../../etc/passwd.docx'), '..-..-etc-passwd.md');
  assert.ok(!markdownName('a/b/c.docx').includes('/'));
});

test('a very long name is cut short', () => {
  assert.ok(markdownName('a'.repeat(300) + '.docx').length <= 63);
});
