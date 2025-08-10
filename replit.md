# Solana Pay Bot

## Overview

A production-ready Telegram bot that enables Solana blockchain payments within Telegram groups and DMs. The bot provides custodial wallet management with user private key import, supports multiple SPL tokens (SOL, USDC, BONK, JUP), and includes features like payments, tipping, bill splitting, giveaways, and escrow functionality. All transactions occur on Solana devnet via Helius RPC infrastructure.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Node.js with TypeScript using grammY (Telegram bot framework)
- **API Structure**: Express.js server handling webhooks and web routes
- **Command System**: Separate route handlers for group vs DM commands with session management
- **Processing Flow**: Commands → Parsing → Validation → Blockchain interaction → Response formatting

### Database & Storage
- **ORM**: Prisma with SQLite for development (easily switchable to PostgreSQL for production)
- **Schema**: Users, wallets, tokens, chats, transactions, escrows, and giveaways
- **Caching**: In-memory token cache to minimize database queries
- **Encryption**: AES-GCM encryption for private key storage using master key

### Blockchain Integration
- **Network**: Solana devnet via Helius RPC
- **Wallet Management**: Both custodial (server-managed keypairs) and non-custodial (Phantom wallet linking)
- **Token Support**: Native SOL and SPL tokens with configurable allowlist
- **Transaction Handling**: Direct blockchain transactions with fee calculation and escrow system

### Security Architecture
- **Rate Limiting**: Token bucket algorithm for request throttling
- **Input Validation**: Comprehensive validation using Zod schemas
- **Webhook Security**: HMAC signature verification for Helius webhooks
- **Key Management**: Encrypted private key storage with master key rotation capability
- **Idempotency**: Transaction deduplication using client intent IDs

### Authentication & Authorization
- **User Authentication**: Telegram user ID-based authentication
- **Group Authorization**: Admin-controlled bot whitelisting per group
- **Wallet Linking**: Signature-based verification for non-custodial wallets
- **Permission System**: Role-based access for group settings and admin commands

### Feature Architecture
- **Payment System**: Direct transfers with in-kind fee deduction and escrow for unlinked users
- **Giveaway System**: In-memory giveaway state with on-chain prize distribution
- **Fee System**: Configurable basis points with per-token minimum fees
- **Escrow System**: Temporary fund holding for users without linked wallets

## External Dependencies

### Blockchain Infrastructure
- **Helius API**: Primary RPC provider, webhook services, and transaction broadcasting
- **Solana Web3.js**: Blockchain interaction and transaction construction
- **SPL Token Library**: Token account management and transfers

### Communication Platform
- **Telegram Bot API**: Message handling, inline keyboards, and user interaction
- **grammY Framework**: Bot framework with session management and middleware support

### Development & Deployment
- **Prisma ORM**: Database schema management and query building
- **Express.js**: HTTP server for webhooks and web interfaces
- **Pino Logger**: Structured logging with redaction of sensitive data

### Cryptography & Security
- **Node.js Crypto Module**: AES-GCM encryption and HMAC verification
- **BS58 Encoding**: Solana address and key encoding/decoding
- **UUID Library**: Unique identifier generation for transactions and escrows

### Wallet Integration
- **Secret Key Import**: Users can import wallets via private key input (Base58 or JSON format)
- **Custodial Management**: AES-256-GCM encrypted storage of user-provided private keys
- **Username Verification**: Payments only succeed when directed to verified Telegram usernames
- **Dual Context Support**: All payment commands work in both group chats and direct messages

## Recent Changes (August 2025)
- **Updated Architecture**: Removed Phantom wallet integration in favor of private key import system
- **Enhanced Security**: Fixed encryption to use proper AES-256-GCM with createCipheriv/createDecipheriv
- **Username Verification**: Implemented strict username verification using actual Telegram usernames - users cannot set custom usernames, preventing scams by ensuring @vi100x can only receive payments when directed to their verified Telegram handle
- **DM Payment Support**: All payment commands (/pay, /tip, /split) now work in direct messages for private transactions
- **Cross-Context Functionality**: Users can now pay people they're not in group chats with via direct messages
- **Production Deployment Ready**: Fixed all deployment configuration issues (August 9, 2025)
  - Server properly configured to listen on 0.0.0.0:5000 for external access
  - Database connection established with PostgreSQL
  - All required environment variables configured and validated
  - Health endpoint available for monitoring (/health)
  - Proper startup command configured for Replit Deployments
  - Created alternative package.json (package-production.json) with proper npm scripts
  - Added Procfile for deployment platforms
  - Fixed TypeScript errors preventing proper bot initialization
  - Verified application startup sequence and port binding
- **Web Interface Removal**: Removed all web UI components per user request (August 9, 2025)
  - Deleted web.ts routes and HTML pages for wallet linking, payment claims, and landing page
  - Simplified Express server to only handle health checks, Telegram webhooks, and Helius webhooks
  - Bot now operates purely as a Telegram-only service without any web interface
  - Reduced dependencies and simplified codebase for better maintainability
