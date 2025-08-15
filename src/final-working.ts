import "./infra/env";
import { bot as telegramBot } from "./bot";
import { client as discordClient } from "./discord/bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { env } from "./infra/env";
import crypto from "crypto";
import { getOrCreateUserByTelegramId } from "./core/shared";

console.log("🚀 FINAL WORKING VERSION - Starting both bots...");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Telegram initData verification
function verifyTelegramWebAppData(initData: string, botToken: string): any {
  try {
    if (!botToken) {
      console.error('Bot token is missing for Telegram auth verification');
      return null;
    }
    
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    if (!hash) {
      console.error('No hash found in initData');
      return null;
    }
    
    // Sort parameters and create data check string
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Create secret key using bot token
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    
    // Calculate expected hash
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    if (hash !== expectedHash) {
      console.log('Hash mismatch in Telegram auth verification');
      return null;
    }
    
    // Parse user data
    const userParam = urlParams.get('user');
    if (userParam) {
      return JSON.parse(userParam);
    }
    
    return null;
  } catch (error) {
    console.error('Telegram auth verification error:', error);
    return null;
  }
}

// Telegram Mini App authentication endpoint
app.post('/auth/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ success: false, error: 'Missing initData' });
    }
    
    if (!env.BOT_TOKEN) {
      console.error('BOT_TOKEN is not configured');
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }
    
    // Verify initData using bot token
    const user = verifyTelegramWebAppData(initData, env.BOT_TOKEN);
    
    if (!user) {
      console.log('Telegram auth failed - invalid data or verification failed');
      return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
    }
    
    console.log(`Telegram auth successful for user: ${user.id} (${user.first_name})`);
    
    // Get or create user in database
    const dbUser = await getOrCreateUserByTelegramId(user.id.toString());
    
    if (dbUser && dbUser.wallets && dbUser.wallets.length > 0) {
      // User exists with wallet
      res.json({
        success: true,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          username: user.username
        },
        wallet: dbUser.wallets[0].address,
        hasWallet: true
      });
    } else {
      // User exists but no wallet, or new user
      res.json({
        success: true,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          username: user.username
        },
        hasWallet: false,
        needsSetup: true
      });
    }
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Telegram Mini App - redirect to full web app on port 5001
app.get('/miniapp', (req, res) => {
  // Get the current domain but use port 5001 for the full web app
  const host = req.get('host');
  const domain = host ? host.split(':')[0] : 'localhost';
  const webAppUrl = host?.includes('replit.app') ? 
    `https://${domain}:5001` : 
    `http://${domain}:5001`;
  
  res.redirect(webAppUrl);
});

