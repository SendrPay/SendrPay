# SendrPay (@SendrPayBot)

## Overview
SendrPay is a production-ready multi-platform bot that facilitates Solana blockchain payments within Telegram and Discord. Its core purpose is to simplify cryptocurrency transactions, making them accessible and user-friendly across platforms. Key capabilities include custodial wallet management with private key import, support for multiple SPL tokens (SOL, USDC, BONK, JUP), fully implemented cross-platform account linking, and functionalities for payments, tipping, and escrow. All transactions are processed on the Solana devnet, leveraging Helius RPC infrastructure. Users can seamlessly link their Discord and Telegram accounts via secure link codes to share one wallet across both platforms, enabling cross-platform payments and unified balance management.

## Recent Changes (August 11, 2025)
✅ Discord bot fully deployed and operational with all slash commands
✅ Cross-platform account linking completed with `/linktelegram` (Discord) and `/linkcode` (Telegram)
✅ Users can now send payments between Discord and Telegram platforms
✅ Both bots running simultaneously with shared wallet infrastructure
✅ Enhanced new user onboarding with three clear options on both platforms:
   - Create new custodial wallet
   - Import existing private key
   - Link account from other platform (Discord ↔ Telegram)
✅ Fixed Discord bot deployment issues with proper credential configuration
✅ Resolved Telegram bot polling crashes and stability issues
✅ Updated help command with comprehensive account linking instructions
✅ Fixed critical wallet merging database errors in cross-platform linking
✅ Implemented robust polling conflict resolution for simultaneous bot operation
✅ **MAJOR RESTORATION**: Full sophisticated functionality restored (August 11, 2025)
   - Discord bot: Real wallet generation, balances, deposit addresses
   - Telegram bot: Real blockchain integration with all core features
   - Both bots use existing TypeScript infrastructure (src/core/, src/commands/)
   - PostgreSQL database connected and operational
   - Webhook mode configured for Telegram to prevent polling conflicts
   - Separate processes: Discord (tsx src/discord/index.ts) + Telegram (tsx src/index.ts)
✅ **DEPLOYMENT FIX**: Solved Discord bot deployment issue (August 11, 2025)
   - Created unified deployment entry point (`src/combined.ts`)
   - Both Discord and Telegram bots now run in single process for Replit deployment
   - Proper webhook configuration for production deployment
   - Graceful error handling prevents one bot from crashing the other
   - Single "Combined Deploy" workflow replaces separate bot workflows
   - Fixed URL formatting issues in webhook setup
✅ **WEBHOOK RESTORATION**: Fixed critical TypeScript errors preventing webhook deployment
   - Fixed missing logger imports causing compilation failures
   - Restored webhook functionality with polling fallback
   - **Solution for future**: Check TypeScript compilation errors when deployment fails but dev works
✅ Both platforms now stable with complete real blockchain functionality and deployment-ready
✅ **ACCOUNT LINKING AUTOMATED**: Fixed automatic linkcode command for all users (August 12, 2025)
   - **Root cause**: Database unique constraint on telegramId prevented automatic linking
   - **Solution**: Enhanced transaction logic to temporarily clear telegramId before linking
   - **Automatic fix**: Linkcode command now handles unique constraints properly
   - **Process**: Clear existing telegramId → Link accounts → Transfer wallets → Cleanup
   - **Status**: Account linking fully automated and operational for all users
✅ **WALLET SELECTION FEATURE**: Added wallet choice system for users with existing wallets (August 12, 2025)
   - **Commands added**: `/keepdiscord` and `/keeptelegram` for wallet selection
   - **Feature**: When both accounts have wallets, users choose which to keep
   - **Process**: User selects preferred wallet → Other wallet deactivated → Accounts linked
   - **Safety**: Unused wallets deactivated (not deleted) for security
✅ **CROSS-PLATFORM PAYMENTS**: Implemented full cross-platform payment functionality (August 12, 2025)
   - **Platform targeting**: `/pay discord:username amount TOKEN` or `/pay telegram:username amount TOKEN`
   - **Default behavior**: `/pay @username` defaults to current platform, then searches linked accounts
   - **Smart resolution**: Finds users across platforms automatically for linked accounts
   - **Examples**: Discord user can pay Telegram user and vice versa
   - **Status**: Cross-platform payments fully operational between Discord and Telegram
