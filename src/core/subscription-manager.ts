import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";

export interface SubscriptionInfo {
  id: string;
  subscriberId: number;
  kolOwnerId: number;
  groupChatId: string;
  subscriptionType: string;
  billingCycle?: string;
  paymentToken: string;
  pricePerPeriod: string;
  status: string;
  nextBillingDate?: Date;
  lastPaymentDate?: Date;
  failedPayments: number;
}

export class SubscriptionManager {
  
  /**
   * Create a new subscription when user joins a recurring group
   */
  static async createSubscription(
    subscriberId: number,
    kolOwnerId: number,
    groupChatId: string,
    kolSettings: any,
    paymentId: string
  ): Promise<SubscriptionInfo | null> {
    try {
      if (kolSettings.subscriptionType !== "recurring") {
        // For one-time payments, just create group access record
        await prisma.groupAccess.create({
          data: {
            memberId: subscriberId,
            groupOwnerId: kolOwnerId,
            groupChatId: groupChatId,
            paymentId: paymentId
          }
        });
        return null;
      }

      // Calculate next billing date based on cycle
      const nextBillingDate = this.calculateNextBillingDate(kolSettings.billingCycle);

      const subscription = await prisma.subscription.create({
        data: {
          subscriberId: subscriberId,
          kolOwnerId: kolOwnerId,
          groupChatId: groupChatId,
          subscriptionType: "recurring",
          billingCycle: kolSettings.billingCycle,
          paymentToken: kolSettings.groupAccessToken,
          pricePerPeriod: kolSettings.groupAccessPrice,
          status: "active",
          startDate: new Date(),
          nextBillingDate: nextBillingDate,
          lastPaymentDate: new Date(),
          failedPayments: 0
        }
      });

      // Also create group access record
      await prisma.groupAccess.create({
        data: {
          memberId: subscriberId,
          groupOwnerId: kolOwnerId,
          groupChatId: groupChatId,
          paymentId: paymentId
        }
      });

      logger.info("Created recurring subscription", { subscriptionId: subscription.id });
      return subscription as SubscriptionInfo;

    } catch (error) {
      logger.error("Error creating subscription:", error);
      return null;
    }
  }

  /**
   * Process all due subscriptions
   */
  static async processDueSubscriptions(): Promise<void> {
    try {
      const dueSubscriptions = await prisma.subscription.findMany({
        where: {
          status: "active",
          nextBillingDate: {
            lte: new Date()
          }
        },
        include: {
          subscriber: {
            include: {
              wallets: {
                where: { isActive: true }
              }
            }
          },
          kolOwner: {
            include: {
              wallets: {
                where: { isActive: true }
              }
            }
          }
        }
      });

      logger.info(`Processing ${dueSubscriptions.length} due subscriptions`);

      for (const subscription of dueSubscriptions) {
        await this.processSubscriptionPayment(subscription);
      }

    } catch (error) {
      logger.error("Error processing due subscriptions:", error);
    }
  }

  /**
   * Process payment for a single subscription
   */
  static async processSubscriptionPayment(subscription: any): Promise<void> {
    try {
      if (!subscription.subscriber?.wallets?.[0] || !subscription.kolOwner?.wallets?.[0]) {
        logger.error("Missing wallets for subscription payment", { subscriptionId: subscription.id });
        await this.handleFailedPayment(subscription);
        return;
      }

      // Import payment functionality
      const { executePaymentWithPlatformFee } = await import("./platform-fees");

      // Convert price from raw units to decimal for payment processing
      const price = this.convertFromRawUnits(subscription.pricePerPeriod, subscription.paymentToken);

      const result = await executePaymentWithPlatformFee({
        senderId: subscription.subscriber.telegramId,
        recipientId: subscription.kolOwner.telegramId,
        tokenTicker: subscription.paymentToken,
        amount: price,
        paymentType: 'group_access',
        platformFeePercent: 0.05
      });

      if (result.success) {
        // Payment successful - update subscription
        const nextBillingDate = this.calculateNextBillingDate(subscription.billingCycle);
        
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            lastPaymentDate: new Date(),
            nextBillingDate: nextBillingDate,
            failedPayments: 0 // Reset failed payment counter
          }
        });

        logger.info("Subscription payment successful", { 
          subscriptionId: subscription.id,
          paymentId: result.paymentId 
        });

