import { formatFromBytes, formatFromExtension } from '@firecrawl/anydoc';

// Enough of the file for every container signature anydoc looks at.
const SNIFF_BYTES = 4096;

export const extensionOf = (fileName) => {
  const dot = String(fileName || '').lastIndexOf('.');

  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : null;
};

/**
 * The content decides, the name is the fallback. A file arrives named by
 * whoever sent it, so `report.docx` may well be a PDF; the signature is not
 * up for debate. Signature-less formats (CSV) have only the name to go on.
 */
export const detectFormat = (bytes, fileName) =>
  formatFromBytes(bytes.subarray(0, SNIFF_BYTES)) ??
  (fileName ? formatFromExtension(extensionOf(fileName) ?? '') : null);

const IMAGE_SIGNATURES = [
  ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['jpeg', [0xff, 0xd8, 0xff]],
  ['gif', [0x47, 0x49, 0x46, 0x38]],
  ['tiff', [0x49, 0x49, 0x2a, 0x00]],
  ['tiff', [0x4d, 0x4d, 0x00, 0x2a]],
  // "BM" alone is two bytes and would claim any file starting with them. It
  // is last, and only reached once anydoc has failed to name the format.
  ['bmp', [0x42, 0x4d]],
];

const startsWith = (bytes, signature) =>
  signature.every((byte, index) => bytes[index] === byte);

/**
 * The name of the picture format, or null. Only asked after anydoc has found
 * no document, so a weak signature cannot take a document's place.
 *
 * The list is exactly what imageGuard.js can read a size out of. A format
 * whose declared size cannot be checked is not accepted at all.
 */
export const imageFormat = (bytes) =>
  IMAGE_SIGNATURES.find(([, signature]) => startsWith(bytes, signature))?.[0] ?? null;

// A file name is chosen by whoever sent the file, and it ends up in the logs
// and in an outgoing form header. Control characters belong in neither: a
// newline forges log lines, and grammY refuses to send a name containing one.
export const printable = (text) =>
  String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '');

export const markdownName = (fileName) => {
  const base = String(fileName || 'document').replace(/\.[^./\\]+$/, '');
  // The name travels back to Telegram as a filename, so keep it to one path
  // segment and a sane length.
  const safe = printable(base).replace(/[/\\]/g, '-').trim().slice(0, 60);

  return `${safe || 'document'}.md`;
};
