const { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, Keypair } = require("@solana/web3.js");
const crypto = require("crypto");

// Fund admin wallet from one of the active accounts to enable service fee collection
async function fundAdminWallet() {
  try {
    const connection = new Connection(process.env.RPC_URL || "https://devnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY, 'confirmed');
    
    const adminPubkey = new PublicKey("YryMHU4nLRMjkAKtaVpo41tEScrRxwfNnXggoKwC8fS");
    const senderPubkey = new PublicKey("DuLsX4hPzBnM6RzrA6aZ8C26jmBnCmdYQ2ZVWicK8e2e"); // vi100x
    
    console.log("🔓 Decrypting sender private key...");
    
    // Decrypt private key (same logic as test)
    function decryptPrivateKey(encryptedHex, masterKey) {
      const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
      const iv = encryptedBuffer.slice(0, 12);
      const encryptedWithTag = encryptedBuffer.slice(12);
      const encrypted = encryptedWithTag.slice(0, -16);
      const authTag = encryptedWithTag.slice(-16);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(masterKey, 'hex'), iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, null, 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    }
    
    const senderEncryptedKey = "aaf51f3b2f630884920fb8df492acdbc24791f4f5419ce94401c587ccd139ccdd0b22546ac33ea28168a9e8136384e123df000306fc3e296ee39b7c40009403c2efb3096c27400569eee45d5665860c73779d8334487708b7ce47068";
    const masterKey = process.env.MASTER_KEY;
    
    if (!masterKey) {
      console.log("❌ MASTER_KEY not found");
      return;
    }
    
    const senderKeyData = decryptPrivateKey(senderEncryptedKey, masterKey);
    const senderKeypair = Keypair.fromSecretKey(new Uint8Array(senderKeyData));
    
    // Send minimum rent exemption amount to admin wallet
    const fundingAmount = 1000000; // 0.001 SOL (more than minimum 0.00089088)
    
    console.log(`💰 Sending ${fundingAmount / LAMPORTS_PER_SOL} SOL to admin wallet for rent exemption...`);
    
    const transaction = new Transaction();
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: senderPubkey,
        toPubkey: adminPubkey,
        lamports: fundingAmount
      })
    );
    
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;
    
    transaction.sign(senderKeypair);
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    console.log("✅ Funding transaction sent:", signature);
    
    // Confirm
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight: await connection.getBlockHeight()
    }, 'confirmed');
    
    if (confirmation.value.err) {
      console.log("❌ Funding failed:", JSON.stringify(confirmation.value.err));
    } else {
      console.log("✅ Admin wallet funded successfully!");
      
      // Check new balance
      const newBalance = await connection.getBalance(adminPubkey);
      console.log(`New admin wallet balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
    }
    
  } catch (error) {
    console.error("❌ Funding failed:", error.message);
  }
}

fundAdminWallet();