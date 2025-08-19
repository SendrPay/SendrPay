# SendrPay Telegram Bot

## Overview
SendrPay is a multi-platform blockchain payment bot for seamless crypto transactions on the Solana devnet, integrating with Telegram and Discord. It provides advanced cross-platform user management, wallet linking, and features for Key Opinion Leader (KOL) monetization, including paid group access with subscription models and content monetization. The project aims to enable easy crypto payments and monetization within messaging platforms.

## Recent Changes (August 19, 2025)
- ✅ **Fixed Channel Setup Session Expiration Issue**: Resolved critical bug causing session timeouts during token selection
  - Fixed missing channel token callback handler registration in index.ts
  - Corrected session step validation from "configure_defaults" to "select_token"
  - Removed duplicate function declarations causing build failures
  - Channel token selection now works seamlessly without session expiration errors
- ✅ **Streamlined Channel Setup UX**: Removed unnecessary tip presets for paywalled content
  - Eliminated tip preset configuration step since users purchase content, not tip
  - Channel setup now completes directly after price setting
  - Simplified workflow: Channel verification → Token selection → Price setting → Complete
  - Enhanced success message with clear next steps for content creators
- ✅ **Fixed Critical Workflow Conflicts**: Resolved session state conflicts between different monetization features
  - Clear separation between Channel Setup (paywalled content) and Group Settings (private group access) 
  - Fixed session priority ordering: Post Creation → Channel Setup → Group Pricing → Other workflows
  - Added session clearing in command starts to prevent state persistence across workflows
  - Enhanced session validation requiring both flags and tokens for proper workflow identification
- ✅ **Channel Setup Database Fix**: Fixed "Failed to save channel configuration" error
  - Corrected error handling accessing session data after deletion
  - Added proper validation and error recovery for database operations
  - Improved user messaging with clear restart instructions
- ✅ **UI/UX Clarity Improvements**: Enhanced terminology and explanations
  - Updated "Group Settings" to "Private Group Access" for clarity
  - Added explanatory text distinguishing Channel paywalls vs Group access in all menus
  - Clear workflow separation messaging: Channel = Post paywalled content, Group = Paid group membership
- ✅ **Comprehensive Recurring Payments System**: Fully implemented subscription management for KOL group access
  - One-time vs recurring payment type selection in KOL setup interface
  - Billing cycle options: weekly, monthly, quarterly, yearly
  - Automatic payment processing with subscription manager running in background
  - Failed payment handling (3 attempts) with automatic group removal
  - Real-time payment notifications and subscription status updates
- ✅ **Previous Bug Fixes**: Enhanced error handling, fixed subscription toggles, resolved 15-second loading timeouts

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