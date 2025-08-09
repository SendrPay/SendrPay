const { Connection, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

async function checkAdminBalance() {
  try {
    const connection = new Connection(process.env.RPC_URL || "https://devnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY, 'confirmed');
    
    const adminPubkey = new PublicKey("YryMHU4nLRMjkAKtaVpo41tEScrRxwfNnXggoKwC8fS");
    const balance = await connection.getBalance(adminPubkey);
    
    console.log(`Admin wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    console.log(`Admin wallet balance (lamports): ${balance}`);
    console.log(`Rent exemption minimum: ${890880} lamports (${890880 / LAMPORTS_PER_SOL} SOL)`);
    
    if (balance < 890880) {
      console.log("❌ Admin wallet has insufficient balance for rent exemption!");
      console.log("This is why the transaction is failing - the service fee recipient needs minimum SOL for rent");
    } else {
      console.log("✅ Admin wallet has sufficient balance for rent exemption");
    }
    
  } catch (error) {
    console.error("Error checking balance:", error.message);
  }
}

checkAdminBalance();