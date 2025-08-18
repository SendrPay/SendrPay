import { Bot, Context, session } from "grammy";
import { env } from "./infra/env";
import { logger } from "./infra/logger";
import { registerGroupRoutes, registerDMRoutes } from "./commands";

// Extend context with session data
interface SessionData {
  awaitingPrivateKey?: boolean;
  linkingPhantom?: boolean;
  phantomNonce?: string;
}

type BotContext = Context & {
  session: SessionData;
};

// Only create bot if token is available
export const bot = env.BOT_TOKEN ? new Bot<BotContext>(env.BOT_TOKEN) : null;

// Configure bot if available
if (bot) {
  // Add session middleware
  bot.use(session({
    initial: (): SessionData => ({})
  }));

  // Global error handling
  bot.catch((err) => {
    const error = err.error;
    const ctx = err.ctx;
    logger.error(`Bot error: ${error instanceof Error ? error.message : String(error)}`);
    logger.error(`Error context - Update: ${ctx.update.update_id}, Chat: ${ctx.chat?.id}, User: ${ctx.from?.id}`);
  });

  // Log all updates for debugging
  bot.use((ctx, next) => {
    console.log("=== BOT UPDATE DEBUG ===");
    console.log("Update ID:", ctx.update.update_id);
    console.log("Chat ID:", ctx.chat?.id);
    console.log("Chat type:", ctx.chat?.type);
    console.log("User ID:", ctx.from?.id);
    console.log("Message text:", ctx.message?.text);
    console.log("Has reply:", !!ctx.message?.reply_to_message);
    console.log("Update type:", Object.keys(ctx.update).join(", "));
    console.log("Raw update:", JSON.stringify(ctx.update, null, 2));
    console.log("=== BOT UPDATE DEBUG END ===");
    
    logger.info(`Update: ${ctx.update.update_id}, Chat: ${ctx.chat?.id}, User: ${ctx.from?.id}`);
    return next();
  });

  // Register command routers
  registerGroupRoutes(bot);
  registerDMRoutes(bot);
  
  // Register KOL submenu callbacks
  import("./commands").then(({ registerKolSubmenuCallbacks }) => {
    registerKolSubmenuCallbacks(bot);
  });

  // Handle notification callbacks (reactions only)
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    if (data.startsWith("react_")) {
      // Handle payment reactions
      const { handleReactionCallback } = await import("./core/notifications-simple");
      await handleReactionCallback(ctx);
    } else if (data === "already_reacted") {
      // Handle already reacted button
      const { handleAlreadyReacted } = await import("./core/notifications-simple");
      await handleAlreadyReacted(ctx);
    }
    // Other callback handlers will be processed by command routers
  });

  // Handle general messages (non-command) - route to appropriate handlers
  bot.on("message", async (ctx) => {
    const chatType = ctx.chat?.type;
    const text = ctx.message?.text || "";
    const session = ctx.session as any;
    
    // Only handle non-command messages when not in any active workflow
    if (!text.startsWith("/")) {
      if (chatType === "private") {
        // Post creation workflow handling
        if (session.postCreation) {
          const { 
            handlePostTitleInput, 
            handlePostTeaserInput, 
            handlePostContentInput, 
            handlePostPriceInput 
          } = await import("./commands/post-locked");
          
          switch (session.postCreation.step) {
            case "set_title":
              await handlePostTitleInput(ctx);
              return;
            case "set_teaser":
              await handlePostTeaserInput(ctx);
              return;
            case "set_content":
              await handlePostContentInput(ctx);
              return;
            case "set_price":
              await handlePostPriceInput(ctx);
              return;
          }
        }
        
        // Channel posting workflow for KOL messages
        if (session.awaitingChannelInput) {
          const { handleKolPostChannelInput } = await import("./commands/kol-post");
          await handleKolPostChannelInput(ctx);
          return;
        }
        
        // Check if user is in any active workflow before showing default message
        const inWorkflow = session.awaitingPrivateKey || 
                          session.expectingGroupPrice || 
                          session.linkingGroup || 
                          session.channelSetup || 
                          session.postCreation || 
                          session.awaitingChannelInput ||
                          session.tipIntent?.step === 'custom_amount';
        
        if (!inWorkflow) {
          // Default private message handler - only respond when not in workflow
          await ctx.reply("Use /start to begin or /help for commands.");
        }
      }
      // Ignore other group messages without commands
    }
  });

  // Handle media uploads in post creation
  bot.on(["message:photo", "message:video"], async (ctx) => {
    const session = ctx.session as any;
    
    if (ctx.chat?.type === "private" && session.postCreation?.step === "set_content") {
      const { handlePostMediaUpload } = await import("./commands/post-locked");
      await handlePostMediaUpload(ctx);
    }
  });
}

export { BotContext };
