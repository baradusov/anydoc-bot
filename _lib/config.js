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

// The Markdown always comes back as a file, and short Markdown rides along in
// the caption so it can be read without downloading anything. A caption caps
// at 1024 characters; the rest is room for being wrong about that.
export const CAPTION_LIMIT = Number(process.env.CAPTION_LIMIT) || 900;

// A spreadsheet of a few megabytes can unfold into far more Markdown than
// anyone wants to receive.
export const MAX_MARKDOWN_BYTES =
  Number(process.env.MAX_MARKDOWN_BYTES) || 8 * 1024 * 1024;

export const BOT_REPLIES = {
  startCommand:
    'Send me a document. I will send back the text as a Markdown file. See /help to learn more.',
  helpCommand: `
<b>Anydoc bot</b> takes the text out of your documents.

Send a file. I send back an <code>.md</code> file with the text inside. If the text is short, you can also read it under the file. Then you do not need to open the file at all.

Markdown (<code>.md</code>) is simple text. Titles, lists and tables stay, so you can paste the text anywhere.

<b>Files I can read</b>
Word (doc, docx), PowerPoint (ppt, pptx), Excel (xls, xlsx), OpenDocument (odt, ods, odp), PDF, RTF, EPUB, CSV.

<b>Files I cannot read</b>
Photos, and PDF files made from photos. They have pictures of text, not real text.

<b>Help and news</b>
Something is not working? Write to @baradusov. News about the bot: @baradusov_support.

<b>Commands</b>
/help — show this message`,
  limit: 'The bot is off for now. See @baradusov_support for news.',
  working: '⏳ Reading your document…',
  noDocument:
    'Please send your document as a <b>file</b>. I will take the text out of it. See /help for the files I can read.',
  photo:
    'This is a photo. I can read text in a file, but not in a picture. Please send the document as a file.',
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
  malformed: 'This file is broken. I could not open it 😞',
  empty: 'I opened this file, but there is no text inside it 😞',
  too_large:
    'This document has too much text to send 🙅 Please try a smaller one.',
  timeout: 'This file takes too long to read 😞',
  download_failed:
    'I could not get your file from Telegram. Please send it again 😞',
  worker_crashed: 'Something went wrong. I could not read this file 😞',
};