- **Critical Payment System Fix**: Resolved service fee collection failure (August 9, 2025)
  - Fixed "insufficient funds for rent" error that prevented all payment transactions
  - Root cause: Admin service fee wallet had 0 SOL balance, couldn't receive transfers due to rent exemption requirements
  - Solution: Automatic admin wallet funding system that ensures rent exemption minimum (0.00089088 SOL)
  - Enhanced balance calculation to include potential admin wallet funding in total required amount
  - Added automatic recipient wallet funding for new users (0 balance wallets)
  - Confirmed working: Direct transfers successful with proper service fee collection
  - Receiver gets full amount specified, sender pays amount + fees + service fee + admin/recipient funding if needed
- **Payment Notification System**: Simplified emoji-only reaction system with one-reaction-per-payment limit (August 9, 2025)
  - Automatic payment notifications sent to recipients with transaction details and Solana Explorer link
  - Simplified interactive buttons: Only emoji reactions (❤️ Heart, 🔥 Fire)
  - One reaction per payment: Recipients can only react once, button becomes "✅ Reacted" after use
  - Reaction tracking: Database tracks reactionSent status to prevent multiple reactions
  - Reaction routing: Emoji reactions sent back to original payment sender with notification
  - Cross-context support: Notifications work for both group and DM payments
  - **Removed Features**: Custom thank you messages, GIFs, stickers, and auto-reply prompts removed for simplicity
  - **Telegram Compatibility**: Callback data within 64-byte limit using signature prefixes
  - **Database Integration**: Added reactionSent boolean field to Transaction model
  - **Clean User Experience**: Simple, focused reaction system without overwhelming options
- **Complete UI Facelift**: Modern, clean interface design with tasteful emoji usage (August 9, 2025)
  - Welcome messages redesigned with concise, clear language and minimal emojis
  - Home page streamlined with compact balance display and shortened wallet addresses
  - Payment confirmations redesigned with cleaner formatting and better visual hierarchy
  - Error messages standardized with consistent formatting and inline code styling
  - Success messages simplified with cleaner transaction receipts and reduced visual noise
  - Help documentation condensed with organized command sections and clearer instructions
  - Wallet creation/import messages enhanced with security warnings and clean address display
  - Balance displays improved with shortened address format and organized token listings
  - All UI text follows modern design principles: clean, concise, and user-focused
- **Case-Insensitive Username System**: Fixed Telegram username matching to be case-insensitive like Telegram itself (August 9, 2025)
  - Username parsing normalizes all @ mentions to lowercase during command processing
  - Database lookups use case-insensitive matching with Prisma's `mode: 'insensitive'` option
  - Username storage in database automatically converted to lowercase for consistency
  - Fixed issue where "@Vi100x" vs "@vi100x" would fail payment verification
  - All payment commands (/pay, /tip, /split) now work regardless of username case
  - Username verification system maintains security while allowing natural case variations
- **Giveaway Functionality Removal**: Completely removed all giveaway features per user request (August 9, 2025)
  - Deleted giveaway.ts command file and all related functions
  - Removed giveaway command registration from bot routing
  - Cleaned up giveaway parsing functions and interfaces from core modules
  - Removed giveaway parameters from transfer functions
  - Updated help documentation and welcome messages to remove giveaway references
  - Simplified bot to focus on core payment functionality: pay, tip, split, balance, withdraw
- **Bot Polling Conflict Resolution**: Fixed persistent 409 "multiple instances" error (August 10, 2025)
  - Root cause: grammY's built-in polling mechanism conflicting with unknown instances
  - Solution: Implemented manual polling using direct Telegram API calls to bypass grammY conflicts
  - Added comprehensive debug logging to track message updates and reply context detection
  - Bot now successfully starts and receives updates without 409 conflicts
  - Manual polling approach provides better control and debugging capabilities
- **Telegram Reply Detection Fixes**: Implemented comprehensive troubleshooting for "must reply" issues (August 10, 2025)
  - **Robust Reply Detection**: Added multi-path reply detection checking msg.reply_to_message, msg.message.reply_to_message, and ctx.msg.reply_to_message
  - **Tolerant Tip Handler**: Made tip command work with both replies AND @username mentions in all contexts
  - **Queue Flush Mechanism**: Added hard reset functionality to clear cached Telegram updates after privacy setting changes
  - **Enhanced Debug Tools**: Created debug commands (/debug_reply, /debug_reset, /debug_message) for troubleshooting
  - **Comprehensive Logging**: Added util.inspect with depth 6 for detailed update structure analysis
  - **Username Resolution**: Implemented database lookup for @username to Telegram ID mapping
  - **Admin Controls**: Added ADMIN_USER_IDS environment variable for secure debug command access
  - **Cross-Context Support**: Tip commands now work reliably in both groups and DMs with flexible recipient targeting
- **Complete Tip System Enhancement**: Added full confirmation and notification flow for tips (August 10, 2025)
  - **Tip Confirmations**: Added confirmation prompts showing amount, fees, and total before executing tips
  - **Recipient Notifications**: Recipients now receive notifications with tip details and interactive emoji reactions
  - **Transaction Receipts**: Successful tips generate formatted receipts with Solana Explorer links
  - **Error Handling**: Comprehensive error handling for failed tip confirmations and notifications
  - **Database Integration**: Tip transactions properly tracked with "awaiting_confirmation" and completion statuses
  - **Fee Transparency**: Clear breakdown of network fees and service fees in confirmation messages
  - **Cross-Platform Support**: Tip notifications work across group chats and direct messages