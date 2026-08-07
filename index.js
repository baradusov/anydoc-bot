import './_lib/env.js';

import { Bot } from 'grammy';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import {
  BOT_REPLIES,
  BOT_TOKEN,
  CAPTION_LIMIT,
  FAILURE_REPLIES,
} from './_lib/config.js';
import { handleDocument, handlePhoto } from './_lib/handleDocument.js';
import { printable } from './_lib/formats.js';
import { startProgress, finishWithDocument, failWith } from './_lib/progress.js';
import { record } from './_lib/stats.js';
import { buildStatsMessage } from './_lib/statsMessage.js';
import { take } from './_lib/rateLimit.js';
import { startAttempt, finishAttempt } from './_lib/attempts.js';

const bot = new Bot(BOT_TOKEN);

bot.api.config.use(apiThrottler());

const formatOf = (ctx) => {
  const name = ctx.message?.document?.file_name || '';
  const dot = name.lastIndexOf('.');

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
};

const survivesRetries = (ctx) => {
  const { tries, giveUp } = startAttempt(ctx.update.update_id);

  if (!giveUp) return true;

  console.error(`Giving up on update ${ctx.update.update_id} after ${tries} tries`);
  record(ctx.chat.id, formatOf(ctx), 'failed', 'poison_update');
  finishAttempt(ctx.update.update_id);

  ctx.reply(BOT_REPLIES.gaveUp, {
    reply_to_message_id: ctx.message.message_id,
  }).catch((error) => console.error('Give-up notice failed:', error.message));

  return false;
};

const passesRateLimit = (ctx) => {
  const gate = take(ctx.chat.id);

  if (gate.allowed) return true;

  if (gate.notify) {
    console.log(`Rate limited: ${ctx.chat.id}`);
    record(ctx.chat.id, formatOf(ctx), 'rate_limited', 'rate_limited');

    ctx.reply(BOT_REPLIES.tooFast, {
      reply_to_message_id: ctx.message.message_id,
    }).catch((error) => console.error('Rate limit notice failed:', error.message));
  }

  return false;
};

bot.command('start', (ctx) => {
  return ctx.reply(BOT_REPLIES.startCommand);
});

bot.command('help', (ctx) => {
  return ctx.reply(BOT_REPLIES.helpCommand, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
});

bot.command('stats', async (ctx) => {
  const admin = process.env.ADMIN_CHAT_ID;

  if (!admin || String(ctx.chat.id) !== String(admin)) {
    return;
  }

  const period = Math.min(Math.max(parseInt(ctx.match, 10) || 30, 1), 3650);

  return ctx.api.sendRichMessage(ctx.chat.id, buildStatsMessage(period));
});

/**
 * Everything an incoming file goes through, whichever way it arrived: the
 * gates, the notice, the reply and the row in the statistics. Only the reading
 * differs between a document and a photo.
 */
const serve = async (ctx, read, { name, bytes }) => {
  if (process.env.BOT_STATUS === 'disabled') {
    return ctx.reply(BOT_REPLIES.limit);
  }

  if (!passesRateLimit(ctx)) return;
  if (!survivesRetries(ctx)) return;

  console.log(`Converting ${printable(name)} (${bytes} bytes) for ${ctx.chat.id}`);

  const progress = startProgress(ctx, BOT_REPLIES.working);
  const startedAt = Date.now();
  const queuedMs = ctx.message.date
    ? Math.max(0, startedAt - ctx.message.date * 1000)
    : null;
  const { markdown, filename, format, reason } = await read(ctx, {
    onPicture: () => progress.announce(BOT_REPLIES.workingOnPicture),
  });
  const status = await progress.settle();
  const timing = { bytes, ms: Date.now() - startedAt, queueMs: queuedMs };

  if (!markdown) {
    console.log(`No markdown for ${printable(name)}. Reason: ${reason}`);
    record(ctx.chat.id, format, 'failed', reason, timing);
    finishAttempt(ctx.update.update_id);

    return failWith(
      ctx,
      status,
      FAILURE_REPLIES[reason] || FAILURE_REPLIES.worker_crashed
    );
  }

  console.log(`Converted ${printable(name)} → ${markdown.length} characters of markdown`);
  record(ctx.chat.id, format, 'markdown', null, timing);
  finishAttempt(ctx.update.update_id);

  // Always a file — that is what people came for, and it cannot be truncated
  // or refused for its length. Short Markdown rides along in the caption so it
  // can also be read without downloading anything.
  const caption = markdown.length <= CAPTION_LIMIT ? markdown : undefined;

  return finishWithDocument(
    ctx,
    status,
    Buffer.from(markdown, 'utf8'),
    filename,
    caption
  );
};

bot.on('message:document', (ctx) =>
  serve(ctx, handleDocument, {
    name: ctx.message.document.file_name,
    bytes: ctx.message.document.file_size,
  })
);

bot.on('message:photo', (ctx) => {
  const sizes = ctx.message.photo;

  return serve(ctx, handlePhoto, {
    name: 'photo',
    bytes: sizes[sizes.length - 1].file_size,
  });
});

bot.on('message', (ctx) => {
  if (ctx.chat.type !== 'private') return;

  record(ctx.chat.id, null, 'failed', 'not_a_document');

  return ctx.reply(BOT_REPLIES.noDocument, { parse_mode: 'HTML' });
});

bot.catch(async (reason) => {
  const { error, ctx } = reason;

  // Forbidden: bot was blocked by the user
  if (error.error_code === 403) {
    return console.error('Bot blocked by user:', error.description);
  }

  // Bad Request: replied message not found
  if (error.error_code === 400) {
    return console.error('Bad request:', error.description);
  }

  console.error('Unhandled error:', error.name, error.message);

  try {
    return await ctx.reply('Something went wrong 😞', {
      reply_to_message_id: ctx.message?.message_id,
    });
  } catch (replyError) {
    console.error('Failed to send error message:', replyError.message);
  }
});

bot.start({
  allowed_updates: ['message'],
  onStart: ({ username }) => console.log(`Started as @${username}`),
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
