import { MAX_FILE_BYTES, OCR_ENABLED, TIMEOUT_MS } from './config.js';
import { convert } from './convert.js';
import {
  detectFormat,
  extensionOf,
  imageFormat,
  markdownName,
  printable,
} from './formats.js';
import { download } from './download.js';
import { checkImage } from './imageGuard.js';
import { readPicture } from './ocr.js';
import { checkZip } from './zipGuard.js';

// A PDF anydoc opened and found no text in is the shape a scan arrives in.
const MIGHT_BE_A_SCAN = new Set(['empty', 'needs_ocr']);

/**
 * The whole path from an incoming document to Markdown.
 * Resolves to `{ markdown, filename, format }` or `{ reason, format }` —
 * every failure is a reason, none of them throw.
 *
 * `onPicture` is called once, before the slow path starts, so the person
 * waiting can be told why this one takes longer.
 */
export const handleDocument = async (ctx, { onPicture = () => {} } = {}) => {
  const document = ctx.message.document;
  const extension = extensionOf(document.file_name);

  if (document.file_size > MAX_FILE_BYTES) {
    return { reason: 'too_big', format: extension };
  }

  let bytes;

  try {
    bytes = await download(ctx, AbortSignal.timeout(TIMEOUT_MS));
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';

    console.error('Download failed:', error.message);

    return { reason: timedOut ? 'timeout' : 'download_failed', format: extension };
  }

  const format = detectFormat(bytes, document.file_name);
  const picture = format ? null : imageFormat(bytes);

  if (picture) {
    if (!OCR_ENABLED) return { reason: 'unsupported', format: picture };

    // The header is believed before the parser is handed the file: a picture
    // that declares more pixels than anyone sends decodes faster than the
    // memory watch can react to it.
    const oversized = checkImage(bytes, picture);

    if (oversized) {
      console.log(`Refused ${printable(document.file_name)}: ${oversized}`);
      return { reason: oversized, format: picture };
    }

    onPicture();

    const { markdown, reason } = await readPicture(bytes);

    if (!markdown) return { reason, format: picture };

    return { markdown, filename: markdownName(document.file_name), format: picture };
  }

  // Reported as the extension when nothing was recognised: that is the only
  // way to learn which kinds of file people keep sending in vain.
  if (!format) return { reason: 'unsupported', format: extension };

  const bomb = checkZip(bytes);

  if (bomb) {
    console.log(`Refused ${printable(document.file_name)}: ${bomb}`);
    return { reason: bomb, format };
  }

  const { markdown, reason } = await convert(bytes, format);

  if (markdown) {
    return { markdown, filename: markdownName(document.file_name), format };
  }

  if (!OCR_ENABLED || format !== 'pdf' || !MIGHT_BE_A_SCAN.has(reason)) {
    return { reason, format };
  }

  // Counted apart from ordinary PDFs: how many arrive as pictures is the one
  // number that says whether this path is worth its seconds.
  onPicture();

  const scan = await readPicture(bytes);

  if (scan.markdown) {
    return {
      markdown: scan.markdown,
      filename: markdownName(document.file_name),
      format: 'pdfscan',
    };
  }

  // Nothing to OCR after all: the first verdict was the honest one.
  return {
    reason: scan.reason === 'no_ocr_needed' ? reason : scan.reason,
    format: 'pdfscan',
  };
};

/**
 * A photo sent as a photo. Telegram re-encodes it to at most 1280 pixels
 * wide, which over a sheet of A4 is about 155 dpi — near enough the 150 the
 * rest of this path is tuned for, so it is worth reading rather than refusing.
 */
export const handlePhoto = async (ctx, { onPicture = () => {} } = {}) => {
  if (!OCR_ENABLED) return { reason: 'unsupported', format: 'photo' };

  const sizes = ctx.message.photo;
  const largest = sizes[sizes.length - 1];

  onPicture();

  let bytes;

  try {
    bytes = await download(ctx, AbortSignal.timeout(TIMEOUT_MS), largest.file_id);
  } catch (error) {
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';

    console.error('Photo download failed:', error.message);

    return { reason: timedOut ? 'timeout' : 'download_failed', format: 'photo' };
  }

  const oversized = checkImage(bytes, imageFormat(bytes));

  if (oversized) return { reason: oversized, format: 'photo' };

  const { markdown, reason } = await readPicture(bytes);

  if (!markdown) return { reason, format: 'photo' };

  return { markdown, filename: 'photo.md', format: 'photo' };
};
