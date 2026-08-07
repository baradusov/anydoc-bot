import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectFormat,
  extensionOf,
  imageFormat,
  markdownName,
  printable,
} from './formats.js';

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

test('control characters are stripped from a name', () => {
  // grammY refuses to send a filename holding a newline, and a newline in the
  // logs forges lines.
  assert.equal(markdownName('evil\r\nname.docx'), 'evilname.md');
  assert.equal(printable('a\u0000b\u001fc'), 'abc');
  assert.ok(!markdownName('a\nb.docx').includes('\n'));
});

test('a picture is recognised by its signature', () => {
  assert.equal(imageFormat(readFileSync(join(__dirname, '__fixtures__', 'scan.png'))), 'png');
  assert.equal(imageFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), 'jpeg');
  assert.equal(imageFormat(Buffer.from([0x49, 0x49, 0x2a, 0x00])), 'tiff');
});

test('what is not a picture is not called one', () => {
  assert.equal(imageFormat(Buffer.from('%PDF-1.7\n')), null);
  assert.equal(imageFormat(Buffer.from('RIFF____AVI LIST', 'latin1')), null);
  assert.equal(imageFormat(Buffer.from('')), null);
});

test('a format whose size cannot be checked is not accepted', () => {
  // WebP hides its dimensions behind three different chunk layouts, and
  // imageGuard.js has to read a size out of everything that gets through.
  assert.equal(imageFormat(Buffer.from('RIFF____WEBPVP8 ', 'latin1')), null);
});

test('a picture format is a shape the statistics will keep', () => {
  // stats.js drops anything that is not a bare extension, so a name with a
  // dash or a space in it would vanish from every count.
  for (const bytes of [
    readFileSync(join(__dirname, '__fixtures__', 'scan.png')),
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from([0x47, 0x49, 0x46, 0x38]),
  ]) {
    assert.match(imageFormat(bytes), /^[a-z0-9]{1,10}$/);
  }
});
