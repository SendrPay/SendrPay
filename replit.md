# SendrPay Telegram Bot

## Overview
SendrPay is a multi-platform blockchain payment bot for seamless crypto transactions on the Solana devnet, integrating with Telegram and Discord. It provides advanced cross-platform user management, wallet linking, and features for Key Opinion Leader (KOL) monetization, including paid group access with subscription models and content monetization. The project aims to enable easy crypto payments and monetization within messaging platforms.

## Recent Changes (August 18, 2025)
- Fixed KOL setup inline button functionality - `/kol_setup` command now properly routes to the correct handler
- Added recurring subscription system for KOL group access with weekly/monthly/quarterly/yearly billing cycles  
- Enhanced database schema with KolSettings subscription fields and new Subscription model
- Updated callback handler registration to support subscription management buttons
- Improved KOL setup interface with subscription type selection and billing cycle configuration

## User Preferences
- Clear, concise communication without technical jargon
- Step-by-step explanations for complex features
- Proactive error handling with user-friendly messages

## System Architecture

### Core Components
The bot's infrastructure is built with TypeScript, leveraging Grammy for Telegram bot functionality. PostgreSQL with Prisma ORM handles database operations. Solana devnet is integrated via the Helius API for blockchain interactions. Private key security is ensured through AES-GCM encryption for custodial wallets. Communication uses webhook-based methods for both Discord and Telegram.

### UI/UX Decisions
The system emphasizes an intuitive, button-driven inline interface for all features, including wallet management, KOL tools, and content creation. Interactive elements like dynamic tip buttons, content preview systems, and detailed pricing breakdowns are designed for enhanced user experience and transparency. Payment flows prioritize private direct messages (DM) for security and to preserve channel message integrity.

### Technical Implementations
- **Payment Processing**: Comprehensive payment flow with platform fee deduction (2% for tips, 5% for group access). Payments are sent to verified wallet addresses, not Telegram IDs, and handle rent exemption. Transaction details are embedded in callback buttons for session persistence.
- **KOL Monetization**:
    - **Group Join**: Secure processing of payments for group access, generating single-use invite links after confirmation. Now supports both one-time payments and recurring subscriptions.
    - **Recurring Subscriptions**: KOLs can set up subscription-based group access with billing cycles (weekly/monthly/quarterly/yearly). Database tracks subscription status, billing dates, and failed payments.
    - **Channel Posting**: `/kol_post` command allows KOLs to create and post interactive group join messages to channels or groups.
    - **Content Monetization**: Supports paywalled content (`/paywall_setup`, `/create_post`), including mixed media (text, images, video) with smart descriptions.
- **Wallet Management**: Features include balance checks, sending, tipping, withdrawing, depositing, and transaction history.
- **Security**: Custodial wallets with AES-GCM encrypted private keys, rate limiting, on-chain transaction validation, single-use group invites, and DM-based private payment processing. User authentication is based on Telegram ID.
- **Command Structure**: Distinct commands (`/kol_setup`, `/kol_post`, `/paywall_setup`, `/create_post`, `/interface`) are used to prevent workflow conflicts, complemented by a full inline button interface.

### Feature Specifications
- **KOL Settings**: KOLs can configure accepted tokens (SOL, USDC, BONK, JUP), set group access pricing, choose between one-time or recurring subscription models, set billing cycles, and link private groups.
- **Subscription Management**: Database models track user subscriptions, billing cycles, payment status, and automatic renewal handling for recurring group access.
- **Platform Fees**: Automatically collected and sent to a designated treasury wallet.
- **User Commands**: `/start`, `/pay`, `/tip`, `/balance`, `/withdraw`, `/deposit`, `/history`.
- **KOL Commands**: `/kol_setup`, `/kol [@username]`, `/kol_post`, `/linkgroup`, `/unlinkgroup`.
- **Admin Commands**: `/enable`, `/settings`, `/admin`.

## External Dependencies
- **Blockchain**: Solana devnet (via Helius API)
- **Database**: PostgreSQL (with Prisma ORM)
- **APIs**: Telegram Bot API, Helius API
- **Others**: Discord (for webhook-based communication)