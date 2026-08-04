import { MAX_FILE_BYTES, TIMEOUT_MS } from './config.js';
import { convert } from './convert.js';
import { detectFormat, extensionOf, markdownName } from './formats.js';
import { download } from './download.js';

/**
 * The whole path from an incoming document to Markdown.
 * Resolves to `{ markdown, filename, format }` or `{ reason, format }` —
 * every failure is a reason, none of them throw.
 */
export const handleDocument = async (ctx) => {
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

  // Reported as the extension when nothing was recognised: that is the only
  // way to learn which kinds of file people keep sending in vain.
  if (!format) return { reason: 'unsupported', format: extension };

  const { markdown, reason } = await convert(bytes, format);

  if (!markdown) return { reason, format };

  return { markdown, filename: markdownName(document.file_name), format };
};
