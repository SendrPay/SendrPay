import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed tokens with correct devnet addresses
  const tokens = [
    {
      mint: 'SOL', // Special case for native SOL
      ticker: 'SOL',
      name: 'Solana',
      decimals: 9,
      enabled: true,
    },
    {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC devnet
      ticker: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      enabled: true,
    },
    {
      mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK devnet (example)
      ticker: 'BONK',
      name: 'Bonk',
      decimals: 5,
      enabled: true,
    },
    {
      mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', // JUP devnet (example)
      ticker: 'JUP',
      name: 'Jupiter',
      decimals: 6,
      enabled: true,
    },
    {
      mint: 'So11111111111111111111111111111111111111112', // Wrapped SOL
      ticker: 'WSOL',
      name: 'Wrapped SOL',
      decimals: 9,
      enabled: true,
    },
  ];

  // Insert tokens
  for (const token of tokens) {
    await prisma.token.upsert({
      where: { mint: token.mint },
      update: token,
      create: token,
    });
    console.log(`✅ Token: ${token.ticker} (${token.mint})`);
  }

  // Create a demo admin user if OWNER_TELEGRAM_ID is set
  if (process.env.OWNER_TELEGRAM_ID) {
    const adminUser = await prisma.user.upsert({
      where: { telegramId: process.env.OWNER_TELEGRAM_ID },
      update: {
        handle: 'admin',
      },
      create: {
        telegramId: process.env.OWNER_TELEGRAM_ID,
        handle: 'admin',
      },
    });
    console.log(`✅ Admin user created: ${adminUser.telegramId}`);
  }

  // Initialize system stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.systemStats.upsert({
    where: { date: today },
    update: {},
    create: {
      date: today,
      totalUsers: 0,
      totalPayments: 0,
      totalVolumeSol: '0',
      newUsers: 0,
      newPayments: 0,
      failedPayments: 0,
      activeEscrows: 0,
    },
  });
  console.log('✅ System stats initialized');

  // Seed some example chat configurations (optional)
  const exampleChats = [
    {
      chatId: '-1001234567890',
      type: 'supergroup',
      title: 'Solana Pay Test Group',
      whitelisted: true,
      tipping: true,
      defaultTicker: 'USDC',
    },
  ];

  for (const chat of exampleChats) {
    await prisma.chat.upsert({
      where: { chatId: chat.chatId },
      update: chat,
      create: chat,
    });
    console.log(`✅ Example chat: ${chat.title}`);
  }

  console.log('🎉 Database seeding completed!');
  
  // Display summary
  const tokenCount = await prisma.token.count();
  const userCount = await prisma.user.count();
  const chatCount = await prisma.chat.count();
  
  console.log('\n📊 Database Summary:');
  console.log(`   Tokens: ${tokenCount}`);
  console.log(`   Users: ${userCount}`);  
  console.log(`   Chats: ${chatCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
