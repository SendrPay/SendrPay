import { Request, Response } from "express";
import { bot } from "../bot";
import { webhookCallback } from "grammy";
import { logger } from "../infra/logger";

// Create webhook handler
let handleUpdate: any = null;
if (bot) {
  handleUpdate = webhookCallback(bot, "express");
}

export const telegramWebhook = async (req: Request, res: Response) => {
  try {
    if (!handleUpdate) {
      return res.status(503).json({ error: "Bot not configured" });
    }
    await handleUpdate(req, res);
  } catch (error) {
    logger.error("Telegram webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