// Telegram Mini App route
app.get('/webapp', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SendrPay Wallet</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://telegram.org/js/telegram-web-app.js"></script>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0; padding: 20px; background: var(--tg-theme-bg-color, #f8f9fa);
          color: var(--tg-theme-text-color, #000);
        }
        .container { max-width: 400px; margin: 0 auto; }
        .btn { 
          display: block; width: 100%; padding: 15px; margin: 10px 0;
          border: none; border-radius: 12px; font-size: 16px; font-weight: 600;
          background: var(--tg-theme-button-color, #0088cc); 
          color: var(--tg-theme-button-text-color, #fff);
          cursor: pointer; transition: all 0.2s;
        }
        .btn:hover { opacity: 0.9; }
        .status { 
          padding: 15px; background: #e3f2fd; border-radius: 8px; 
          margin: 15px 0; border-left: 4px solid #2196f3;
        }
        .user-card {
          background: #fff; padding: 20px; border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin: 15px 0;
        }
        h2 { color: var(--tg-theme-text-color, #333); text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>💳 SendrPay Wallet</h2>
        <div id="status" class="status">🚀 Initializing Telegram Mini App...</div>
        
        <button class="btn" onclick="showUserInfo()">👤 Show User Info</button>
        <button class="btn" onclick="connectWallet()">🔗 Connect to Bot</button>
        <button class="btn" onclick="openBot()">🤖 Open SendrPay Bot</button>
        
        <div id="userInfo" class="user-card" style="display: none;">
          <h3>📱 Telegram User Info</h3>
          <div id="userDetails"></div>
        </div>
      </div>
      
      <script>
        let tg = window.Telegram.WebApp;
        
        // Initialize Telegram WebApp
        tg.ready();
        tg.expand();
        
        // Set main button
        tg.MainButton.text = 'Open SendrPay Bot';
        tg.MainButton.show();
        tg.MainButton.onClick(() => openBot());
        
        document.getElementById('status').innerHTML = '✅ Telegram Mini App Ready!';
        
        function showUserInfo() {
          try {
            const initData = tg.initData;
            const user = tg.initDataUnsafe?.user;
            
            if (user) {
              document.getElementById('userInfo').style.display = 'block';
              document.getElementById('userDetails').innerHTML = `
                <p><strong>Name:</strong> ${user.first_name} ${user.last_name || ''}</p>
                <p><strong>Username:</strong> @${user.username || 'Not set'}</p>
                <p><strong>ID:</strong> ${user.id}</p>
                <p><strong>Language:</strong> ${user.language_code || 'Not set'}</p>
              `;
              document.getElementById('status').innerHTML = '📱 User info displayed!';
            } else {
              document.getElementById('status').innerHTML = '❌ No user data available';
            }
          } catch (error) {
            document.getElementById('status').innerHTML = '🚨 Error: ' + error.message;
          }
        }
        
        function connectWallet() {
          document.getElementById('status').innerHTML = '🔄 Connecting to SendrPay bot...';
          // This will redirect to the bot
          setTimeout(() => {
            tg.openTelegramLink('https://t.me/SendrPayBot?start=webapp');
          }, 1000);
        }
        
        function openBot() {
          tg.openTelegramLink('https://t.me/SendrPayBot');
        }
        
        // Show some basic Telegram data on load
        setTimeout(() => {
          const platform = tg.platform;
          const version = tg.version;
          document.getElementById('status').innerHTML = 
            `✅ Running on ${platform} (WebApp v${version})`;
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

// Root route - redirect to full web app on port 5001
app.get("/", (req, res) => {
  // Get the current domain but use port 5001 for the full web app
  const host = req.get('host');
  const domain = host ? host.split(':')[0] : 'localhost';
  const webAppUrl = host?.includes('replit.app') ? 
    `https://${domain}:5001` : 
    `http://${domain}:5001`;
  
  res.redirect(webAppUrl);
});

// Admin status dashboard
app.get("/admin", (req, res) => {
  res.send(`
    <h1>SendrPay - Both Bots Online</h1>
    <p>Discord: ${discordClient?.isReady() ? '✅ ONLINE' : '❌ OFFLINE'}</p>
    <p>Telegram: ${telegramBot ? '✅ ONLINE' : '❌ OFFLINE'}</p>
    <p>Updated: ${new Date().toISOString()}</p>
    <p><a href="/webapp">🌐 Web App</a></p>
  `);
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    discord: discordClient?.isReady() || false,
    telegram: !!telegramBot,
    timestamp: new Date().toISOString()
  });
});
        
        // Initialize Telegram WebApp
        tg.ready();
        tg.expand();
        
        // Set main button
        tg.MainButton.text = 'Open SendrPay Bot';
        tg.MainButton.show();
        tg.MainButton.onClick(() => openBot());
        
        // Auto-authenticate user on load
        authenticateUser();
        
        async function authenticateUser() {
          try {
            const initData = tg.initData;
            
            if (!initData) {
              document.getElementById('status').innerHTML = '❌ No Telegram authentication data';
              return;
            }
            
            document.getElementById('status').innerHTML = '🔄 Authenticating...';
            
            const response = await fetch('/auth/telegram', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ initData })
            });
            
            const result = await response.json();
            
            if (result.success) {
              const user = result.user;
              document.getElementById('userDetails').innerHTML = `
                <p><strong>Welcome:</strong> ${user.firstName} ${user.lastName || ''}</p>
                <p><strong>Username:</strong> @${user.username || 'Not set'}</p>
                ${result.hasWallet ? 
                  `<p><strong>Wallet:</strong> ${result.wallet.substring(0, 8)}...${result.wallet.substring(-8)}</p>` :
                  '<p><strong>Status:</strong> No wallet yet - use /start in bot</p>'
                }
              `;
              document.getElementById('userInfo').style.display = 'block';
              
              if (result.hasWallet) {
                document.getElementById('status').innerHTML = '✅ Authenticated! Wallet connected';
              } else {
                document.getElementById('status').innerHTML = '✅ Authenticated! Set up wallet with /start';
              }
            } else {
              document.getElementById('status').innerHTML = '❌ Authentication failed: ' + result.error;
            }
          } catch (error) {
            document.getElementById('status').innerHTML = '🚨 Error: ' + error.message;
          }
        }
        
        function showUserInfo() {
          // Toggle user info display
          const userInfo = document.getElementById('userInfo');
          if (userInfo.style.display === 'none') {
            userInfo.style.display = 'block';
          } else {
            userInfo.style.display = 'none';
          }
        }
        
        function connectWallet() {
          document.getElementById('status').innerHTML = '🔄 Connecting to SendrPay bot...';
          // This will redirect to the bot
          setTimeout(() => {
            tg.openTelegramLink('https://t.me/SendrPayBot?start=webapp');
          }, 1000);
        }
        
        function openBot() {
          tg.openTelegramLink('https://t.me/SendrPayBot');
        }
      </script>
    </body>
    </html>
  `);
});

// Admin status dashboard
app.get("/admin", (req, res) => {
  res.send(`
    <h1>SendrPay - Both Bots Online</h1>
    <p>Discord: ${discordClient?.isReady() ? '✅ ONLINE' : '❌ OFFLINE'}</p>
    <p>Telegram: ${telegramBot ? '✅ ONLINE' : '❌ OFFLINE'}</p>
    <p>Updated: ${new Date().toISOString()}</p>
    <p><a href="/webapp">🌐 Web App</a></p>
  `);
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok",
    discord: discordClient?.isReady() || false,
    telegram: !!telegramBot,
    timestamp: new Date().toISOString()
  });
});

app.post("/webhooks/helius", heliusWebhook);

// Telegram webhook - simple and reliable
app.post("/tg", async (req, res) => {
  if (telegramBot && req.body) {
    try {
      await telegramBot.handleUpdate(req.body);
      res.status(200).send("OK");
    } catch (error) {
      console.error("Telegram webhook error:", error);
      res.status(500).send("Error");
    }
  } else {
    res.status(404).send("No bot");
  }
});

async function startBothBots() {
  console.log("Starting HTTP server...");
  app.listen(5000, "0.0.0.0", () => {
    console.log("✅ Server running on port 5000");
  });

  // Start Discord first
  if (discordClient && env.DISCORD_TOKEN) {
    console.log("Starting Discord bot...");
    try {
      await discordClient.login(env.DISCORD_TOKEN);
      console.log("✅ Discord bot online");
    } catch (error) {
      console.error("Discord error:", error);
    }
  }

  // Initialize and start Telegram
  if (telegramBot) {
    console.log("Initializing Telegram bot...");
    try {
      // Critical: Initialize first
      await telegramBot.init();
      console.log("✅ Telegram bot initialized");

      // Clear webhook and set new one
      await telegramBot.api.deleteWebhook({ drop_pending_updates: true });
      
      const publicUrl = process.env.PUBLIC_URL || process.env.REPL_URL;
      if (publicUrl) {
        const webhookUrl = `${publicUrl.replace(/\/$/, '')}/tg`;
        await telegramBot.api.setWebhook(webhookUrl);
        console.log("✅ Telegram webhook set:", webhookUrl);
      }
      
      console.log("✅ Telegram bot ready");
    } catch (error) {
      console.error("Telegram error:", error);
    }
  }

  console.log("🎉 BOTH BOTS ARE NOW RUNNING!");
}

startBothBots().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});