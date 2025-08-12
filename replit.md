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
✅ **ACCOUNT LINKING FIXED**: Successfully resolved unique constraint database error (August 12, 2025)
   - **Root cause**: Existing telegramId constraint prevented linking
   - **Solution**: Enhanced linkcode logic to handle existing users and prevent duplicates
   - **Result**: Accounts now properly linked with shared wallet across platforms
   - **Manual fix applied**: Discord user 66 now has both discordId and telegramId
   - **Status**: Account linking fully operational

## User Preferences
Preferred communication style: Simple, everyday language.

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