✅ **CASE-INSENSITIVE USERNAMES**: Fixed username recognition to match platform behavior (August 12, 2025)
   - **Issue resolved**: Usernames now case-insensitive like actual Discord/Telegram platforms
   - **Database search**: All username lookups use case-insensitive matching
   - **Parsing fixed**: Payment parsing preserves original case, database handles insensitive search
   - **User experience**: @vi100x, @Vi100x, @VI100X all resolve to same user correctly
   - **Status**: Recipient recognition working properly for payments and transfers
✅ **PLATFORM-SPECIFIC USERNAMES**: Enhanced cross-platform resolution for different usernames (August 12, 2025)
   - **Issue addressed**: Same user has different usernames on different platforms (@vi100x on Telegram, @crumvi on Discord)
   - **Database structure**: User 89 linked with both platforms but single handle stored
   - **Resolution logic**: Special handling for platform-specific username requests (discord:crumvi maps to vi100x account)
   - **Cross-platform payments**: Both `telegram:vi100x` and `discord:crumvi` resolve to same wallet
   - **Status**: Cross-platform payments support platform-specific username targeting
✅ **DISCORD WALLET DETECTION FIX**: Fixed critical issue where Discord bot wasn't detecting existing wallets (August 12, 2025)
   - **Root cause**: `getOrCreateUserByDiscordId` function wasn't properly returning wallet data after creating new wallets
   - **Solution**: Enhanced function to re-fetch user with wallets after wallet creation, plus improved wallet detection logic
   - **Enhanced checks**: Discord /start command now uses dual wallet detection (user.wallets and direct query)
   - **Status**: Discord users with existing wallets now properly receive welcome-back message instead of setup prompts
✅ **ANTI-GRIEFING PROTECTION**: Implemented sender-only payment confirmation controls (August 15, 2025)
   - **Issue addressed**: Other users could confirm/cancel payments in group chats, enabling griefing attacks
   - **Solution**: Added authorization checks requiring only payment sender can confirm/cancel transactions
   - **Platforms affected**: Both Discord and Telegram payment/tip confirmation buttons
   - **Security enhancement**: Prevents unauthorized users from interfering with others' transactions
   - **User experience**: Clear error messages when unauthorized users attempt to interact with payment buttons
   - **Status**: Group chat payments now fully protected against griefing while maintaining functionality
✅ **WEB APP FOUNDATION**: Built complete OAuth-ready web application (August 15, 2025)
   - **Architecture**: Express.js + TypeScript + Prisma + Vite frontend
   - **Authentication**: Email magic codes, Discord OAuth2 ready, Twitter OAuth2 scaffolded
   - **Database**: Extended schema with SocialLink, OAuthAccount, MagicCode, Session models
   - **Frontend**: Modern React-like TypeScript frontend with responsive design
   - **Security**: AES-256-CBC encryption, session management, CORS protection
   - **API endpoints**: Complete auth flows, wallet generation/import, dashboard
   - **Status**: Web server running on port 5001, all basic functionality tested and operational
✅ **CROSS-PLATFORM USERNAME RESOLUTION**: Fixed platform-specific username targeting (August 15, 2025)
   - **Issue addressed**: Users with different usernames on different platforms couldn't be targeted correctly
   - **Example problem**: User has Discord username "yurty_" and Telegram handle "sendrpay" - `discord:sendrpay` failed
   - **Root cause**: Cross-platform resolver only searched for users with specified handle on target platform
   - **Solution**: Added fallback logic to search for handle on ANY platform, then verify target platform account exists
   - **Enhancement**: Both `telegram:sendrpay` and `discord:yurty_` now resolve to same linked user
   - **Status**: Cross-platform payments work correctly for users with different platform-specific usernames
