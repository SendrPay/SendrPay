import type { BotContext } from "../bot";
import { resolveToken } from "./tokens";

export interface PayCommand {
  payeeId?: string;
  payeeHandle?: string;
  amount: number;
  tokenTicker: string;
  note?: string;
}

export interface TipCommand {
  amount: number;
  tokenTicker?: string;
}



export interface WithdrawCommand {
  amount: number;
  tokenTicker: string;
  toAddress: string;
}



export async function parsePayCommand(ctx: BotContext): Promise<PayCommand | null> {
  const text = ctx.message?.text || "";
  const args = text.split(' ').slice(1); // Remove /pay

  if (args.length < 2) return null;

  let payeeId: string | undefined;
  let payeeHandle: string | undefined;

  // Check for reply-to-message first
  if (ctx.message?.reply_to_message?.from) {
    payeeId = ctx.message.reply_to_message.from.id.toString();
    payeeHandle = ctx.message.reply_to_message.from.username?.toLowerCase(); // Normalize to lowercase
  } else {
    // Look for @mention in args
    const mentionArg = args.find(arg => arg.startsWith('@'));
    if (mentionArg) {
      payeeHandle = mentionArg.slice(1).toLowerCase(); // Normalize to lowercase like Telegram
      // Extract user ID from entities if available
      const entities = ctx.message?.entities || [];
      const mentionEntity = entities.find(e => e.type === 'mention');
      if (mentionEntity && ctx.message?.text) {
        const mentionText = ctx.message.text.slice(mentionEntity.offset, mentionEntity.offset + mentionEntity.length);
        if (mentionText === mentionArg) {
          // Look up user ID by username (would need database lookup)
        }
      }
      // Remove mention from args for further parsing
      args.splice(args.indexOf(mentionArg), 1);
    }
  }

  if (!payeeId && !payeeHandle) return null;

  // Parse amount
  const amountStr = args[0];
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  // Parse token (optional, defaults to USDC)
  let tokenTicker = "USDC";
  if (args.length > 1 && /^[A-Z]{2,10}$/i.test(args[1])) {
    tokenTicker = args[1].toUpperCase();
    args.splice(1, 1); // Remove token from args
  }

  // Remaining args are note
  const note = args.slice(1).join(' ').trim() || undefined;

  return {
    payeeId,
    payeeHandle,
    amount,
    tokenTicker,
    note
  };
}

export function parseTipCommand(ctx: BotContext): TipCommand | null {
  const text = ctx.message?.text || "";
  const args = text.split(' ').slice(1); // Remove /tip

  if (args.length < 1) return null;

  // Parse amount
  const amountStr = args[0];
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  // Parse token (optional)
  let tokenTicker: string | undefined;
  if (args.length > 1 && /^[A-Z]{2,10}$/i.test(args[1])) {
    tokenTicker = args[1].toUpperCase();
  }

  return {
    amount,
    tokenTicker
  };
}



export function parseWithdrawCommand(ctx: BotContext): WithdrawCommand | null {
  const text = ctx.message?.text || "";
  const args = text.split(' ').slice(1); // Remove /withdraw

  if (args.length < 3) return null;

  // Parse amount
  const amountStr = args[0];
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  // Parse token
  const tokenTicker = args[1].toUpperCase();
  if (!/^[A-Z]{2,10}$/.test(tokenTicker)) return null;

  // Parse destination address
  const toAddress = args[2];
  if (toAddress.length < 32) return null;

  return {
    amount,
    tokenTicker,
    toAddress
  };
}



export function parseAmount(amountStr: string, decimals: number): bigint | null {
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  try {
    return BigInt(Math.floor(amount * (10 ** decimals)));
  } catch {
    return null;
  }
}

export function formatAmount(amountRaw: bigint, decimals: number, maxDecimals = 6): string {
  const amount = Number(amountRaw) / (10 ** decimals);
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(maxDecimals, decimals)
  });
}
