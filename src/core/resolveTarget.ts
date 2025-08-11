export type Platform = "telegram" | "discord" | "twitter";
export type Resolved =
  | { kind: "user"; platform: Platform; platformId: string; handle?: string }
  | { kind: "escrow"; platform: Platform; handle: string }
  | { kind: "choose"; options: Array<{ platform: Platform; platformId?: string; handle: string }> };

const PLATFORM_ALIASES: Record<string, Platform> = { 
  tg: "telegram", 
  telegram: "telegram", 
  dc: "discord", 
  discord: "discord", 
  x: "twitter", 
  twitter: "twitter" 
};

export function parseTarget(raw: string) {
  const s = raw.trim();
  
  // Handle URLs
  if (/^https?:\/\//i.test(s)) {
    const plat = /twitter\.com|x\.com/i.test(s) 
      ? "twitter" 
      : /discord\.com|discordapp\.com/i.test(s) 
      ? "discord" 
      : /t\.me|telegram\.me/i.test(s) 
      ? "telegram" 
      : null;
    
    const m = s.match(/\/@?([A-Za-z0-9_\.]+)(?:\/status|$)/);
    const handle = m?.[1];
    return { handle, explicitPlatform: plat as Platform | null };
  }
  
  // Handle platform:handle format
  const ns = s.match(/^(.*?)\s*:\s*@?([A-Za-z0-9_\.]+)$/);
  if (ns && PLATFORM_ALIASES[ns[1].toLowerCase()]) {
    return { 
      handle: ns[2], 
      explicitPlatform: PLATFORM_ALIASES[ns[1].toLowerCase()] 
    };
  }
  
  // Handle plain handle
  const h = s.replace(/^@/, "");
  return { handle: h, explicitPlatform: null as Platform | null };
}