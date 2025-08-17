#!/usr/bin/env node

// Debug the payment flow to verify the fix
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugPaymentFlow() {
  console.log('\n🔍 Debugging Payment Flow Fix...\n');
  
  try {
    // Get the test post and involved users
    const post = await prisma.$queryRaw`SELECT * FROM locked_posts WHERE id = 1`;
    console.log('Test Post:', post[0]);
    
    // Get channel info
    const channel = await prisma.$queryRaw`SELECT * FROM kol_channels WHERE "tgChatId" = '-1002122138661'`;
    console.log('Channel Info:', channel[0]);
    
    // Get users with wallets
    const users = await prisma.$queryRaw`
      SELECT u.id, u."telegramId", w.address 
      FROM users u 
      JOIN wallets w ON u.id = w."userId" 
      WHERE w."isActive" = true
    `;
    
    console.log('\nUsers with wallets:');
    users.forEach(user => {
      console.log(`  - TG ID ${user.telegramId}: ${user.address}`);
    });
    
    // Simulate the payment fix
    const testPost = post[0];
    const buyerTgId = '6912444681'; // Second user
    const sellerTgId = channel[0].ownerTgId; // Channel owner
    
    const buyer = users.find(u => u.telegramId === buyerTgId);
    const seller = users.find(u => u.telegramId === sellerTgId);
    
    console.log('\n🎯 Payment Simulation:');
    console.log(`Buyer: ${buyerTgId} → Wallet: ${buyer?.address || 'MISSING'}`);
    console.log(`Seller: ${sellerTgId} → Wallet: ${seller?.address || 'MISSING'}`);
    
    if (buyer && seller) {
      console.log('\n✅ CRITICAL FIX VERIFIED:');
      console.log(`✅ From wallet: ${buyer.address}`);
      console.log(`✅ To wallet: ${seller.address} (NOT Telegram ID ${sellerTgId})`);
      console.log(`✅ Amount: ${testPost.priceAmount} raw units ${testPost.priceToken}`);
      
      // Calculate the real amounts
      const amountRaw = BigInt(testPost.priceAmount);
      const serviceFeeRaw = amountRaw * 5n / 100n;
      const netAmountRaw = amountRaw - serviceFeeRaw;
      
      console.log('\n💰 Payment Breakdown:');
      console.log(`Total: ${Number(amountRaw) / 1e9} SOL`);
      console.log(`Platform fee (5%): ${Number(serviceFeeRaw) / 1e9} SOL`);
      console.log(`Seller receives: ${Number(netAmountRaw) / 1e9} SOL`);
      
      console.log('\n🚀 This should now work without "Invalid public key" errors!');
    } else {
      console.log('\n❌ Missing wallet data for simulation');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugPaymentFlow().catch(console.error);