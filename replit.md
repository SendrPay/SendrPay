# SendrPay Telegram Bot - Project Documentation

## Overview
A robust multi-platform blockchain payment bot integrating Telegram and Discord for seamless crypto transactions on the Solana devnet, with advanced cross-platform user management, wallet linking, and KOL (Key Opinion Leader) monetization features.

## Recent Changes (August 17, 2025)

### Complete KOL Menu System with Full Database Integration
- **FIXED: Duplicate Response Issue**: Removed duplicate command registrations between DM and Group routes preventing double responses
- **Complete End-to-End Workflows**: All 5 KOL buttons now have full workflows from start to finish with database persistence
- **Comprehensive Database Storage**: Enhanced all KOL features to store user interactions, settings, and data for scalability
- **Advanced Statistics Dashboard**: Real earnings data, supporter analytics, and content performance metrics from database
- **Deep Menu Navigation**: Main Menu → 5 specialized sections → 3-4 sub-options each with real functionality
- **Content Creation Workflow**: Channel setup → Post creation → Performance tracking with actual data
- **Group Management System**: Step-by-step linking guides with member tracking and settings storage
- **Production-Ready Structure**: Fixed syntax errors, callback registrations, and LSP diagnostics for stable operation

### Enhanced Paywalled Content Interface
- **Interactive Unlock Interface**: Comprehensive button-driven content unlock with helpful explanations
- **Content Preview System**: "What's Inside?" button shows content type and word count without revealing details
- **Pricing Transparency**: Detailed pricing breakdown showing platform fees and creator earnings
- **Educational Interface**: "How It Works" explanation for new users unfamiliar with paywalled content
- **Author Tip Integration**: Direct tip buttons for content creators with KOL settings
- **Smart Navigation**: Back buttons and intuitive flow between different information screens
- **Professional UX**: Clear payment confirmations with fee breakdowns and cancellation options

### Unified Content Creation System (Content Mixing)
- **Mixed Content Support**: KOLs can now combine text, images, and videos in single posts
- **Flexible Workflow**: Add content in any order - text first, then media, or vice versa
- **Smart Descriptions**: Channel posts automatically describe content type (text, images, video, or mixed)
- **File Size Limits**: Images max 10MB, Videos max 50MB to prevent database issues
- **Database Optimization**: Single JSON payload efficiently stores all content types
- **Content Delivery**: Enhanced unlock system handles mixed content delivery with proper formatting

## Recent Changes (August 17, 2025) - Previous

### Critical Payment Bug Fixed and System Operational
- **FIXED: Invalid Public Key Error**: Payments were being sent to Telegram IDs instead of wallet addresses
- **FIXED: Database Connection Issues**: Resolved PostgreSQL connection errors preventing payment processing
- **FIXED: TypeScript Compilation Errors**: All undefined variable references corrected
- **Payment Flow Verified**: Successfully sending from wallet `H592ewyMCzLUbxb5ehzQmBJFtkBqq7vnYv7FfMYwiBKR` to `Fo83fzNnjMjFwMyKMRFKXAAAVddQ3hbmhnTW1qi27aEi`
- **Platform Fee System Working**: 5% fee for content unlock, 2% for tips, properly calculated and collected
- **Complete End-to-End Testing**: Payment amounts, recipient verification, wallet balance checks all functional
- **Rent Exemption Verified**: KOL payments properly handle new wallet rent exemption (0.00089 SOL) via executeTransfer function

### Privacy-Enhanced Payment System Implemented
- **Session Persistence Fixed**: Resolved "session expired" errors by eliminating session dependency - payment data now embedded in callback buttons
- **Token Recognition Fixed**: Added SOL, USDC, BONK, and JUP tokens to database - "Unknown token: SOL" errors resolved
- **Payment Timeout Fixed**: Implemented 30-second transaction timeout to prevent infinite loading - payment confirmations no longer hang
- **Transaction Logging**: Added comprehensive logging to track payment processing and identify blockchain delays
- **Multi-User Support**: Fixed critical issue where channel messages were being replaced instead of preserved for multiple users
- **DM-Only Payment Flow**: Clicking "Buy Full Access" now opens DM conversation with payment confirmation
- **Channel Message Preservation**: Original paywalled posts remain unchanged in channels for all users to see
- **Private Payment Processing**: All payment confirmations, transaction details, and content delivery via DM
- **Robust State Management**: Payment flow now works reliably without session storage limitations
- **User Account Verification**: Added Telegram ID-based user signup verification before payment processing
- **Seamless UX**: Users get "Check your DM" notifications instead of broken channel message flow
- **Database Import Fixes**: Resolved all `db` to `prisma` import issues preventing bot commands

### Bot Functionality Restored
- **Fixed Critical Issues**: Resolved bot startup and command processing problems
- **Markdown Formatting**: Fixed MarkdownV2 parsing errors in /start command that prevented bot responses
- **Bot Initialization**: Corrected bot initialization sequence and message handling
- **Database Connection**: Confirmed PostgreSQL database connectivity and user management working
- **Polling Mode Verified**: All KOL features confirmed working in polling mode
- **Deployment Configuration**: Fixed port conflicts between preview and deployment
- **Environment Separation**: Preview uses polling, deployment uses webhooks
- **Channel Setup**: Database saves working correctly despite misleading error messages

### Previous Changes (August 16, 2025)

