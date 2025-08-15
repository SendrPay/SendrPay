import "./infra/env";
import { bot as telegramBot } from "./bot";
import { client as discordClient } from "./discord/bot";
import express from "express";
import { heliusWebhook } from "./routes/helius";
import { env } from "./infra/env";

console.log("🚀 FINAL WORKING VERSION - Starting both bots...");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Telegram Mini App proxy route
app.get('/miniapp', (req, res) => {
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
          color: var(--tg-theme-text-color, #000); text-align: center;
        }
        .container { max-width: 400px; margin: 0 auto; }
        .btn { 
          display: inline-block; padding: 15px 30px; margin: 10px;
          border: none; border-radius: 12px; font-size: 16px; font-weight: 600;
          background: var(--tg-theme-button-color, #0088cc); 
          color: var(--tg-theme-button-text-color, #fff);
          cursor: pointer; text-decoration: none;
        }
        .status { 
          padding: 15px; background: #e3f2fd; border-radius: 8px; 
          margin: 15px 0; border-left: 4px solid #2196f3;
        }
        h1 { color: var(--tg-theme-text-color, #333); }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>💳 SendrPay Wallet</h1>
        <div id="status" class="status">🚀 Telegram Mini App Ready!</div>
        
        <a href="https://t.me/SendrPayBot" class="btn">🤖 Open SendrPay Bot</a>
        <button class="btn" onclick="showInfo()">📱 Show Telegram Info</button>
        
        <div id="userInfo" style="display: none; margin-top: 20px; padding: 15px; background: #fff; border-radius: 8px;">
          <h3>📱 Your Telegram Info</h3>
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
        tg.MainButton.onClick(() => {
          tg.openTelegramLink('https://t.me/SendrPayBot');
        });
        
        function showInfo() {
          try {
            const user = tg.initDataUnsafe?.user;
            
            if (user) {
              document.getElementById('userInfo').style.display = 'block';
              document.getElementById('userDetails').innerHTML = \`
                <p><strong>Name:</strong> \${user.first_name} \${user.last_name || ''}</p>
                <p><strong>Username:</strong> @\${user.username || 'Not set'}</p>
                <p><strong>ID:</strong> \${user.id}</p>
                <p><strong>Language:</strong> \${user.language_code || 'Not set'}</p>
                <p><strong>Platform:</strong> \${tg.platform}</p>
              \`;
              document.getElementById('status').innerHTML = '✅ Connected to Telegram!';
            } else {
              document.getElementById('status').innerHTML = '❌ No user data available';
            }
          } catch (error) {
            document.getElementById('status').innerHTML = '🚨 Error: ' + error.message;
          }
        }
      </script>
    </body>
    </html>
  `);
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
              document.getElementById('userDetails').innerHTML = \`
                <p><strong>Name:</strong> \${user.first_name} \${user.last_name || ''}</p>
                <p><strong>Username:</strong> @\${user.username || 'Not set'}</p>
                <p><strong>ID:</strong> \${user.id}</p>
                <p><strong>Language:</strong> \${user.language_code || 'Not set'}</p>
              \`;
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
            \`✅ Running on \${platform} (WebApp v\${version})\`;
        }, 1000);
      </script>
    </body>
    </html>
  `);
});

// Mini App main interface (for users opening from Telegram)
app.get("/", (req, res) => {
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
              document.getElementById('userDetails').innerHTML = \`
                <p><strong>Name:</strong> \${user.first_name} \${user.last_name || ''}</p>
                <p><strong>Username:</strong> @\${user.username || 'Not set'}</p>
                <p><strong>ID:</strong> \${user.id}</p>
                <p><strong>Language:</strong> \${user.language_code || 'Not set'}</p>
              \`;
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
            \`✅ Running on \${platform} (WebApp v\${version})\`;
        }, 1000);
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