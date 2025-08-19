import { bot } from "../src/bot";

/**
 * Forwards raw Telegram updates to the configured bot instance.
 * Errors are swallowed so the webhook response can be sent immediately.
 */
export async function handleTelegramUpdate(update: unknown): Promise<void> {
  if (!bot) return;
  try {
    await bot.handleUpdate(update);
  } catch (err) {
    console.error("Failed to process Telegram update", err);
  }
}