✅ **PLATFORM-SPECIFIC PAYMENT DEFAULTS**: Removed automatic cross-platform fallback (August 15, 2025)
   - **Issue addressed**: Default payments (`/pay @username`) automatically searched other platforms if user not found
   - **Privacy concern**: Users could accidentally send payments to other platforms without explicit intent
   - **Root cause**: Cross-platform resolver had fallback logic for non-prefixed payments
   - **Solution**: Removed automatic fallback - default payments now stay platform-specific
   - **New behavior**: `/pay @username` only searches current platform, explicit `discord:` or `telegram:` required for cross-platform
   - **Status**: Payment targeting is now explicit and platform-specific by default

## User Preferences
Preferred communication style: Simple, everyday language.
Data handling: All data must be live and accurate - never use mock, placeholder, or fake data.

## System Architecture

### Backend Architecture
- **Framework**: Node.js with TypeScript using grammY.
- **API Structure**: Express.js server for webhooks and web routes.
- **Command System**: Separate handlers for group and DM commands with session management.
- **Processing Flow**: Commands are parsed, validated, interact with the blockchain, and then formatted for response.

### Database & Storage
- **ORM**: Prisma (with SQLite for dev, PostgreSQL for production).
- **Schema**: Comprehensive schema covering users, wallets, tokens, chats, transactions, and escrows.
- **Caching**: In-memory token cache for performance.
- **Encryption**: AES-GCM encryption for private key storage.

### Blockchain Integration
- **Network**: Solana devnet via Helius RPC.
- **Wallet Management**: Custodial (server-managed) and non-custodial (private key import).
- **Token Support**: Native SOL and configurable SPL token allowlist.
- **Transaction Handling**: Direct blockchain transactions with fee calculation and an escrow system for unlinked users. Automatic admin wallet funding ensures rent exemption for fee collection, and recipient wallet funding for new users.

### Security Architecture
- **Rate Limiting**: Token bucket algorithm.
- **Input Validation**: Zod schemas for comprehensive validation.
- **Webhook Security**: HMAC signature verification for Helius webhooks.
- **Key Management**: Encrypted private key storage.
- **Idempotency**: Transaction deduplication using client intent IDs.
- **Authentication**: Telegram user ID-based authentication.
- **Authorization**: Admin-controlled bot whitelisting per group and role-based access.

### Feature Architecture
- **Payment System**: Direct transfers with in-kind fee deduction and escrow. Payments support both group and direct messages, including cross-context payments. Username verification is strict and case-insensitive.
- **Fee System**: Configurable basis points with per-token minimum fees.
- **Escrow System**: Temporary fund holding for users without linked wallets.
- **Onboarding System**: Three-option setup flow for new users: custodial wallet generation, private key import, or cross-platform account linking with secure 10-minute expiring codes.
- **Notifications**: Standardized message templates for all bot interactions, including payment, tip, deposit, withdrawal, and history, with consistent formatting across group chats and DMs. Includes simplified emoji-only reaction system for payment notifications.
- **UI/UX**: Modern, clean interface design with concise language and consistent formatting for welcome messages, balance displays, payment confirmations, error messages, and help documentation. Discord features rich embeds with interactive buttons.

## External Dependencies

### Blockchain Infrastructure
- **Helius API**: RPC provider, webhook services, transaction broadcasting.
- **Solana Web3.js**: Blockchain interaction and transaction construction.
- **SPL Token Library**: Token account management and transfers.

### Communication Platforms
- **Telegram Bot API**: Message handling, inline keyboards, user interaction with DM commands including `/linkcode`.
- **Discord.js v14**: Discord bot framework with slash commands (/start, /pay, /tip, /balance, /deposit, /withdraw, /linktelegram) and button interactions.
- **grammY Framework**: Telegram bot framework with session management and middleware support.
- **Cross-Platform Linking**: Full account linking system where Discord users generate codes via `/linktelegram`, then use `/linkcode` in Telegram to share one wallet across both platforms.

### Development & Deployment
- **Prisma ORM**: Database schema management and query building.
- **Express.js**: HTTP server for webhooks and health checks.
- **Pino Logger**: Structured logging.

### Cryptography & Security
- **Node.js Crypto Module**: AES-GCM encryption and HMAC verification.
- **BS58 Encoding**: Solana address and key encoding/decoding.
- **UUID Library**: Unique identifier generation.