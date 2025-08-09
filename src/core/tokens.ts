import { prisma } from "../infra/prisma";
import { env } from "../infra/env";
import { logger } from "../infra/logger";

export interface Token {
  mint: string;
  ticker: string;
  name?: string;
  decimals: number;
  icon?: string;
  enabled: boolean;
}

// Cache for tokens to avoid frequent DB queries
const tokenCache = new Map<string, Token>();
const mintCache = new Map<string, Token>();

export async function resolveToken(tickerOrMint: string): Promise<Token | null> {
  // Check cache first
  const cached = tokenCache.get(tickerOrMint.toUpperCase()) || mintCache.get(tickerOrMint);
  if (cached && cached.enabled) {
    return cached;
  }

  try {
    // Look up in database by ticker first, then by mint
    const token = await prisma.token.findFirst({
      where: {
        OR: [
          { ticker: tickerOrMint.toUpperCase() },
          { mint: tickerOrMint }
        ],
        enabled: true
      }
    });

    if (token) {
      const tokenObj: Token = {
        mint: token.mint,
        ticker: token.ticker,
        name: token.name || undefined,
        decimals: token.decimals,
        icon: token.icon || undefined,
        enabled: token.enabled
      };

      // Update caches
      tokenCache.set(token.ticker, tokenObj);
      mintCache.set(token.mint, tokenObj);

      return tokenObj;
    }

    // If not found and looks like a mint address, try to fetch metadata from Helius
    if (tickerOrMint.length > 30 && tickerOrMint.length < 50) {
      const metadata = await fetchTokenMetadata(tickerOrMint);
      if (metadata) {
        // Add to database for future use
        await prisma.token.create({
          data: {
            mint: tickerOrMint,
            ticker: metadata.ticker,
            name: metadata.name,
            decimals: metadata.decimals,
            enabled: false // Admin needs to enable
          }
        });

        logger.info(`New token discovered: ${metadata.ticker} (${tickerOrMint})`);
      }
    }

    return null;
  } catch (error) {
    logger.error("Error resolving token:", error);
    return null;
  }
}

export async function resolveTokenByMint(mint: string): Promise<Token | null> {
  return resolveToken(mint);
}

export async function getAllTokens(): Promise<Token[]> {
  try {
    const tokens = await prisma.token.findMany({
      where: { enabled: true },
      orderBy: { ticker: 'asc' }
    });

    return tokens.map(token => ({
      mint: token.mint,
      ticker: token.ticker,
      name: token.name || undefined,
      decimals: token.decimals,
      icon: token.icon || undefined,
      enabled: token.enabled
    }));
  } catch (error) {
    logger.error("Error fetching tokens:", error);
    return [];
  }
}

export async function addToken(mint: string, ticker: string, decimals: number, name?: string): Promise<boolean> {
  try {
    await prisma.token.upsert({
      where: { mint },
      update: {
        ticker: ticker.toUpperCase(),
        name,
        decimals,
        enabled: true
      },
      create: {
        mint,
        ticker: ticker.toUpperCase(),
        name,
        decimals,
        enabled: true
      }
    });

    // Clear caches
    tokenCache.clear();
    mintCache.clear();

    return true;
  } catch (error) {
    logger.error("Error adding token:", error);
    return false;
  }
}

async function fetchTokenMetadata(mint: string): Promise<{ ticker: string; name: string; decimals: number } | null> {
  if (!env.HELIUS_API_KEY) return null;

  try {
    const response = await fetch(env.RPC_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAsset',
        params: {
          id: mint,
          displayOptions: {
            showNativeBalance: true
          }
        }
      })
    });

    const data = await response.json();
    
    if (data.result) {
      const asset = data.result;
      return {
        ticker: asset.token_info?.symbol || mint.slice(0, 4).toUpperCase(),
        name: asset.content?.metadata?.name || asset.token_info?.symbol || 'Unknown Token',
        decimals: asset.token_info?.decimals || 6
      };
    }

    return null;
  } catch (error) {
    logger.error("Error fetching token metadata:", error);
    return null;
  }
}

// Preload common tokens into cache
export async function initTokenCache(): Promise<void> {
  try {
    const tokens = await getAllTokens();
    for (const token of tokens) {
      tokenCache.set(token.ticker, token);
      mintCache.set(token.mint, token);
    }
    logger.info(`Token cache initialized with ${tokens.length} tokens`);
  } catch (error) {
    logger.error("Error initializing token cache:", error);
  }
}
