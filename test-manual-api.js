// Test script to manually check if we can process tip commands
const https = require('https');
const querystring = require('querystring');

const BOT_TOKEN = process.env.BOT_TOKEN;
const TEST_CHAT_ID = '-1002262946651'; // Your test group ID
const TEST_USER_ID = '777456789'; // Your user ID

async function testTipCommand() {
  console.log('=== TESTING TIP COMMAND PROCESSING ===');
  
  // Simulate a tip command with reply context
  const mockUpdate = {
    update_id: 999999,
    message: {
      message_id: 12345,
      from: {
        id: parseInt(TEST_USER_ID),
        is_bot: false,
        first_name: "Test",
        username: "7even"
      },
      chat: {
        id: parseInt(TEST_CHAT_ID),
        title: "vi, test and 7even",
        type: "group"
      },
      date: Math.floor(Date.now() / 1000),
      text: "/tip 0.1 SOL",
      reply_to_message: {
        message_id: 12344,
        from: {
          id: 555666777,
          is_bot: false,
          first_name: "vi",
          username: "vi100x"
        },
        chat: {
          id: parseInt(TEST_CHAT_ID),
          title: "vi, test and 7even", 
          type: "group"
        },
        date: Math.floor(Date.now() / 1000) - 60,
        text: "test message"
      }
    }
  };
  
  console.log('Mock update structure:');
  console.log(JSON.stringify(mockUpdate, null, 2));
  console.log('');
  
  // Test reply detection logic
  const isGroupChat = mockUpdate.message.chat.type !== "private";
  const hasReply = !!mockUpdate.message.reply_to_message;
  
  console.log('Reply detection results:');
  console.log('- Is group chat:', isGroupChat);
  console.log('- Has reply message:', hasReply);
  console.log('- Reply from user:', mockUpdate.message.reply_to_message?.from?.username);
  console.log('- Command from user:', mockUpdate.message.from.username);
  console.log('');
  
  if (isGroupChat && !hasReply) {
    console.log('❌ WOULD BE REJECTED: No reply message');
  } else {
    console.log('✅ WOULD BE ACCEPTED: Has reply message in group');
  }
  
  console.log('=== TEST COMPLETE ===');
}

testTipCommand();