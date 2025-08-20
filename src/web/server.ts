import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { prisma } from '../infra/prisma';
import { 
  verifyTelegramInitData, 
  createOrGetTelegramUser, 
  createSession, 
  getUserFromSession,
  createMagicCode,
  verifyMagicCode,
  cleanupExpired
} from './auth';
import { 
  getOAuthConfig,
  getDiscordAuthUrl,
  exchangeDiscordCode,
  getDiscordUser,
  createOrUpdateOAuthUser,
  getTwitterAuthUrl,
  exchangeTwitterCode
} from './oauth';
import { encryptPrivateKey } from './crypto';
import { Keypair } from '@solana/web3.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.PUBLIC_URL || 'http://localhost:5000',
  credentials: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Extend session type
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    sessionId?: string;
  }
}

// Auth middleware
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionId = req.session.sessionId;
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const user = await getUserFromSession(sessionId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Session expired' });
  }
  
  (req as any).user = user;
  next();
}

// Routes

/**
 * Telegram Mini App optimized landing page
 */
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SendrPay Web</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 400px; 
          margin: 50px auto; 
          padding: 20px;
          text-align: center;
        }
        .auth-btn {
          display: block;
          width: 100%;
          padding: 12px;
          margin: 10px 0;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          text-decoration: none;
          color: white;
        }
        .discord { background: #5865F2; }
        .telegram { background: #0088cc; }
        .twitter { background: #1DA1F2; }
        .email { background: #666; }
        .disabled { background: #ccc; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <h1>💳 SendrPay Wallet</h1>
      <p>Your Solana wallet in Telegram</p>
      
      ${getOAuthConfig('discord').enabled ? 
        `<a href="/auth/discord/start" class="auth-btn discord">Continue with Discord</a>` :
        `<button class="auth-btn disabled" disabled>Discord (Not Configured)</button>`
      }
      
      ${getOAuthConfig('twitter').enabled ? 
        `<a href="/auth/twitter/start" class="auth-btn twitter">Continue with Twitter</a>` :
        `<button class="auth-btn disabled" disabled>Twitter (Coming Soon)</button>`
      }
      
      <button class="auth-btn email" onclick="showEmailForm()">Continue with Email</button>
      
      <a href="https://t.me/SendrPayBot" class="auth-btn telegram">Open in Telegram</a>
      
      <div id="emailForm" style="display: none; margin-top: 20px;">
        <input type="email" id="email" placeholder="Enter your email" style="width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px;">
        <button onclick="sendMagicCode()" class="auth-btn email">Send Magic Code</button>
        
        <div id="codeForm" style="display: none; margin-top: 10px;">
          <input type="text" id="code" placeholder="Enter 6-digit code" style="width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px;">
          <button onclick="verifyCode()" class="auth-btn email">Verify Code</button>
        </div>
      </div>
      
      <script>
        function showEmailForm() {
          document.getElementById('emailForm').style.display = 'block';
        }
        
        async function sendMagicCode() {
          const email = document.getElementById('email').value;
          if (!email) return alert('Please enter an email');
          
          try {
            const response = await fetch('/auth/email/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
            });
            
            const data = await response.json();
            if (data.success) {
              document.getElementById('codeForm').style.display = 'block';
              alert('Magic code sent to your email!');
            } else {
              alert('Error: ' + data.error);
            }
          } catch (error) {
            alert('Error sending code');
          }
        }
        
        async function verifyCode() {
          const email = document.getElementById('email').value;
          const code = document.getElementById('code').value;
          
          if (!email || !code) return alert('Please enter email and code');
          
          try {
            const response = await fetch('/auth/email/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, code })
            });
            
            const data = await response.json();
            if (data.success) {
              window.location.href = '/dashboard';
            } else {
              alert('Error: ' + data.error);
            }
          } catch (error) {
            alert('Error verifying code');
          }
        }
        
        // Telegram WebApp integration
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.ready();
          
          // Auto-authenticate with Telegram
          const initData = window.Telegram.WebApp.initData;
          if (initData) {
            fetch('/auth/tg', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ initData })
            }).then(response => response.json())
              .then(data => {
                if (data.success) {
                  window.location.href = '/dashboard';
                }
              });
          }
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * Telegram authentication
 */
