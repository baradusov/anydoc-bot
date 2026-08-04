import { InputFile } from 'grammy';

const DELAY_MS = Number(process.env.PROGRESS_DELAY_MS) || 600;

export const startProgress = (ctx, text, delayMs = DELAY_MS) => {
  let sending = null;

  const timer = setTimeout(() => {
    sending = ctx
      .reply(text, { reply_to_message_id: ctx.message.message_id })
      .catch((error) => {
        console.error('Progress notice failed:', error.message);
        return null;
      });
  }, delayMs);

  return {
    async settle() {
      clearTimeout(timer);
      return sending ? sending : null;
    },
  };
};

/**
 * The caption, when there is one, carries no parse_mode on purpose. It is
 * Markdown extracted from someone's document; asking Telegram to parse it
 * would fail the send on the first stray asterisk.
 */
export const finishWithDocument = async (ctx, status, buffer, filename, caption) => {
  if (status) {
    try {
      return await ctx.api.editMessageMedia(ctx.chat.id, status.message_id, {
        type: 'document',
        media: new InputFile(buffer, filename),
        caption,
      });
    } catch (error) {
      console.error('Editing into a document failed:', error.message);
      await failWith(ctx, status, 'Here it is 👇').catch(() => {});
    }
  }

  return ctx.replyWithDocument(new InputFile(buffer, filename), {
    caption,
    reply_to_message_id: ctx.message.message_id,
  });
};

export const failWith = (ctx, status, text) => {
  if (status) {
    return ctx.api.editMessageText(ctx.chat.id, status.message_id, text);
  }

  return ctx.reply(text, { reply_to_message_id: ctx.message.message_id });
};
