import { MAX_XML_BYTES, MAX_UNCOMPRESSED_BYTES } from './config.js';

const LOCAL_SIG = 0x04034b50;
const CD_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

// The end-of-central-directory record is last, followed only by a comment of
// at most 65535 bytes.
const EOCD_SCAN = 65557;
const EOCD_MIN = 22;
const CD_ENTRY_MIN = 46;
const U32_MAX = 0xffffffff;

export const isZip = (bytes) =>
  bytes.length >= 4 && bytes.readUInt32LE(0) === LOCAL_SIG;

const findEocd = (bytes) => {
  const from = Math.max(0, bytes.length - EOCD_SCAN);

  for (let at = bytes.length - EOCD_MIN; at >= from; at -= 1) {
    if (bytes.readUInt32LE(at) === EOCD_SIG) return at;
  }

  return -1;
};

/**
 * What a ZIP says it holds, read from the central directory without
 * decompressing a single byte. Returns null when the bytes are not a ZIP we
 * can read — an unreadable container is the parser's problem, not ours.
 */
export const inspectZip = (bytes) => {
  if (!isZip(bytes)) return null;

  const eocd = findEocd(bytes);

  if (eocd < 0) return null;

  const entries = bytes.readUInt16LE(eocd + 10);
  let at = bytes.readUInt32LE(eocd + 16);

  // Zip64 puts the real numbers elsewhere. Office files this small have no
  // business needing it, so it is refused rather than parsed.
  if (entries === 0xffff || at === U32_MAX) return { zip64: true };

  let total = 0;
  let xml = 0;

  for (let i = 0; i < entries; i += 1) {
    if (at + CD_ENTRY_MIN > bytes.length) return null;
    if (bytes.readUInt32LE(at) !== CD_SIG) return null;

    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);

    if (size === U32_MAX) return { zip64: true };

    const name = bytes
      .subarray(at + CD_ENTRY_MIN, at + CD_ENTRY_MIN + nameLength)
      .toString('latin1')
      .toLowerCase();

    total += size;
    // Only markup blows up in memory. Images are stored, not parsed into a
    // tree, so a photo-heavy presentation is not the thing to refuse.
    if (name.endsWith('.xml') || name.endsWith('.rels')) xml += size;

    at += CD_ENTRY_MIN + nameLength + extraLength + commentLength;
  }

  return { total, xml, entries };
};

/**
 * A 98 KB file can carry 100 MB of markup, and the parser holds all of it in
 * memory at once — roughly ten times over — before anything reaches our
 * output limit. anydoc's own guard counts XML nodes, so it does not fire on
 * few nodes holding enormous text. This one counts bytes.
 *
 * Returns a failure reason, or null when the file may be converted.
 */
export const checkZip = (bytes) => {
  const found = inspectZip(bytes);

  if (!found) return null;
  if (found.zip64) return 'too_complex';
  if (found.xml > MAX_XML_BYTES) return 'too_complex';
  if (found.total > MAX_UNCOMPRESSED_BYTES) return 'too_complex';

  return null;
};
