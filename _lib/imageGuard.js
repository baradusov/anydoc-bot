import { OCR_MAX_PIXELS } from './config.js';

/**
 * A picture declares its size in its header and carries the pixels compressed.
 * A 380 KB PNG can declare 20000x20000 and decode to 380 MB, which the parser
 * allocates in under half a second — faster than any watcher can react. The
 * header is read here instead, before the parser sees the file.
 *
 * Same idea as zipGuard.js: believe the declaration enough to refuse on it.
 */

const pngSize = (bytes) =>
  bytes.length >= 24 ? [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] : null;

const gifSize = (bytes) =>
  bytes.length >= 10 ? [bytes.readUInt16LE(6), bytes.readUInt16LE(8)] : null;

const bmpSize = (bytes) => {
  if (bytes.length < 26) return null;

  // A 12-byte DIB header holds 16-bit dimensions, everything later 32-bit.
  return bytes.readUInt32LE(14) < 40
    ? [bytes.readUInt16LE(18), bytes.readUInt16LE(20)]
    : [Math.abs(bytes.readInt32LE(18)), Math.abs(bytes.readInt32LE(22))];
};

// Start-of-frame markers, where a JPEG says how big it is. C4, C8 and CC are
// tables and codes rather than frames.
const isFrameMarker = (marker) =>
  marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

const jpegSize = (bytes) => {
  let at = 2;

  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;

    const marker = bytes[at + 1];

    if (isFrameMarker(marker)) {
      return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
    }

    const length = bytes.readUInt16BE(at + 2);

    if (length < 2) return null;

    at += 2 + length;
  }

  return null;
};

const TIFF_WIDTH = 256;
const TIFF_HEIGHT = 257;

const tiffSize = (bytes) => {
  if (bytes.length < 8) return null;

  const little = bytes.toString('latin1', 0, 2) === 'II';
  const u16 = (at) => (little ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at));
  const u32 = (at) => (little ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at));

  const ifd = u32(4);

  if (ifd + 2 > bytes.length) return null;

  const count = u16(ifd);
  const size = {};

  for (let entry = 0; entry < count; entry++) {
    const at = ifd + 2 + entry * 12;

    if (at + 12 > bytes.length) return null;

    const tag = u16(at);

    if (tag === TIFF_WIDTH || tag === TIFF_HEIGHT) {
      // Type 3 is a 16-bit value sitting in the first half of the field.
      size[tag] = u16(at + 2) === 3 ? u16(at + 8) : u32(at + 8);
    }
  }

  return size[TIFF_WIDTH] && size[TIFF_HEIGHT]
    ? [size[TIFF_WIDTH], size[TIFF_HEIGHT]]
    : null;
};

const READERS = {
  png: pngSize,
  gif: gifSize,
  bmp: bmpSize,
  jpeg: jpegSize,
  tiff: tiffSize,
};

/**
 * A reason to refuse the picture, or null to let it through. A format whose
 * header cannot be read is refused rather than passed on: every format that
 * gets here is one formats.js recognised, so an unreadable header is a broken
 * or lying file.
 */
export const checkImage = (bytes, format, maxPixels = OCR_MAX_PIXELS) => {
  const read = READERS[format];

  if (!read) return 'malformed';

  let size = null;

  try {
    size = read(bytes);
  } catch {
    return 'malformed';
  }

  if (!size) return 'malformed';

  const [width, height] = size;

  if (!width || !height) return 'malformed';

  return width * height > maxPixels ? 'too_complex' : null;
};
