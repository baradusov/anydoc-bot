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

export const markdownName = (fileName) => {
  const base = String(fileName || 'document').replace(/\.[^./\\]+$/, '');
  // The name travels back to Telegram as a filename, so keep it to one path
  // segment and a sane length.
  const safe = base.replace(/[/\\]/g, '-').trim().slice(0, 60);

  return `${safe || 'document'}.md`;
};
