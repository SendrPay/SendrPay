const sessions = new Map<number, UiSessionState>();

export interface UiSessionState {
  screen?: string;
  purpose?: string;
  payload?: any;
  lastUi?: {
    chatId: number;
    msgId: number;
    purpose: string;
  };
}

export function get(chatId: number): UiSessionState {
  return sessions.get(chatId) || {};
}

export function set(chatId: number, partial: Partial<UiSessionState>): UiSessionState {
  const current = sessions.get(chatId) || {};
  const updated = { ...current, ...partial } as UiSessionState;
  sessions.set(chatId, updated);
  return updated;
}

export function clear(chatId: number) {
  sessions.delete(chatId);
}

export async function showOrEdit(
  ctx: any,
  html: string,
  kb: any,
  purpose: string,
  forceNew = false
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = get(chatId);
  const lastUi = state.lastUi;

  if (!forceNew && lastUi && lastUi.purpose === purpose) {
    try {
      await ctx.api.editMessageText(lastUi.chatId, lastUi.msgId, html, {
        parse_mode: "HTML",
        reply_markup: kb
      });
      return;
    } catch (e) {
      // fall through to sending new message
    }
  }

  if (lastUi) {
    try {
      await ctx.api.deleteMessage(lastUi.chatId, lastUi.msgId);
    } catch (e) {
      // ignore errors deleting old message
    }
  }

  const msg = await ctx.reply(html, {
    parse_mode: "HTML",
    reply_markup: kb
  });

  set(chatId, {
    lastUi: {
      chatId: msg.chat.id,
      msgId: msg.message_id,
      purpose
    }
  });
}


export const uiSession = { get, set, clear, showOrEdit };
