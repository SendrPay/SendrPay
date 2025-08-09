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
- **Payment Notification System**: Comprehensive recipient notification with reactions and thank you features (August 9, 2025)
  - Automatic payment notifications sent to recipients with transaction details and Solana Explorer link
  - Interactive inline buttons: Heart reaction (❤️), Fire reaction (🔥), Thank you message, and GIF/sticker sending
  - Thank you message system: Recipients can send custom messages or GIFs/stickers back to senders
  - Transaction tracking: All payments recorded in database for notification lookup and thank you routing
  - Secure callback handling: Reaction and thank you callbacks properly validated and routed
  - Cross-context support: Notifications work for both group and DM payments
  - Enhanced user experience: Recipients feel acknowledged and can express gratitude easily