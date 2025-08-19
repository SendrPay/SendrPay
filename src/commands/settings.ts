import { BotContext } from "../bot";

export async function commandSettings(ctx: BotContext) {
  // Redirect to the main interface for a unified experience
  const { commandInlineInterface } = await import("./inline-interface");
  return commandInlineInterface(ctx);
}

// Legacy callback handler - redirect to modern interface
export async function handleSettingsCallback(ctx: BotContext) {
  await ctx.answerCallbackQuery();
  const { commandInlineInterface } = await import("./inline-interface");
  return commandInlineInterface(ctx);
}

