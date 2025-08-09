import { Request, Response } from "express";
import { validateWebhookSignature } from "../core/webhooks";
import { processTransactionUpdate } from "../core/webhooks";
import { logger } from "../infra/logger";

export const heliusWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-helius-signature'] as string;
    const body = req.body;

    // Validate webhook signature
    if (!validateWebhookSignature(JSON.stringify(body), signature)) {
      logger.warn("Invalid Helius webhook signature");
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Process transaction updates
    if (body.type === "TRANSACTION") {
      await processTransactionUpdate(body);
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("Helius webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