app.post('/auth/tg', async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'Missing initData' });
    }
    
    const botToken = process.env.TG_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: 'Telegram bot not configured' });
    }
    
    const telegramUser = verifyTelegramInitData(initData, botToken);
    if (!telegramUser) {
      return res.status(400).json({ error: 'Invalid Telegram data' });
    }
    
    const user = await createOrGetTelegramUser(telegramUser);
    const sessionId = await createSession(user.id);
    
    req.session.userId = user.id;
    req.session.sessionId = sessionId;
    
    res.json({ success: true, user: { id: user.id, handle: user.handle } });
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * Discord OAuth start
 */
app.get('/auth/discord/start', (req, res) => {
  try {
    const authUrl = getDiscordAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Discord OAuth callback
 */
app.get('/auth/discord/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }
    
    const tokens = await exchangeDiscordCode(code as string);
    const discordUser = await getDiscordUser(tokens.access_token);
    
    const user = await createOrUpdateOAuthUser('discord', discordUser.id, discordUser, tokens);
    const sessionId = await createSession(user.id);
    
    req.session.userId = user.id;
    req.session.sessionId = sessionId;
    
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Discord OAuth error:', error);
    res.status(500).json({ error: 'Discord authentication failed' });
  }
});

/**
 * Twitter OAuth start (placeholder)
 */
app.get('/auth/twitter/start', (req, res) => {
  try {
    const authUrl = getTwitterAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Twitter OAuth callback (placeholder)
 */
app.get('/auth/twitter/callback', async (req, res) => {
  try {
    res.status(501).json({ error: 'Twitter OAuth not yet implemented' });
  } catch (error) {
    res.status(500).json({ error: 'Twitter authentication failed' });
  }
});

/**
 * Email magic code start
 */
app.post('/auth/email/start', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    
    const code = await createMagicCode(email);
    
    // TODO: Send email with code
    console.log(`Magic code for ${email}: ${code}`);
    
    res.json({ success: true, message: 'Magic code sent (check console for now)' });
  } catch (error) {
    console.error('Magic code error:', error);
    res.status(500).json({ error: 'Failed to send magic code' });
  }
});

/**
 * Email magic code verify
 */
app.post('/auth/email/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ error: 'Missing email or code' });
    }
    
    const user = await verifyMagicCode(email, code);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    
    const sessionId = await createSession(user.id);
    
    req.session.userId = user.id;
    req.session.sessionId = sessionId;
    
    res.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Code verification error:', error);
    res.status(500).json({ error: 'Code verification failed' });
  }
});

/**
 * Dashboard
 */
