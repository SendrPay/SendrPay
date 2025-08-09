import { Router } from "express";
import { prisma } from "../infra/prisma";
import { logger } from "../infra/logger";
import { v4 as uuidv4 } from "uuid";

export const webRoutes = Router();

// Root page - Bot information
webRoutes.get("/", async (req, res) => {
  const stats = await prisma.user.count();
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Solana Pay Bot</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 40px 20px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          min-height: 100vh;
        }
        .container { 
          background: rgba(255,255,255,0.1); 
          border-radius: 16px; 
          padding: 40px; 
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        h1 { font-size: 2.5em; margin-bottom: 10px; text-align: center; }
        .subtitle { text-align: center; opacity: 0.9; margin-bottom: 40px; font-size: 1.2em; }
        .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 40px 0; }
        .feature { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px; }
        .feature h3 { margin: 0 0 10px 0; font-size: 1.3em; }
        .stats { text-align: center; margin: 40px 0; }
        .stats .number { font-size: 2em; font-weight: bold; color: #FFD700; }
        .start-btn { 
          display: inline-block; 
          background: #00D4AA; 
          color: white; 
          padding: 15px 30px; 
          border-radius: 25px; 
          text-decoration: none; 
          font-weight: bold;
          text-align: center;
          margin: 20px auto;
          display: block;
          width: fit-content;
        }
        .start-btn:hover { background: #00B894; }
        .commands { background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; margin: 20px 0; }
        .command { margin: 8px 0; font-family: monospace; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Solana Pay Bot</h1>
        <p class="subtitle">Lightning-fast payments and giveaways on Solana blockchain</p>
        
        <div class="stats">
          <div class="number">${stats}</div>
          <div>Total Users</div>
        </div>

        <div class="features">
          <div class="feature">
            <h3>💸 Instant Payments</h3>
            <p>Send SOL, USDC, BONK, JUP to any Telegram user with secure custodial wallets</p>
          </div>
          <div class="feature">
            <h3>🎁 Group Giveaways</h3>
            <p>Create token giveaways in groups with automatic prize distribution</p>
          </div>
          <div class="feature">
            <h3>🔒 Secure & Encrypted</h3>
            <p>AES-GCM encrypted private key storage with enterprise-grade security</p>
          </div>
          <div class="feature">
            <h3>⚡ Real Blockchain</h3>
            <p>All transactions happen on Solana devnet through Helius infrastructure</p>
          </div>
        </div>

        <a href="https://t.me/your_bot_username" class="start-btn">Start Using Bot</a>

        <div class="commands">
          <h3>Quick Commands:</h3>
          <div class="command">/start - Generate or import wallet</div>
          <div class="command">/pay @user 10 SOL - Send payment</div>
          <div class="command">/tip 5 USDC - Tip user (reply to message)</div>
          <div class="command">/giveaway start 100 BONK "Prize description"</div>
          <div class="command">/balance - Check wallet balances</div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Link wallet page
webRoutes.get("/link/:linkId", async (req, res) => {
  const { linkId } = req.params;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Link Phantom Wallet</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
        .btn { background: #512da8; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; }
        .btn:hover { background: #673ab7; }
        .error { color: red; margin-top: 10px; }
        .success { color: green; margin-top: 10px; }
      </style>
    </head>
    <body>
      <h2>Link Phantom Wallet</h2>
      <p>Connect your Phantom wallet to use non-custodial features.</p>
      <button class="btn" onclick="connectPhantom()">Connect Phantom</button>
      <div id="status"></div>
      
      <script>
        async function connectPhantom() {
          const status = document.getElementById('status');
          try {
            if (!window.solana || !window.solana.isPhantom) {
              throw new Error('Phantom wallet not found');
            }
            
            const resp = await window.solana.connect();
            const publicKey = resp.publicKey.toString();
            
            // Sign a nonce to prove ownership
            const nonce = "${linkId}";
            const message = new TextEncoder().encode(\`Link wallet to Telegram: \${nonce}\`);
            const signature = await window.solana.signMessage(message);
            
            // Send to server
            const result = await fetch('/link/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                linkId: nonce,
                publicKey,
                signature: Array.from(signature.signature)
              })
            });
            
            if (result.ok) {
              status.innerHTML = '<div class="success">Wallet linked successfully! You can close this page.</div>';
            } else {
              throw new Error('Failed to link wallet');
            }
          } catch (error) {
            status.innerHTML = \`<div class="error">Error: \${error.message}</div>\`;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Verify wallet link
webRoutes.post("/link/verify", async (req, res) => {
  try {
    const { linkId, publicKey, signature } = req.body;
    
    // TODO: Verify signature against nonce
    // For now, just save the wallet
    logger.info(`Wallet link attempt: ${publicKey} for ${linkId}`);
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Link verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Claim escrow page
webRoutes.get("/claim/:escrowId", async (req, res) => {
  const { escrowId } = req.params;
  
  try {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId }
    });
    
    if (!escrow) {
      return res.status(404).send("Escrow not found");
    }
    
    if (escrow.status !== "open") {
      return res.send("Escrow already processed");
    }
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Claim Payment</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
          .amount { font-size: 24px; font-weight: bold; color: #2e7d32; }
          .btn { background: #2e7d32; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 10px 0; }
          .btn:hover { background: #388e3c; }
        </style>
      </head>
      <body>
        <h2>💰 Payment Waiting</h2>
        <div class="amount">${escrow.amountRaw} ${escrow.mint}</div>
        <p>From: ${escrow.payerWallet.slice(0, 8)}...</p>
        <p>To claim this payment, start the bot and link your wallet:</p>
        <a href="https://t.me/YourBot" class="btn">Open Telegram Bot</a>
      </body>
      </html>
    `);
  } catch (error) {
    logger.error("Claim page error:", error);
    res.status(500).send("Internal server error");
  }
});

// QR code generation
webRoutes.get("/qr/:address", (req, res) => {
  const { address } = req.params;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Wallet QR Code</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
        #qrcode { margin: 20px 0; }
        .address { font-family: monospace; word-break: break-all; margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 8px; }
      </style>
    </head>
    <body>
      <h2>Wallet Address</h2>
      <div id="qrcode"></div>
      <div class="address">${address}</div>
      <script>
        QRCode.toCanvas(document.createElement('canvas'), '${address}', function (error, canvas) {
          if (error) console.error(error);
          document.getElementById('qrcode').appendChild(canvas);
        });
      </script>
    </body>
    </html>
  `);
});
