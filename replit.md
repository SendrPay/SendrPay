# SendrPay (@SendrPayBot)

## Overview
SendrPay is a production-ready Telegram bot that facilitates Solana blockchain payments within Telegram groups and direct messages. Its core purpose is to simplify cryptocurrency transactions, making them accessible and user-friendly. Key capabilities include custodial wallet management with private key import, support for multiple SPL tokens (SOL, USDC, BONK, JUP), and functionalities for payments, tipping, and escrow. All transactions are processed on the Solana devnet, leveraging Helius RPC infrastructure. The vision is to enable seamless, secure, and integrated crypto payments directly within the Telegram ecosystem.

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
- **Notifications**: Standardized message templates for all bot interactions, including payment, tip, deposit, withdrawal, and history, with consistent formatting across group chats and DMs. Includes simplified emoji-only reaction system for payment notifications.
- **UI/UX**: Modern, clean interface design with concise language and consistent formatting for welcome messages, balance displays, payment confirmations, error messages, and help documentation.

## External Dependencies

### Blockchain Infrastructure
- **Helius API**: RPC provider, webhook services, transaction broadcasting.
- **Solana Web3.js**: Blockchain interaction and transaction construction.
- **SPL Token Library**: Token account management and transfers.

### Communication Platform
- **Telegram Bot API**: Message handling, inline keyboards, user interaction.
- **grammY Framework**: Bot framework with session management and middleware support.

### Development & Deployment
- **Prisma ORM**: Database schema management and query building.
- **Express.js**: HTTP server for webhooks and health checks.
- **Pino Logger**: Structured logging.

### Cryptography & Security
- **Node.js Crypto Module**: AES-GCM encryption and HMAC verification.
- **BS58 Encoding**: Solana address and key encoding/decoding.
- **UUID Library**: Unique identifier generation.