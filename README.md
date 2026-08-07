# Anydoc Bot

Telegram bot. Send a file, get Markdown back.

- Documents → [`@firecrawl/anydoc`](https://github.com/firecrawl/anydoc).
  Word, PowerPoint, Excel, OpenDocument, PDF, RTF, EPUB, CSV.
- Pictures, photos, scanned PDFs → [`@llamaindex/liteparse`](https://github.com/run-llama/liteparse).
  PNG, JPEG, GIF, BMP, TIFF. English and Russian.

Both are Rust behind a native binding. No external service, no API key, no
system packages.

## Requirements

- Node.js >= 22.5.0
- Outbound access to GitHub on the first OCR run, for the language data

Versions are pinned exactly. Read the upstream changelog before moving them.

## Development

```bash
npm install
NODE_ENV=development npm start   # uses BOT_TOKEN_DEV
npm test                         # node:test, no runner
```

## Configuration

`BOT_TOKEN`, `BOT_TOKEN_DEV`, `ADMIN_CHAT_ID`, and about twenty limits — all in
[`.env.example`](.env.example), all with defaults.

## Path of a file

1. `file_size` against 20 MB — Telegram will not serve a bot more through
   `getFile`.
2. [`formats.js`](_lib/formats.js) names the format from the content, falling
   back to the file name.
3. [`zipGuard.js`](_lib/zipGuard.js) / [`imageGuard.js`](_lib/imageGuard.js)
   refuse what declares too much.
4. [`convert.js`](_lib/convert.js) or [`ocr.js`](_lib/ocr.js) runs it in a
   child process.
5. Markdown comes back as a file, and as the caption when under
   `CAPTION_LIMIT`.

A file reaches OCR when it is a picture, or a PDF anydoc found no text in.
`isComplex()` confirms there is no text layer before OCR starts.

## Two queues

| | documents | pictures |
|---|---|---|
| module | `convert.js` | `ocr.js` |
| at once | `MAX_CONCURRENT` (4) | `OCR_MAX_CONCURRENT` (1) |
| queue | unbounded | `OCR_QUEUE_LIMIT` (3), then `ocr_busy` |
| per file | milliseconds | ~2.3 s a page |

Separate, so a CSV never waits behind a scan.

## Guards

Everything a stranger sends is hostile input to a native parser.

| guard | limit | what it stops |
|---|---|---|
| `zipGuard.js` | `MAX_XML_BYTES`, `MAX_UNCOMPRESSED_BYTES` | 98 KB docx holding 100 MB of markup |
| `imageGuard.js` | `OCR_MAX_PIXELS` | 380 KB PNG declaring 20000x20000 |
| `ocrWorker.js` | `OCR_MAX_PIXELS` | 13 KB PDF with a 900 megapixel page |
| `ocr.js` watchdog | `OCR_MAX_RSS_MB` | anything the above missed |
| child process | — | a panic in Rust |
| timeouts, output caps | `*_TIMEOUT_MS`, `MAX_MARKDOWN_BYTES` | a slow or endless file |

## Output notes

Appended to the Markdown, not sent as a message:

- pages skipped past `OCR_MAX_PAGES`
- average Tesseract confidence below `OCR_MIN_CONFIDENCE`

## Languages

`OCR_LANGUAGE` is `eng+rus`. A second language costs ~4% and loses nothing.

**Left-to-right only.** liteparse places OCR results by position and applies no
bidi, so right-to-left comes back reversed: `شهادة عمل` reads `عمل شهادة`. 80%
of words correct, 5% in the right place. The text layer path is unaffected.

Language data is not bundled — the first read downloads it into
`~/.tesseract-rs/tessdata`.

## Statistics

SQLite at `data/stats.db` via `node:sqlite`, see [`stats.js`](_lib/stats.js).
Override the location with `STATS_DB_PATH`. One row per file: chat id, format,
outcome, reason, size, timings. The file itself is never written to disk or
stored.

```js
import { summary, topUsers, topFormats, outcomes, reasons,
         returning, timings, sizes, slowestFormats } from './_lib/stats.js';

summary(30);         // { requests, users, converted }
topFormats(30);      // [{ format, count, converted }, …]
reasons(30);         // [{ reason, count }, …] why it did not work
timings(30);         // { count, median, p90, p99, max }
sizes(30);           // the same, over file size in bytes
slowestFormats(30);  // [{ format, count, avgMs }, …]
```

`/stats [days]` answers `ADMIN_CHAT_ID` only, and that chat is never recorded.

## Gotchas

- Two processes must never poll one bot token. Hence pm2 fork mode, not
  cluster.
- The caption carries no `parse_mode`. It is a stranger's Markdown; one stray
  asterisk would fail the send.
- `/stats` uses typed blocks, never the `html` or `markdown` fields, so a
  filename cannot smuggle in markup.
- grammY convenience methods are positional: `api.sendRichMessage(chatId, msg)`.
  Passing an object sends an empty message, silently. The object form is on
  `api.raw`.
- `ulimit -v` cannot cap the OCR worker: V8 reserves its address space at
  startup and dies before reading the file. Hence polling `/proc`.
- The OCR memory watchdog alone is too slow for a picture bomb — 920 MB in
  454 ms. The header check is the real defence.
- `.env` is loaded in [`env.js`](_lib/env.js), imported first in `index.js`.
  ESM evaluates imports before the importing module body.
- The `.docx` fixture needs `xml:space="preserve"` on every `<w:t>` with
  meaningful edge space, or words glue to their bold neighbours.
- WebP is not accepted: its dimensions sit behind three chunk layouts, and
  anything unmeasurable is refused.

## Production

```bash
npm ci --omit=dev
pm2 startOrReload ecosystem.config.cjs
```

### PM2 Commands

```bash
pm2 stop anydoc      # Stop the bot
pm2 start anydoc     # Start the bot
pm2 restart anydoc   # Restart the bot
pm2 logs anydoc      # View logs
pm2 status           # Check status
```

## Deploy

### Manual deploy

```bash
ssh yo
cd ~/www/anydoc-bot/app
git pull
npm ci --omit=dev
pm2 startOrReload ecosystem.config.cjs
```

### GitHub Actions deploy

Automated deployment is triggered by publishing a release.

Before creating release:

1. Commit all code changes first (separate commit)
2. Then prepare release commit:
   - Update version in `package.json`
   - Run `npm install` to update `package-lock.json`
   - Update `CHANGELOG.md`
   - Commit with message: `release X.X.X`
3. Push to master

### Required GitHub secrets

- `TS_OAUTH_CLIENT_ID` — Tailscale OAuth client ID
- `TS_OAUTH_SECRET` — Tailscale OAuth client secret
- `SSH_HOST` — server Tailscale IP or hostname
- `SSH_USERNAME` — SSH user
- `SSH_KEY` — private SSH key for authentication
