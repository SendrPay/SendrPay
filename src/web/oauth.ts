import { prisma } from '../infra/prisma';
import { generateSessionId } from './crypto';

// OAuth configurations
const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';

const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';

interface OAuthConfig {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

/**
 * Get OAuth configuration
 */
export function getOAuthConfig(provider: 'discord' | 'twitter'): OAuthConfig {
  if (provider === 'discord') {
    return {
      enabled: process.env.OAUTH_DISCORD_ENABLED === '1',
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      redirectUri: process.env.DISCORD_REDIRECT_URI
    };
  }
  
  if (provider === 'twitter') {
    return {
      enabled: process.env.OAUTH_TWITTER_ENABLED === '1',
      clientId: process.env.TW_CLIENT_ID,
      clientSecret: process.env.TW_CLIENT_SECRET,
      redirectUri: process.env.TW_REDIRECT_URI
    };
  }
  
  throw new Error(`Unknown OAuth provider: ${provider}`);
}

/**
 * Generate Discord OAuth URL
 */
export function getDiscordAuthUrl(state?: string): string {
  const config = getOAuthConfig('discord');
  
  if (!config.enabled || !config.clientId || !config.redirectUri) {
    throw new Error('Discord OAuth not configured');
  }
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'identify'
  });
  
  if (state) {
    params.set('state', state);
  }
  
  return `${DISCORD_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange Discord OAuth code for tokens
 */
export async function exchangeDiscordCode(code: string): Promise<any> {
  const config = getOAuthConfig('discord');
  
  if (!config.enabled || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('Discord OAuth not configured');
  }
  
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri
    })
  });
  
  if (!response.ok) {
    throw new Error(`Discord token exchange failed: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get Discord user from access token
 */
export async function getDiscordUser(accessToken: string): Promise<any> {
  const response = await fetch(DISCORD_ME_URL, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Discord user fetch failed: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Create or update OAuth account and user
 */
export async function createOrUpdateOAuthUser(
  provider: 'discord' | 'twitter',
  providerId: string,
  providerUser: any,
  tokens: any
) {
  // Check if OAuth account exists
  let oauthAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerId: {
        provider,
        providerId
      }
    },
    include: {
      user: {
        include: {
          wallets: { where: { isActive: true } },
          socialLinks: true,
          oauthAccounts: true
        }
      }
    }
  });
  
  if (oauthAccount) {
    // Update existing OAuth account with new tokens
    await prisma.oAuthAccount.update({
      where: { id: oauthAccount.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
      }
    });
    
    return oauthAccount.user;
  }
  
  // Create new user and OAuth account
  const userData: any = {};
  let socialLinkData: any = { platform: provider, platformId: providerId };
  
  if (provider === 'discord') {
    userData.discordId = providerId;
    userData.handle = providerUser.username;
    socialLinkData.handle = providerUser.username;
  } else if (provider === 'twitter') {
    userData.handle = providerUser.username;
    socialLinkData.handle = providerUser.username;
  }
  
  const user = await prisma.user.create({
    data: {
      ...userData,
      socialLinks: {
        create: socialLinkData
      },
      oauthAccounts: {
        create: {
          provider,
          providerId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
        }
      }
    },
    include: {
      wallets: { where: { isActive: true } },
      socialLinks: true,
      oauthAccounts: true
    }
  });
  
  return user;
}

/**
 * Generate Twitter OAuth URL (placeholder)
 */
export function getTwitterAuthUrl(state?: string): string {
  const config = getOAuthConfig('twitter');
  
  if (!config.enabled || !config.clientId || !config.redirectUri) {
    throw new Error('Twitter OAuth not configured');
  }
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'tweet.read users.read offline.access',
    code_challenge: 'challenge', // TODO: Implement PKCE properly
    code_challenge_method: 'plain'
  });
  
  if (state) {
    params.set('state', state);
  }
  
  return `${TWITTER_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange Twitter OAuth code (placeholder)
 */
export async function exchangeTwitterCode(code: string): Promise<any> {
  // TODO: Implement Twitter OAuth code exchange
  throw new Error('Twitter OAuth not yet implemented');
}