import { sendPaymentNotification } from "./src/core/notifications";

// Test payment notification system
async function testNotification() {
  try {
    console.log("🧪 Testing payment notification system...");
    
    // Mock bot API (for testing without actual Telegram API calls)
    const mockBotApi = {
      sendMessage: async (chatId: string, text: string, options: any) => {
        console.log(`📤 Would send notification to ${chatId}:`);
        console.log(`Message: ${text}`);
        console.log(`Options:`, JSON.stringify(options, null, 2));
        return { message_id: 123 };
      }
    };
    
    // Test notification data
    const testData = {
      senderHandle: "vi100x",
      senderName: "Vi100x",
      recipientTelegramId: "123456789",
      amount: 0.1,
      tokenTicker: "SOL",
      signature: "test123abc456def789",
      note: "Test payment for notification system",
      isNewWallet: false
    };
    
    await sendPaymentNotification(mockBotApi, testData);
    console.log("✅ Notification system test completed successfully!");
    
  } catch (error) {
    console.error("❌ Notification test failed:", error);
  }
}

testNotification();