app.get('/dashboard', requireAuth, async (req, res) => {
  const user = (req as any).user;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SendrPay Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 600px; 
          margin: 20px auto; 
          padding: 20px;
        }
        .card {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
          margin: 15px 0;
          border: 1px solid #e9ecef;
        }
        .btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin: 5px;
        }
        .btn:hover { background: #0056b3; }
        .wallet-address {
          font-family: monospace;
          background: #e9ecef;
          padding: 10px;
          border-radius: 4px;
          word-break: break-all;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <h1>SendrPay Dashboard</h1>
      
      <div class="card">
        <h3>Account Info</h3>
        <p><strong>ID:</strong> ${user.id}</p>
        <p><strong>Handle:</strong> ${user.handle || 'Not set'}</p>
        <p><strong>Email:</strong> ${user.email || 'Not set'}</p>
        
        <h4>Connected Platforms</h4>
        ${user.socialLinks.map(link => `
          <p>📱 ${link.platform}: ${link.handle || link.platformId}</p>
        `).join('')}
        
        ${user.oauthAccounts.map(account => `
          <p>🔗 OAuth ${account.provider}: Connected</p>
        `).join('')}
      </div>
      
      <div class="card">
        <h3>Wallet</h3>
        ${user.wallets.length > 0 ? `
          <div class="wallet-address">${user.wallets[0].address}</div>
          <p>💰 Balances: <em>Loading...</em></p>
        ` : `
          <p>No wallet found. Create one below:</p>
        `}
        
        <button class="btn" onclick="generateWallet()">Generate New Wallet</button>
        <button class="btn" onclick="showImportForm()">Import Private Key</button>
        
        <div id="importForm" style="display: none; margin-top: 15px;">
          <textarea id="privateKey" placeholder="Enter your private key" style="width: 100%; height: 80px; margin: 10px 0;"></textarea>
          <button class="btn" onclick="importWallet()">Import Wallet</button>
        </div>
      </div>
      
      <div class="card">
        <h3>Quick Actions</h3>
        <button class="btn" onclick="copyTipLink()">Copy Tip Link</button>
        <button class="btn" onclick="window.location.href='/logout'">Logout</button>
      </div>
      
      <script>
        function showImportForm() {
          document.getElementById('importForm').style.display = 'block';
        }
        
        async function generateWallet() {
          try {
            const response = await fetch('/wallet/generate', { method: 'POST' });
            const data = await response.json();
            
            if (data.success) {
              alert('Wallet generated! Refreshing page...');
              window.location.reload();
            } else {
              alert('Error: ' + data.error);
            }
          } catch (error) {
            alert('Error generating wallet');
          }
        }
        
        async function importWallet() {
          const privateKey = document.getElementById('privateKey').value;
          if (!privateKey) return alert('Please enter a private key');
          
          try {
            const response = await fetch('/wallet/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ privateKey })
            });
            
            const data = await response.json();
            if (data.success) {
              alert('Wallet imported! Refreshing page...');
              window.location.reload();
            } else {
              alert('Error: ' + data.error);
            }
          } catch (error) {
            alert('Error importing wallet');
          }
        }
        
        function copyTipLink() {
          const tipLink = \`\${window.location.origin}/tip/@${user.handle || 'u/' + user.id}\`;
          navigator.clipboard.writeText(tipLink).then(() => {
            alert('Tip link copied to clipboard!');
          });
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * Generate wallet
 */
app.post('/wallet/generate', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    
    // Generate new Solana keypair
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toString();
    const privateKeyBytes = keypair.secretKey;
    
    // Encrypt private key
    const encryptedPrivKey = encryptPrivateKey(Buffer.from(privateKeyBytes).toString('base64'));
    
    // Save wallet to database
    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        label: 'custodial',
        address,
        encPrivKey: Buffer.from(encryptedPrivKey, 'base64'),
        isActive: true
      }
    });
    
    // Update user's active wallet
    await prisma.user.update({
      where: { id: user.id },
      data: { activeWalletId: wallet.id }
    });
    
    res.json({ success: true, address });
  } catch (error) {
    console.error('Wallet generation error:', error);
    res.status(500).json({ error: 'Failed to generate wallet' });
  }
});

/**
 * Import wallet
 */
app.post('/wallet/import', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { privateKey } = req.body;
    
    if (!privateKey) {
      return res.status(400).json({ error: 'Missing private key' });
    }
    
    // TODO: Validate and import private key
    // For now, just generate a placeholder
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toString();
    
    const encryptedPrivKey = encryptPrivateKey(privateKey);
    
    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        label: 'imported',
        address,
        encPrivKey: Buffer.from(encryptedPrivKey, 'base64'),
        isActive: true
      }
    });
    
    await prisma.user.update({
      where: { id: user.id },
      data: { activeWalletId: wallet.id }
    });
    
    res.json({ success: true, address });
  } catch (error) {
    console.error('Wallet import error:', error);
    res.status(500).json({ error: 'Failed to import wallet' });
  }
});

/**
 * Logout
 */
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});
// Cleanup task (run every hour)
setInterval(cleanupExpired, 60 * 60 * 1000);

export { app };