        // Notify subscriber
        if (subscription.subscriber.telegramId) {
          await this.notifySubscriptionPayment(subscription, result, true);
        }

      } else {
        logger.error("Subscription payment failed", { 
          subscriptionId: subscription.id, 
          error: result.error 
        });
        await this.handleFailedPayment(subscription);
      }

    } catch (error) {
      logger.error("Error processing subscription payment:", error);
      await this.handleFailedPayment(subscription);
    }
  }

  /**
   * Handle failed subscription payment
   */
  static async handleFailedPayment(subscription: any): Promise<void> {
    try {
      const failedPayments = subscription.failedPayments + 1;
      const maxFailedPayments = 3; // Allow 3 failed attempts

      if (failedPayments >= maxFailedPayments) {
        // Cancel subscription and remove from group
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: "cancelled",
            failedPayments: failedPayments
          }
        });

        // Remove from group
        await this.removeUserFromGroup(subscription);

        logger.info("Subscription cancelled due to failed payments", { 
          subscriptionId: subscription.id,
          failedPayments: failedPayments 
        });

        // Notify user of cancellation
        if (subscription.subscriber.telegramId) {
          await this.notifySubscriptionCancelled(subscription);
        }

      } else {
        // Update failed payment count and retry in 24 hours
        const nextRetryDate = new Date();
        nextRetryDate.setDate(nextRetryDate.getDate() + 1);

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            failedPayments: failedPayments,
            nextBillingDate: nextRetryDate
          }
        });

        logger.info("Subscription payment failed, will retry", { 
          subscriptionId: subscription.id,
          failedPayments: failedPayments,
          nextRetry: nextRetryDate
        });

        // Notify user of failed payment
        if (subscription.subscriber.telegramId) {
          await this.notifyPaymentFailure(subscription, failedPayments, maxFailedPayments);
        }
      }

    } catch (error) {
      logger.error("Error handling failed payment:", error);
    }
  }

  /**
   * Remove user from group
   */
  static async removeUserFromGroup(subscription: any): Promise<void> {
    try {
      // Remove from group access table
      await prisma.groupAccess.deleteMany({
        where: {
          memberId: subscription.subscriberId,
          groupChatId: subscription.groupChatId
        }
      });

      // TODO: Implement actual Telegram group removal
      // This would require bot admin permissions in the group
      logger.info("User removed from group access", { 
        subscriptionId: subscription.id,
        userId: subscription.subscriberId,
        groupId: subscription.groupChatId
      });

    } catch (error) {
      logger.error("Error removing user from group:", error);
    }
  }

  /**
   * Calculate next billing date based on cycle
   */
  static calculateNextBillingDate(billingCycle: string): Date {
    const now = new Date();
    const nextDate = new Date(now);

    switch (billingCycle) {
      case "weekly":
        nextDate.setDate(now.getDate() + 7);
        break;
      case "monthly":
        nextDate.setMonth(now.getMonth() + 1);
        break;
      case "quarterly":
        nextDate.setMonth(now.getMonth() + 3);
        break;
      case "yearly":
        nextDate.setFullYear(now.getFullYear() + 1);
        break;
      default:
        nextDate.setMonth(now.getMonth() + 1); // Default to monthly
    }

    return nextDate;
  }

  /**
   * Convert from raw units to decimal
   */
  static convertFromRawUnits(rawAmount: string, token: string): number {
    const decimals: Record<string, number> = {
      "USDC": 6,
      "SOL": 9,
      "BONK": 5,
      "JUP": 6
    };
    
    const decimal = decimals[token] || 6;
    return parseFloat(rawAmount) / Math.pow(10, decimal);
  }

  /**
   * Send payment notification to subscriber
   */
  static async notifySubscriptionPayment(subscription: any, result: any, success: boolean): Promise<void> {
    try {
      const botModule = await import("../bot");
      if (!botModule.bot) {
        logger.error("Bot not available for notification");
        return;
      }
      
      const price = this.convertFromRawUnits(subscription.pricePerPeriod, subscription.paymentToken);
      const message = success 
        ? `✅ **Subscription Payment Successful**\n\n` +
          `Amount: ${price} ${subscription.paymentToken}\n` +
          `Next billing: ${subscription.nextBillingDate?.toLocaleDateString()}\n` +
          `Transaction: [View on Explorer](${result.explorerLink})`
        : `❌ **Subscription Payment Failed**\n\n` +
          `Amount: ${price} ${subscription.paymentToken}\n` +
          `Reason: ${result.error}`;

      await botModule.bot.api.sendMessage(subscription.subscriber.telegramId, message, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true }
      });

    } catch (error) {
      logger.error("Error sending payment notification:", error);
    }
  }

  /**
   * Notify user of payment failure
   */
  static async notifyPaymentFailure(subscription: any, failedAttempts: number, maxAttempts: number): Promise<void> {
    try {
      const botModule = await import("../bot");
      if (!botModule.bot) {
        logger.error("Bot not available for notification");
        return;
      }
      
      const price = this.convertFromRawUnits(subscription.pricePerPeriod, subscription.paymentToken);
      const remainingAttempts = maxAttempts - failedAttempts;
      
      const message = 
        `⚠️ **Subscription Payment Failed**\n\n` +
        `Amount: ${price} ${subscription.paymentToken}\n` +
        `Failed attempts: ${failedAttempts}/${maxAttempts}\n` +
        `Remaining attempts: ${remainingAttempts}\n\n` +
        `Please ensure you have sufficient funds in your wallet. ` +
        `If payment fails ${remainingAttempts} more time(s), your subscription will be cancelled.`;

      await botModule.bot.api.sendMessage(subscription.subscriber.telegramId, message, {
        parse_mode: "Markdown"
      });

    } catch (error) {
      logger.error("Error sending payment failure notification:", error);
    }
  }

  /**
   * Notify user of subscription cancellation
   */
  static async notifySubscriptionCancelled(subscription: any): Promise<void> {
    try {
      const botModule = await import("../bot");
      if (!botModule.bot) {
        logger.error("Bot not available for notification");
        return;
      }
      
      const price = this.convertFromRawUnits(subscription.pricePerPeriod, subscription.paymentToken);
      
      const message = 
        `❌ **Subscription Cancelled**\n\n` +
        `Your subscription (${price} ${subscription.paymentToken} per ${subscription.billingCycle}) ` +
        `has been cancelled due to repeated payment failures.\n\n` +
        `You have been removed from the group. To rejoin, please contact the group owner.`;

      await botModule.bot.api.sendMessage(subscription.subscriber.telegramId, message, {
        parse_mode: "Markdown"
      });

    } catch (error) {
      logger.error("Error sending cancellation notification:", error);
    }
  }

  /**
   * Start subscription processing job (call this periodically)
   */
  static startSubscriptionProcessor(): void {
    // Process subscriptions every hour
    setInterval(async () => {
      logger.info("Starting subscription processing job");
      await this.processDueSubscriptions();
    }, 60 * 60 * 1000); // 1 hour

    logger.info("Subscription processor started");
  }
}