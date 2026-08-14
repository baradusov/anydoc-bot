export const BOT_TOKEN =
  process.env.NODE_ENV === 'development'
    ? process.env.BOT_TOKEN_DEV
    : process.env.BOT_TOKEN;

// Telegram will not hand a bot a file bigger than this through getFile, so the
// document is rejected from the update itself, before anything is downloaded.
export const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES) || 20 * 1024 * 1024;

export const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS, 10) || 20000;

// Conversion itself takes milliseconds; the budget is almost entirely the
// download from Telegram.
export const CONVERT_TIMEOUT_MS =
  parseInt(process.env.CONVERT_TIMEOUT_MS, 10) || 10000;

export const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 4;

// Ceilings on what a ZIP container says it holds, checked before the parser
// sees it. Markup is what turns into memory, so it has the tighter one; media
// is only stored. See zipGuard.js.
export const MAX_XML_BYTES = Number(process.env.MAX_XML_BYTES) || 40 * 1024 * 1024;

export const MAX_UNCOMPRESSED_BYTES =
  Number(process.env.MAX_UNCOMPRESSED_BYTES) || 200 * 1024 * 1024;

// The Markdown always comes back as a file, and short Markdown rides along in
// the caption so it can be read without downloading anything. A caption caps
// at 1024 characters; the rest is room for being wrong about that.
export const CAPTION_LIMIT = Number(process.env.CAPTION_LIMIT) || 900;

// A spreadsheet of a few megabytes can unfold into far more Markdown than
// anyone wants to receive.
export const MAX_MARKDOWN_BYTES =
  Number(process.env.MAX_MARKDOWN_BYTES) || 8 * 1024 * 1024;

// OCR is seconds per page where a document is milliseconds, so it gets its own
// limits rather than sharing the ones above. See ocr.js.
export const OCR_ENABLED = process.env.OCR_ENABLED !== 'false';

// Tesseract language codes, joined by '+'. Adding a second one costs about 4%
// and loses nothing. Left-to-right scripts only: the reconstruction places
// words by position on the page, which reverses Arabic, Hebrew and the rest.
export const OCR_LANGUAGE = process.env.OCR_LANGUAGE || 'eng+rus';

// About 2.3 s a page on the server.
export const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES) || 15;

export const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS) || 60000;

// 300 dpi costs 30% more time and 40% more memory for 0.5% more accuracy.
export const OCR_DPI = Number(process.env.OCR_DPI) || 150;

// The queue is serial, so two threads on one document halve the wait for the
// same throughput.
export const OCR_WORKERS = Number(process.env.OCR_WORKERS) || 2;

export const OCR_MAX_CONCURRENT = Number(process.env.OCR_MAX_CONCURRENT) || 1;

// Past this many waiting, refusing beats a silent multi-minute wait.
export const OCR_QUEUE_LIMIT = Number(process.env.OCR_QUEUE_LIMIT) || 3;

// A picture decodes to about four bytes a pixel, so this is the ceiling on the
// raster the parser is asked to hold. A4 at 600 dpi is 35 MP; phones make 12.
export const OCR_MAX_PIXELS = Number(process.env.OCR_MAX_PIXELS) || 40000000;

// Ten pages at 150 dpi peaked at 174 MB. The server has no swap, so the limit
// costs one document instead of whichever process the kernel picks.
export const OCR_MAX_RSS_MB = Number(process.env.OCR_MAX_RSS_MB) || 400;

// A clean page of English averages 0.96, and 0.91 at half the resolution. The
// same page in the wrong language averages 0.50. The ranges nearly overlap, so
// a low score warns rather than discards the read.
export const OCR_MIN_CONFIDENCE = Number(process.env.OCR_MIN_CONFIDENCE) || 0.75;

export const BOT_REPLIES = {
  startCommand:
    'Send me a document. I will send back the text as a Markdown file. See /help to learn more.',
  helpCommand: `
<b>Anydoc bot</b> takes the text out of your documents.

Send a file. I send back an <code>.md</code> file with the text inside. If the text is short, you can also read it under the file. Then you do not need to open the file at all.

Markdown (<code>.md</code>) is simple text. Titles, lists and tables stay, so you can paste the text anywhere.

<b>Files I can read</b>
Word (doc, docx), PowerPoint (ppt, pptx), Excel (xls, xlsx), OpenDocument (odt, ods, odp), PDF, RTF, EPUB, CSV.

<b>Pictures</b>
You can also send a photo, a picture file (jpg, png), or a PDF made from photos. I look at the picture and read the text in it. This takes longer, and the text is only as good as the picture: bright light, no shadow, and the page flat on the table work best.

In pictures I read English and Russian. Other languages come back wrong, so I do not try.

<b>Help and news</b>
Something is not working? Write to @baradusov. News about the bot: @unary_bots.

<b>Commands</b>
/help — show this message`,
  limit: 'The bot is off for now. See @unary_bots for news.',
  working: '⏳ Reading your document…',
  workingOnPicture:
    '⏳ This one is a picture, so I read the text letter by letter. It takes longer. Please wait.',
  noDocument:
    'Please send your document as a <b>file</b>. I will take the text out of it. See /help for the files I can read.',
  tooBig: 'This file is too big 🙅 I can only take files up to 20 MB.',
  gaveUp:
    'I tried to read this file many times, but it did not work 🙅 I will stop now. Sorry!',
  tooFast:
    'That is a lot of files at once 😅 I read them one by one. Please wait a minute and send them again.',
};

export const FAILURE_REPLIES = {
  unsupported: 'I cannot read this kind of file 🙅 See /help for the files I can read.',
  needs_ocr:
    'This PDF is made from photos. It has pictures of text, not real text, so I cannot read it 😞',
  ocr_busy:
    'A lot of pictures came in at once, and I read them one by one 😅 Please send this one again in a minute.',
  no_text_found:
    'I looked at this picture, but I could not find any text in it 😞 A brighter photo with the page flat may work better.',
  malformed: 'This file is broken. I could not open it 😞',
  empty: 'I opened this file, but there is no text inside it 😞',
  too_large:
    'This document has too much text to send 🙅 Please try a smaller one.',
  too_complex:
    'This file is very small outside, but very big inside. I cannot open it 🙅',
  timeout: 'This file takes too long to read 😞',
  download_failed:
    'I could not get your file from Telegram. Please send it again 😞',
  worker_crashed: 'Something went wrong. I could not read this file 😞',
};

// Both go into the Markdown file, under the text.
export const truncatedNote = (shown, total) =>
  `\n\n---\n\nI read the first ${shown} pages of ${total}. Reading pictures is slow, so I stop there.\n`;

export const lowConfidenceNote = () =>
  '\n\n---\n\nI was not sure about many of the words here, so some of them are ' +
  'likely wrong. A bigger, brighter picture helps. In pictures I read English ' +
  'and Russian only.\n';
