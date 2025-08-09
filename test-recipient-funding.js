const { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair } = require("@solana/web3.js");

// Test scenario: Check if a brand new wallet (0 balance) would cause transfer failure
async function testRecipientFunding() {
  try {
    const connection = new Connection(process.env.RPC_URL || "https://devnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY, 'confirmed');
    
    // Create a fresh new wallet (0 balance) to simulate new user
    const newWallet = Keypair.generate();
    const newWalletAddress = newWallet.publicKey.toBase58();
    
    console.log("🧪 Testing recipient funding logic...");
    console.log(`New wallet address: ${newWalletAddress}`);
    
    // Check balance (should be 0)
    const balance = await connection.getBalance(newWallet.publicKey);
    console.log(`New wallet balance: ${balance / LAMPORTS_PER_SOL} SOL (${balance} lamports)`);
    
    // Test the logic from transfer.ts
    const recipientBalance = balance;
    const rentExemptMinimum = 890880; // ~0.00089 SOL
    const transferAmount = 100_000_000; // 0.1 SOL
    
    let totalToRecipient = transferAmount;
    let recipientFunding = 0;
    
    // Apply the same logic as in transfer.ts
    if (recipientBalance === 0) {
      totalToRecipient = transferAmount + rentExemptMinimum;
      recipientFunding = rentExemptMinimum;
      console.log(`✅ New wallet detected - would add rent exemption: ${rentExemptMinimum / LAMPORTS_PER_SOL} SOL`);
    }
    
    console.log(`📊 Transfer calculation:`);
    console.log(`  - Transfer amount: ${transferAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`  - Recipient funding: ${recipientFunding / LAMPORTS_PER_SOL} SOL`);  
    console.log(`  - Total to recipient: ${totalToRecipient / LAMPORTS_PER_SOL} SOL`);
    console.log(`  - Additional cost to sender: ${recipientFunding / LAMPORTS_PER_SOL} SOL`);
    
    // Test with existing wallet (should not need funding)
    const existingWalletAddress = "BrWdDCTUhvM33Y4syCYf4ZBhE4xNAeGVoWe8bCPBetLA";
    const existingBalance = await connection.getBalance(new PublicKey(existingWalletAddress));
    
    console.log(`\n🔄 Testing existing wallet: ${existingWalletAddress}`);
    console.log(`Existing wallet balance: ${existingBalance / LAMPORTS_PER_SOL} SOL`);
    
    if (existingBalance === 0) {
      console.log(`✅ Would add rent exemption funding`);
    } else {
      console.log(`✅ No additional funding needed - recipient gets exact transfer amount`);
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testRecipientFunding();