const {
  Connection,
  Transaction,
  SystemProgram,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL
} = require("@solana/web3.js");
const crypto = require("crypto");

// Test accounts from database
const senderAddress = "DuLsX4hPzBnM6RzrA6aZ8C26jmBnCmdYQ2ZVWicK8e2e"; // vi100x
const recipientAddress = "BrWdDCTUhvM33Y4syCYf4ZBhE4xNAeGVoWe8bCPBetLA"; // useDefiLink

// Function to decrypt wallet private key (same as in wallets.ts)
function decryptPrivateKey(encryptedHex, masterKey) {
  try {
    // Convert hex string back to buffer
    const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
    
    // Extract IV (first 12 bytes) and encrypted data + auth tag (rest)
    const iv = encryptedBuffer.slice(0, 12);
    const encryptedWithTag = encryptedBuffer.slice(12);
    
    // Split encrypted data and auth tag (last 16 bytes is auth tag)
    const encrypted = encryptedWithTag.slice(0, -16);
    const authTag = encryptedWithTag.slice(-16);
    
    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(masterKey, 'hex'), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw error;
  }
}

// Test script to directly execute SOL transfer between two accounts
async function testTransfer() {
  try {
    console.log("🔗 Connecting to Solana devnet...");
    const connection = new Connection(process.env.RPC_URL || "https://devnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY, 'confirmed');
    
    const senderPubkey = new PublicKey(senderAddress);
    const recipientPubkey = new PublicKey(recipientAddress);
    
    console.log("✅ Connected to Solana");
    console.log("📊 Checking account balances...");
    
    const senderBalance = await connection.getBalance(senderPubkey);
    const recipientBalance = await connection.getBalance(recipientPubkey);
    
    console.log(`Sender (vi100x) balance: ${senderBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`Recipient (useDefiLink) balance: ${recipientBalance / LAMPORTS_PER_SOL} SOL`);
    
    // Test amounts (same as in the failing transaction)
    const transferAmount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL
    const transactionFee = 0.0005 * LAMPORTS_PER_SOL; // 0.0005 SOL  
    const serviceFee = 0.000250 * LAMPORTS_PER_SOL; // 0.000250 SOL
    const totalRequired = transferAmount + transactionFee + serviceFee;
    
    console.log(`Transfer amount: ${transferAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`Transaction fee: ${transactionFee / LAMPORTS_PER_SOL} SOL`);
    console.log(`Service fee: ${serviceFee / LAMPORTS_PER_SOL} SOL`);
    console.log(`Total required: ${totalRequired / LAMPORTS_PER_SOL} SOL`);
    
    // Check if sender has enough balance
    if (senderBalance < totalRequired) {
      console.log(`❌ Insufficient balance! Required: ${totalRequired / LAMPORTS_PER_SOL} SOL, Available: ${senderBalance / LAMPORTS_PER_SOL} SOL`);
      return;
    }
    
    console.log("✅ Balance check passed");
    
    // Encrypted keys from database
    const senderEncryptedKey = "aaf51f3b2f630884920fb8df492acdbc24791f4f5419ce94401c587ccd139ccdd0b22546ac33ea28168a9e8136384e123df000306fc3e296ee39b7c40009403c2efb3096c27400569eee45d5665860c73779d8334487708b7ce47068";
    const masterKey = process.env.MASTER_KEY;
    
    if (!masterKey) {
      console.log("❌ MASTER_KEY environment variable not found");
      return;
    }
    
    console.log("🔓 Decrypting sender private key...");
    const senderKeyData = decryptPrivateKey(senderEncryptedKey, masterKey);
    const senderKeypair = Keypair.fromSecretKey(new Uint8Array(senderKeyData));
    
    console.log("✅ Private key decrypted successfully");
    console.log("📝 Creating transaction...");
    
    // Create exact same transaction structure as in transfer.ts
    const transaction = new Transaction();
    
    // 1. Transfer full amount to recipient (0.1 SOL)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: senderPubkey,
        toPubkey: recipientPubkey,
        lamports: transferAmount // 0.1 SOL - recipient gets full amount
      })
    );
    
    // 2. Service fee to admin wallet
    const adminPubkey = new PublicKey("YryMHU4nLRMjkAKtaVpo41tEScrRxwfNnXggoKwC8fS");
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: senderPubkey,
        toPubkey: adminPubkey,
        lamports: serviceFee // 0.000250 SOL
      })
    );
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;
    
    // Sign transaction
    transaction.sign(senderKeypair);
    
    console.log("📤 Simulating transaction...");
    
    // First simulate the transaction to see what happens
    try {
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        console.log("❌ Simulation failed:", JSON.stringify(simulation.value.err, null, 2));
        console.log("Logs:", simulation.value.logs);
      } else {
        console.log("✅ Simulation successful!");
        console.log("Units consumed:", simulation.value.unitsConsumed);
        
        // If simulation passes, send the actual transaction
        console.log("📤 Sending transaction...");
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
        
        console.log("✅ Transaction sent! Signature:", signature);
        
        // Confirm transaction
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight: await connection.getBlockHeight()
        }, 'confirmed');
        
        if (confirmation.value.err) {
          console.log("❌ Transaction failed:", JSON.stringify(confirmation.value.err));
        } else {
          console.log("✅ Transaction confirmed successfully!");
        }
      }
    } catch (simError) {
      console.log("❌ Simulation/Send error:", simError.message);
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
  }
}

// Run the test
testTransfer();