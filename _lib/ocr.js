import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_MARKDOWN_BYTES,
  OCR_DPI,
  OCR_LANGUAGE,
  OCR_MAX_CONCURRENT,
  OCR_MAX_PAGES,
  OCR_MAX_PIXELS,
  OCR_MAX_RSS_MB,
  OCR_MIN_CONFIDENCE,
  OCR_QUEUE_LIMIT,
  OCR_TIMEOUT_MS,
  OCR_WORKERS,
  lowConfidenceNote,
  truncatedNote,
} from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORKER = join(__dirname, 'ocrWorker.js');

// A picture bomb reaches 900 MB in under half a second, so this is the backstop
// and imageGuard.js is the guard. Reading one small file this often is cheap.
const RSS_POLL_MS = 50;

/**
 * A lane of its own, one document wide.
 *
 * A page of OCR is seconds, not the milliseconds a document takes, and it
 * wants both cores for all of them. Sharing convert.js's four slots would put
 * a CSV behind a scan, so the two never queue together. One at a time here is
 * not a throughput limit — the box has two cores and a single document already
 * uses both — it is what keeps the rest of the bot answering.
 */
let running = 0;
const waiting = [];

/** Resolves false when the queue is already long enough to be worth refusing. */
const acquire = () => {
  if (running < OCR_MAX_CONCURRENT) {
    running += 1;
    return Promise.resolve(true);
  }

  if (waiting.length >= OCR_QUEUE_LIMIT) return Promise.resolve(false);

  return new Promise((resolve) => waiting.push(() => resolve(true)));
};

const release = () => {
  const next = waiting.shift();

  if (next) return next();

  running -= 1;
};

/**
 * Resident size of a child, in megabytes, or null where /proc does not exist.
 * The bot runs on Linux; on a Mac this simply does not watch.
 */
const rssMb = (pid) => {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = /VmRSS:\s+(\d+) kB/.exec(status);

    return match ? Number(match[1]) / 1024 : null;
  } catch {
    return null;
  }
};

const run = (bytes, { timeoutMs, maxBytes, maxRssMb, minConfidence, pollMs }) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        WORKER,
        JSON.stringify({
          language: OCR_LANGUAGE,
          dpi: OCR_DPI,
          maxPages: OCR_MAX_PAGES,
          workers: OCR_WORKERS,
          maxPixels: OCR_MAX_PIXELS,
        }),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

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

    // The box has no swap, so a runaway page costs whichever process the
    // kernel picks — possibly another bot. A ceiling here loses this document
    // instead. `ulimit -v` cannot do this job: V8 reserves its address space
    // up front and would die before reading the file.
    const watchdog = setInterval(() => {
      const used = rssMb(child.pid);

      if (used !== null && used > maxRssMb) {
        console.error(`OCR worker at ${Math.round(used)} MB, over ${maxRssMb}`);
        stop('too_large');
      }
    }, pollMs);

    child.stdout.on('data', (chunk) => {
      size += chunk.length;

      if (size > maxBytes) return stop('too_large');

      out.push(chunk);
    });

    child.stderr.on('data', (chunk) => errors.push(chunk));

    child.stdin.on('error', () => {});
    child.stdin.end(bytes);

    child.on('error', (error) => {
      clearTimeout(timer);
      clearInterval(watchdog);
      console.error('OCR worker failed to start:', error.message);
      resolve({ reason: 'worker_crashed' });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(watchdog);

      if (ended) return resolve({ reason: ended });

      const message = Buffer.concat(errors).toString('utf8').trim();

      if (code === 0) {
        let markdown = Buffer.concat(out).toString('utf8');
        let report = {};

        try {
          report = JSON.parse(message);
        } catch {
          // A read that says nothing about itself still produced the text.
        }

        if (markdown.trim()) {
          if (report.pages > OCR_MAX_PAGES) {
            markdown += truncatedNote(OCR_MAX_PAGES, report.pages);
          }

          if (report.confidence != null && report.confidence < minConfidence) {
            console.log(`Read at ${report.confidence.toFixed(2)} confidence`);
            markdown += lowConfidenceNote();
          }
        }

        return resolve({ markdown });
      }

      if (code === 1 && message) {
        console.log('Could not read the picture:', message);

        return resolve({
          reason: ['no_ocr_needed', 'too_complex'].includes(message)
            ? message
            : 'worker_crashed',
          detail: message,
        });
      }

      console.error(`OCR worker died with code ${code}: ${message || 'no output'}`);
      resolve({ reason: 'worker_crashed' });
    });
  });

/**
 * Read the text off a picture, or off a PDF that holds pictures of text.
 * Resolves to `{ markdown }` or `{ reason, detail }` — it does not throw.
 */
export const readPicture = async (
  bytes,
  {
    timeoutMs = OCR_TIMEOUT_MS,
    maxBytes = MAX_MARKDOWN_BYTES,
    maxRssMb = OCR_MAX_RSS_MB,
    minConfidence = OCR_MIN_CONFIDENCE,
    pollMs = RSS_POLL_MS,
  } = {}
) => {
  if (!(await acquire())) return { reason: 'ocr_busy' };

  try {
    const result = await run(bytes, {
      timeoutMs,
      maxBytes,
      maxRssMb,
      minConfidence,
      pollMs,
    });

    // Tesseract answers every picture, and a photo of a wall answers nothing.
    if (typeof result.markdown === 'string' && !result.markdown.trim()) {
      return { reason: 'no_text_found' };
    }

    return result;
  } finally {
    release();
  }
};

export const inFlight = () => running;

export const queued = () => waiting.length;
