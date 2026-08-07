import { InputFile } from 'grammy';

const DELAY_MS = Number(process.env.PROGRESS_DELAY_MS) || 600;

// Telegram shows an action for five seconds, so it has to be renewed to stay
// on screen for the length of a read.
const ACTION_MS = 4000;

export const startProgress = (ctx, text, delayMs = DELAY_MS) => {
  let sending = null;
  let current = text;
  let announcing = null;
  let action = null;

  const timer = setTimeout(() => {
    sending = ctx
      .reply(current, { reply_to_message_id: ctx.message.message_id })
      .catch((error) => {
        console.error('Progress notice failed:', error.message);
        return null;
      });
  }, delayMs);

  const keepAlive = () => {
    ctx.replyWithChatAction('upload_document').catch(() => {});
  };

  return {
    /**
     * Say something else, because this one turned out to be slow. Whether the
     * first notice is already out decides between editing it and changing the
     * text it is still going to be sent with.
     */
    announce(next) {
      current = next;

      if (!action) {
        keepAlive();
        action = setInterval(keepAlive, ACTION_MS);
      }

      announcing = Promise.resolve(sending).then((status) => {
        if (!status) return null;

        return ctx.api
          .editMessageText(ctx.chat.id, status.message_id, next)
          .catch((error) => console.error('Progress update failed:', error.message));
      });

      return announcing;
    },

    async settle() {
      clearTimeout(timer);

      if (action) clearInterval(action);

      // The notice and its edit both have to land before the message is turned
      // into the document, or the edit arrives after and puts the text back.
      await announcing;

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
