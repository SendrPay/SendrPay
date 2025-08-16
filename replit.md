# SendrPay

## Overview
SendrPay is a production-ready multi-platform bot designed to facilitate Solana blockchain payments within Telegram and Discord. Its primary purpose is to simplify cryptocurrency transactions, making them accessible and user-friendly across platforms. Key capabilities include custodial wallet management, support for multiple SPL tokens (SOL, USDC, BONK, JUP), cross-platform account linking, and functionalities for payments, tipping, and escrow. All transactions are processed on the Solana devnet, leveraging Helius RPC infrastructure. The project envisions a simplified, unified cryptocurrency transaction experience for users on their preferred messaging platforms.

## User Preferences
Preferred communication style: Simple, everyday language.
Data handling: All data must be live and accurate - never use mock, placeholder, or fake data.

## System Architecture

### Backend Architecture
- **Framework**: Node.js with TypeScript using grammY (Telegram) and Discord.js (Discord).
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
- **Transaction Handling**: Direct blockchain transactions with fee calculation and an escrow system. Automatic admin wallet funding ensures rent exemption for fee collection, and recipient wallet funding for new users.

### Security Architecture
- **Rate Limiting**: Token bucket algorithm.
- **Input Validation**: Zod schemas for comprehensive validation.
- **Webhook Security**: HMAC signature verification for Helius webhooks.
- **Key Management**: Encrypted private key storage.
- **Idempotency**: Transaction deduplication using client intent IDs.
- **Authentication**: Telegram user ID-based authentication.
- **Authorization**: Admin-controlled bot whitelisting per group and role-based access; sender-only payment confirmation controls to prevent griefing.

### Feature Architecture
- **Payment System**: Direct transfers with in-kind fee deduction and escrow. Payments support both group and direct messages, including explicit cross-platform targeting. Username verification is strict and case-insensitive.
- **Fee System**: Configurable basis points with per-token minimum fees.
- **Escrow System**: Temporary fund holding for users without linked wallets.
- **Onboarding System**: Three-option setup flow for new users: custodial wallet generation, private key import, or cross-platform account linking with secure expiring codes. Wallet selection feature for users with existing wallets on both platforms.
- **Notifications**: Standardized message templates for all bot interactions with consistent formatting and simplified emoji-only reaction system for payment notifications.
- **UI/UX**: Modern, clean interface design with concise language and consistent formatting for welcome messages, balance displays, payment confirmations, error messages, and help documentation. Rich embeds and interactive buttons for Discord.
- **Cross-Platform Account Linking**: Users can link their Discord and Telegram accounts via secure link codes to share one wallet across both platforms, enabling cross-platform payments and unified balance management. Support for platform-specific usernames.

## External Dependencies

### Blockchain Infrastructure
- **Helius API**: RPC provider, webhook services, transaction broadcasting.
- **Solana Web3.js**: Blockchain interaction and transaction construction.
- **SPL Token Library**: Token account management and transfers.

### Communication Platforms
- **Telegram Bot API**: Message handling, inline keyboards, user interaction.
- **Discord.js v14**: Discord bot framework with slash commands and button interactions.
- **grammY Framework**: Telegram bot framework with session management and middleware support.

### Development & Deployment
- **Prisma ORM**: Database schema management and query building.
- **Express.js**: HTTP server for webhooks and health checks.
- **Pino Logger**: Structured logging.

### Cryptography & Security
- **Node.js Crypto Module**: AES-GCM encryption and HMAC verification.
- **BS58 Encoding**: Solana address and key encoding/decoding.
- **UUID Library**: Unique identifier generation.