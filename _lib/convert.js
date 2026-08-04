import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONVERT_TIMEOUT_MS,
  MAX_CONCURRENT,
  MAX_MARKDOWN_BYTES,
} from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORKER = join(__dirname, 'convertWorker.js');

/**
 * The parser is Rust behind a native binding, and its input is a binary file
 * from a stranger. A panic or a runaway allocation in there takes the whole
 * process with it — out of reach of bot.catch — so it runs somewhere the bot
 * can afford to lose. Conversion is stateless and takes milliseconds, which
 * makes a process per document cheap enough to not think about.
 */
let running = 0;
const waiting = [];

const acquire = () => {
  if (running < MAX_CONCURRENT) {
    running += 1;
    return Promise.resolve();
  }

  return new Promise((resolve) => waiting.push(resolve));
};

const release = () => {
  const next = waiting.shift();

  if (next) return next();

  running -= 1;
};

const classify = (message) => {
  const text = String(message).toLowerCase();

  if (text.includes('ocr') || text.includes('scan')) return 'needs_ocr';
  if (text.includes('unsupported')) return 'unsupported';
  if (text.includes('malformed')) return 'malformed';

  return 'worker_crashed';
};

const run = (bytes, format, timeoutMs, maxBytes) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [WORKER, format ?? ''], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const out = [];
    const errors = [];
    let size = 0;
    let ended = null;

    const stop = (reason) => {
      if (ended) return;
      ended = reason;
      child.kill('SIGKILL');
    };

    const timer = setTimeout(() => stop('timeout'), timeoutMs);

    child.stdout.on('data', (chunk) => {
      size += chunk.length;

      if (size > maxBytes) return stop('too_large');

      out.push(chunk);
    });

    child.stderr.on('data', (chunk) => errors.push(chunk));

    // The child can die before it has read the file; that EPIPE is expected.
    child.stdin.on('error', () => {});
    child.stdin.end(bytes);

    child.on('error', (error) => {
      clearTimeout(timer);
      console.error('Worker failed to start:', error.message);
      resolve({ reason: 'worker_crashed' });
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (ended) return resolve({ reason: ended });

      if (code === 0) {
        return resolve({ markdown: Buffer.concat(out).toString('utf8') });
      }

      const message = Buffer.concat(errors).toString('utf8').trim();

      if (code === 1 && message) {
        console.log('Could not convert:', message);
        return resolve({ reason: classify(message), detail: message });
      }

      // No orderly exit and no message of its own: the parser took the
      // process down. This is the case the child process exists for.
      console.error(`Worker died with code ${code}: ${message || 'no output'}`);
      resolve({ reason: 'worker_crashed' });
    });
  });

/**
 * Convert a document to Markdown.
 * Resolves to `{ markdown }` or `{ reason, detail }` — it does not throw.
 */
export const convert = async (
  bytes,
  format,
  { timeoutMs = CONVERT_TIMEOUT_MS, maxBytes = MAX_MARKDOWN_BYTES } = {}
) => {
  await acquire();

  try {
    const result = await run(bytes, format, timeoutMs, maxBytes);

    // A document can convert cleanly and still hold no text at all.
    if (typeof result.markdown === 'string' && !result.markdown.trim()) {
      return { reason: 'empty' };
    }

    return result;
  } finally {
    release();
  }
};

export const inFlight = () => running;
