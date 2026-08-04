# Anydoc Bot

Telegram bot that turns office documents into Markdown. Send a file, get an
`.md` file back, with the text in the caption when it is short.

Conversion is [`@firecrawl/anydoc`](https://github.com/firecrawl/anydoc) — a
Rust parser behind a native binding. No external service, no API key, no
system packages. Word, PowerPoint, Excel, OpenDocument, PDF, RTF, EPUB, CSV.

## Requirements

- Node.js >= 22.5.0 — `node:sqlite` for the statistics, anydoc wants >= 20
- Nothing else. `npm ci` pulls a prebuilt binary for the platform

anydoc is young — 0.1.3, published 4 August 2026 — so the version is pinned
exactly. Read its changelog before moving it.

## Environment Variables

```
BOT_TOKEN=<telegram_bot_token>
BOT_TOKEN_DEV=<telegram_bot_token_for_dev>
ADMIN_CHAT_ID=<chat that /stats answers>
```

See [`.env.example`](.env.example) for the limits. Every one has a default.

`.env` is loaded from [`_lib/env.js`](_lib/env.js), imported first in
`index.js`. ESM evaluates imports before the importing module's body, so
`dotenv.config()` written into `index.js` would run after `config.js` had read
`process.env`.

## How it works

1. `file_size` is checked against 20 MB — Telegram will not hand a bot a
   bigger file through `getFile`. A local Bot API server would raise it to 2 GB.
2. [`_lib/formats.js`](_lib/formats.js) picks the format: the content decides,
   the file name is the fallback. `report.docx` may be a PDF. CSV has no
   signature and can only go by name.
3. [`_lib/zipGuard.js`](_lib/zipGuard.js) reads what a ZIP container claims
   to hold and refuses the absurd — see below.
4. [`_lib/convert.js`](_lib/convert.js) converts it in a child process.
5. The Markdown always comes back as a file. Under `CAPTION_LIMIT` characters
   it is also the caption, so a two-line CSV needs no download.

The parser is Rust behind a native binding, and its input is a binary file
from a stranger. A panic there takes the process down where `bot.catch` cannot
see it, hence the child process: `convert()` returns `{ markdown }` or
`{ reason }` and never throws. `MAX_CONCURRENT` caps how many run at once.

The caption carries no `parse_mode` — it is Markdown from someone's document,
and parsing it would fail the send on the first stray asterisk.

### The zip guard

Office formats are ZIP archives, and a 98 KB `.docx` can carry 100 MB of
markup. The parser holds all of it at once — measured at 940 MB of RSS, in
under a second, on a box with 1.2 GB free. Neither existing limit helps:
`MAX_MARKDOWN_BYTES` only counts what has already been written to stdout, and
`CONVERT_TIMEOUT_MS` never fires because the bomb is fast. anydoc has a guard
of its own, but it counts XML nodes, so it misses few nodes holding enormous
text.

So a ZIP is opened before the parser sees it — the central directory declares
every entry's uncompressed size, which reads in microseconds without
decompressing anything. Markup gets the tighter ceiling (`MAX_XML_BYTES`,
40 MB); media only counts toward `MAX_UNCOMPRESSED_BYTES`, since images are
stored, not parsed into a tree. Zip64 is refused rather than parsed.

A liar can still declare small and deliver large. The child process, the
output cap and the timeout are what remain for that, which is what they are
for.

## User-facing text

Every string the user sees is in `BOT_REPLIES` and `FAILURE_REPLIES` in
[`_lib/config.js`](_lib/config.js). The audience reads English as a second
language: short sentences, common words, no idioms, terms spelled out. Does
not apply to this file, the comments or the logs.

## Statistics

Every handled document is recorded in SQLite at `data/stats.db` through
`node:sqlite` — see [`_lib/stats.js`](_lib/stats.js). The table is created on
first run. Override the location with `STATS_DB_PATH`.

A row is a chat id, a format, an outcome (`markdown`, `failed`,
`rate_limited`), a reason when it failed, the file size and how long the
person waited. The file is never written to disk and never stored.

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

A format is often the extension off a name a stranger chose, so only
`^[a-z0-9]{1,10}$` reaches the table. A test guards this.

### The /stats command

`/stats` sends the whole picture back as tables, using Bot API rich messages
(`sendRichMessage`). Takes an optional period: `/stats 7`. It is not declared
in the command menu and answers only `ADMIN_CHAT_ID`; everyone else gets
silence. With `ADMIN_CHAT_ID` unset it answers nobody.

Two things worth knowing if you touch it:

- grammY's convenience methods are positional — `api.sendRichMessage(chatId, message)`.
  The object form lives on `api.raw`; passing an object to the convenience
  method silently sends an empty rich message.
- The message is built from typed blocks, never the `html` or `markdown`
  fields, so a filename cannot smuggle in markup.

## Tests

```bash
npm test
```

`node:test`, no runner. Conversion is covered end to end against a real
`.docx` in [`_lib/__fixtures__`](_lib/__fixtures__) — through the child
process — including a broken file, an unknown one, a timeout and an oversized
result. Bot handlers are not covered.

The fixture is a hand-built minimal OOXML package. If you rebuild it, keep
`xml:space="preserve"` on every `<w:t>` with meaningful leading or trailing
space; without it that space is not significant and words glue to their bold
neighbours.

## Development

```bash
npm install
NODE_ENV=development npm start
```

Uses `BOT_TOKEN_DEV` when `NODE_ENV=development`. Two bots must never poll the
same token.

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
