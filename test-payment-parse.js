// Test payment command parsing
function mockParsePayCommand(text) {
  const args = text.split(' ').slice(1); // Remove /pay

  if (args.length < 2) return null;

  let payeeId = undefined;
  let payeeHandle = undefined;
  let targetPlatform = null;

  // Look for @mention or platform:username in args
  const targetArg = args.find(arg => arg.startsWith('@') || arg.includes(':'));
  if (targetArg) {
    // Handle platform:username format (e.g., discord:vi100x, telegram:vi100x)
    if (targetArg.includes(':')) {
      const [platform, handle] = targetArg.split(':');
      const platformLower = platform.toLowerCase();
      
      if (platformLower === 'discord' || platformLower === 'dc') {
        targetPlatform = 'discord';
        payeeHandle = handle.replace('@', '').toLowerCase();
      } else if (platformLower === 'telegram' || platformLower === 'tg') {
        targetPlatform = 'telegram';
        payeeHandle = handle.replace('@', '').toLowerCase();
      } else {
        return null; // Invalid platform
      }
    } else {
      // Regular @mention format - keep original case
      payeeHandle = targetArg.slice(1);
      targetPlatform = null;
    }
    
    // Remove target from args for further parsing
    args.splice(args.indexOf(targetArg), 1);
  }

  if (!payeeId && !payeeHandle) return null;

  // Parse amount
  const amountStr = args[0];
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return null;

  // Parse token (optional, defaults to USDC)
  let tokenTicker = "USDC";
  if (args.length > 1 && /^[A-Z]{2,10}$/i.test(args[1])) {
    tokenTicker = args[1].toUpperCase();
    args.splice(1, 1); // Remove token from args
  }

  // Remaining args are note
  const note = args.slice(1).join(' ').trim() || undefined;

  return {
    payeeId,
    payeeHandle,
    targetPlatform,
    amount,
    tokenTicker,
    note
  };
}

console.log("🧪 Testing payment command parsing...");

const testCommands = [
  "/pay @vi100x 0.1 SOL miss you",
  "/pay @useDefiLink 1.0 USDC",
  "/pay discord:vi100x 0.5 SOL",
  "/pay telegram:useDefiLink 2.0 USDC hello",
  "/pay @Vi100x 0.1 SOL", // Case test
  "/pay @VI100X 0.1 SOL", // Case test
];

testCommands.forEach(command => {
  console.log(`\nCommand: ${command}`);
  const parsed = mockParsePayCommand(command);
  if (parsed) {
    console.log(`- Handle: "${parsed.payeeHandle}"`);
    console.log(`- Platform: ${parsed.targetPlatform || 'default'}`);
    console.log(`- Amount: ${parsed.amount} ${parsed.tokenTicker}`);
    console.log(`- Note: "${parsed.note || 'none'}"`);
  } else {
    console.log("- Failed to parse");
  }
});

console.log("\n✅ Parsing test completed - the issue might be in the resolution logic, not parsing.");