### KOL Monetization Features Added
- **Inline Payment Buttons**: Replaced text commands with interactive buttons for tipping and group joining
- **KOL Setup Command**: `/setup` allows KOLs to configure accepted tokens and group pricing
- **Platform Fees**: Implemented 2% fee on tips and 5% fee on group access payments
- **Private Group Access**: KOLs can charge for access to private Telegram groups
- **Dynamic Button Generation**: Buttons are generated based on each KOL's configuration
- **Group Linking**: `/linkgroup` command to connect private groups to KOL accounts
- **Paywalled Content**: Added `/channel_init` and `/post_locked` for channel monetization
- **Admin-Based Verification**: Changed from message forwarding to bot admin status verification
- **Comprehensive Help**: Updated `/start` and `/help` with full KOL feature documentation

## Key Technologies
- TypeScript-powered cross-platform bot infrastructure
- Solana blockchain integration via Helius API
- PostgreSQL database for advanced user management
- Webhook-based communication for Discord and Telegram
- Enhanced blockchain transaction validation
- Comprehensive wallet management system
- Platform fee collection system

## Project Architecture

### Core Components
1. **Bot Framework**: Grammy for Telegram bot functionality
2. **Database**: PostgreSQL with Prisma ORM
3. **Blockchain**: Solana devnet integration
4. **Encryption**: AES-GCM for private key security

### New KOL Features
1. **KOL Settings Model**: Stores accepted tokens, group pricing, and linked groups
2. **Group Access Model**: Tracks paid memberships
3. **Platform Fee System**: Automatic fee deduction and treasury collection
4. **Inline Button Handler**: Callback query processing for interactive payments

## Commands

### User Commands
- `/start` - Initialize wallet and bot setup
- `/pay @user amount TOKEN [note]` - Send tokens to another user
- `/tip amount [TOKEN]` - Tip by replying to a message
- `/balance` - Check wallet balances
- `/withdraw amount TOKEN address` - Withdraw to external address
- `/deposit` - Get deposit address
- `/history` - View transaction history

### KOL Commands
- `/setup` - Configure KOL payment settings (tip tokens, group pricing)
- `/kol [@username]` - Display KOL profile with payment buttons
- `/linkgroup` - Link private group for paid access (use in group)
- `/unlinkgroup` - Unlink private group

### Admin Commands
- `/enable` - Group admins whitelist the bot
- `/settings` - Configure bot settings
- `/admin` - Owner-only administration

## Platform Fees
- **Tips**: 2% platform fee (deducted from recipient)
- **Group Access**: 5% platform fee (deducted from recipient)
- **Fee Collection**: Automatically sent to platform treasury wallet

## KOL Setup Flow

1. **Initial Setup**: KOL uses `/setup` command
2. **Token Selection**: Choose which tokens to accept for tips (USDC, SOL, BONK, JUP)
3. **Group Configuration**: Set price and token for private group access
4. **Group Linking**: Add bot as admin and use `/linkgroup` in the private group
5. **Profile Creation**: Automatic generation of payment buttons based on settings

## Inline Button Features

### Tip Buttons
- Dynamic generation based on accepted tokens
- Quick amount selection (1, 5, 10, 25, 50, 100) or custom
- Confirmation with fee breakdown
- Automatic notifications to both parties

### Group Join Buttons
- Single-use invite link generation
- Automatic access grant after payment
- Member tracking in database
- Expiration support for time-limited access

## Security Features
- **Custodial Wallets**: Bot manages private keys securely
- **Encrypted Storage**: Private keys encrypted with AES-GCM
- **Rate Limiting**: Prevents abuse and spam
- **Transaction Validation**: All payments verified on-chain
- **Single-Use Invites**: Group links expire after one use
- **Privacy Protection**: Payment confirmations sent via DM, not public messages
- **User Authentication**: Telegram ID verification for all payment operations
- **Account Validation**: Users must create accounts before making payments

## Environment Variables Required
- `BOT_TOKEN` - Telegram bot token
- `DATABASE_URL` - PostgreSQL connection string
- `MASTER_KMS_KEY` - Base64 encoded 32-byte key for encryption
- `SOLANA_RPC_URL` - Helius API endpoint
- `HELIUS_API_KEY` - Helius API key
- `FEE_TREASURY_ADDRESS` - Platform fee collection wallet (optional)
- `OWNER_TELEGRAM_ID` - Bot owner's Telegram ID

## Database Schema Updates

### KolSettings Table
- `userId` - Link to User
- `acceptedTipTokens` - Array of token tickers
- `groupAccessEnabled` - Boolean flag
- `groupAccessToken` - Token for group payment
- `groupAccessPrice` - Price in raw units
- `privateGroupChatId` - Linked Telegram group ID

### GroupAccess Table
- `memberId` - User who gained access
- `groupOwnerId` - KOL who owns the group
- `groupChatId` - Telegram group ID
- `paymentId` - Reference to payment record
- `accessGranted` - Timestamp
- `expiresAt` - Optional expiration

### Payment Table Updates
- `platformFeeRaw` - Platform fee amount
- `paymentType` - "payment" | "tip" | "group_access"

## User Preferences
- Clear, concise communication without technical jargon
- Step-by-step explanations for complex features
- Proactive error handling with user-friendly messages

## Development Notes
- Always use Prisma for database operations
- Platform fees are percentage-based for easy adjustment
- Inline buttons use callback_data with encoded parameters
- Group invite links require bot admin permissions
- All amounts stored as raw units (bigint) in database

## Testing Checklist
- [ ] KOL can configure tip tokens via `/setup`
- [ ] KOL can set group access price
- [ ] Bot can be linked to private group
- [ ] Inline tip buttons appear on KOL profile
- [ ] Tips deduct 2% platform fee
- [ ] Group join deducts 5% platform fee
- [ ] Invite links are generated correctly
- [ ] Both parties receive notifications
- [ ] Transaction records include platform fees

## Future Enhancements
- Time-limited group access with automatic removal
- Subscription-based recurring payments
- Analytics dashboard for KOLs
- Multi-tier group access levels
- Custom tip messages and reactions