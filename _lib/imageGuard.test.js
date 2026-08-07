import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkImage } from './imageGuard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A PNG is a signature and then length-type-data-crc chunks. Only IHDR matters
// here, so IDAT holds whatever deflate makes of a short run of zeros.
const png = (width, height) => {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(64))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

test('an ordinary picture passes', () => {
  assert.equal(checkImage(readFileSync(join(__dirname, '__fixtures__', 'scan.png')), 'png'), null);
  assert.equal(checkImage(png(3000, 4000), 'png'), null);
});

test('a picture declaring more pixels than it could hold is refused', () => {
  // 380 KB on disk, 380 MB decoded, allocated faster than the memory watch
  // in ocr.js polls.
  assert.equal(checkImage(png(20000, 20000), 'png'), 'too_complex');
  assert.equal(checkImage(png(70000, 70000), 'png'), 'too_complex');
});

test('the limit is the one it is given', () => {
  assert.equal(checkImage(png(1000, 1000), 'png', 999999), 'too_complex');
  assert.equal(checkImage(png(1000, 1000), 'png', 1000001), null);
});

test('a JPEG is sized from its frame header', () => {
  // SOI, then a comment segment to skip, then SOF0 declaring the size.
  // 0x0258 high, 0x0320 wide: 600 by 800.
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20]);
  const comment = Buffer.from([0xff, 0xfe, 0x00, 0x04, 0x00, 0x00]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), comment, sof, Buffer.alloc(16)]);

  assert.equal(checkImage(jpeg, 'jpeg'), null);
  assert.equal(checkImage(jpeg, 'jpeg', 1000), 'too_complex');
});

test('a GIF and a BMP are sized too', () => {
  const gif = Buffer.from('GIF89a', 'latin1');
  const size = Buffer.alloc(4);
  size.writeUInt16LE(20000, 0);
  size.writeUInt16LE(20000, 2);
  assert.equal(checkImage(Buffer.concat([gif, size, Buffer.alloc(8)]), 'gif'), 'too_complex');

  const bmp = Buffer.alloc(40);
  bmp.write('BM', 0, 'latin1');
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(30000, 18);
  bmp.writeInt32LE(30000, 22);
  assert.equal(checkImage(bmp, 'bmp'), 'too_complex');
});

test('a header that cannot be read is refused, not passed on', () => {
  assert.equal(checkImage(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'png'), 'malformed');
  assert.equal(checkImage(Buffer.from([0xff, 0xd8, 0xff]), 'jpeg'), 'malformed');
  assert.equal(checkImage(png(0, 0), 'png'), 'malformed');
  assert.equal(checkImage(Buffer.from('whatever'), 'webp'), 'malformed');
});
