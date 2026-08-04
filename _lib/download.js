import { BOT_TOKEN } from './config.js';

/**
 * Telegram hands out a file in two steps: getFile returns a path, the path is
 * fetched from a different host. grammY has a plugin for this, but it is four
 * lines and one less dependency to keep an eye on.
 */
export const download = async (ctx, signal) => {
  const { file_path: path } = await ctx.getFile();

  const response = await fetch(
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error(`File download failed with ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
};
