#!/usr/bin/env node

// Test rent exemption handling for KOL payments
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

async function testRentExemption() {
  console.log('\n🏠 Testing Rent Exemption for KOL Payments...\n');
  
  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');
  const rentExemptMinimum = 890880; // ~0.00089 SOL
  
  // Test wallets
  const testWallets = [
    'Fo83fzNnjMjFwMyKMRFKXAAAVddQ3hbmhnTW1qi27aEi', // Recipient
    'H592ewyMCzLUbxb5ehzQmBJFtkBqq7vnYv7FfMYwiBKR'  // Sender
  ];
  
  console.log('Rent exemption minimum:', rentExemptMinimum / LAMPORTS_PER_SOL, 'SOL');
  console.log();
  
  for (const walletAddress of testWallets) {
    try {
      const balance = await connection.getBalance(new PublicKey(walletAddress));
      const needsRentExemption = balance === 0;
      
      console.log(`Wallet: ${walletAddress}`);
      console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
      console.log(`Needs rent exemption: ${needsRentExemption ? 'YES' : 'NO'}`);
      
      if (needsRentExemption) {
        console.log(`⚠️  This wallet would need ${rentExemptMinimum / LAMPORTS_PER_SOL} SOL rent exemption`);
      }
      console.log();
      
    } catch (error) {
      console.log(`❌ Error checking ${walletAddress}: ${error.message}`);
    }
  }
  
  // Test payment scenario with rent exemption
  const paymentAmount = 25000000; // 0.025 SOL in lamports
  const platformFee = Math.floor(paymentAmount * 0.05); // 5%
  const netAmount = paymentAmount - platformFee;
  
  console.log('💰 KOL Payment Scenario:');
  console.log(`Payment amount: ${paymentAmount / LAMPORTS_PER_SOL} SOL`);
  console.log(`Platform fee (5%): ${platformFee / LAMPORTS_PER_SOL} SOL`);
  console.log(`Net to recipient: ${netAmount / LAMPORTS_PER_SOL} SOL`);
  
  // Check if sender has enough including potential rent exemption
  const senderBalance = await connection.getBalance(new PublicKey(testWallets[1]));
  const recipientBalance = await connection.getBalance(new PublicKey(testWallets[0]));
  
  const recipientNeedsRent = recipientBalance === 0;
  const totalRequired = paymentAmount + (recipientNeedsRent ? rentExemptMinimum : 0) + 15000; // + tx fee
  
  console.log();
  console.log('🔍 Balance Check:');
  console.log(`Sender has: ${senderBalance / LAMPORTS_PER_SOL} SOL`);
  console.log(`Total required: ${totalRequired / LAMPORTS_PER_SOL} SOL`);
  console.log(`Sufficient funds: ${senderBalance >= totalRequired ? 'YES ✅' : 'NO ❌'}`);
  
  if (recipientNeedsRent) {
    console.log(`Note: Includes ${rentExemptMinimum / LAMPORTS_PER_SOL} SOL rent exemption for recipient`);
  }
}

testRentExemption().catch(console.error);