# CopyScalper

A high-performance copy trading bot for Hyperliquid DEX that automatically mirrors trades from a tracked wallet in real-time.

## Features

- **Real-time fill detection** via WebSocket (5-15x faster than polling)
- **Automatic trade execution** with intelligent position sizing
- **Smart order validation** - ensures all orders meet $10 minimum with proper rounding
- **Balance ratio scaling** - automatically scales positions based on portfolio size
- **5-minute balance caching** - reduces API calls while maintaining accuracy
- **Telegram notifications** for all trades and errors
- **Direct price matching** - uses tracked wallet's exact fill price for optimal execution
- **Support for mainnet and testnet**
- **Trade actions**: open, close, add, reduce, reverse positions

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
# Wallet to track and copy trades from (required)
TRACKED_WALLET=0x1234567890123456789012345678901234567890

# Your wallet address (required for execution)
USER_WALLET=0xabcdefabcdefabcdefabcdefabcdefabcdefabcd

# Your private key (required for automatic execution)
PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234

# Minimum order value in USD (default: 10)
MIN_ORDER_VALUE=10

# Use testnet (default: false)
IS_TESTNET=false

# Telegram notifications (optional)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

See `.env.example` for a template.

### Telegram Setup (Optional)

To receive position change notifications via Telegram:

**1. Create a bot:**
- Message [@BotFather](https://t.me/BotFather) on Telegram
- Send `/newbot` and follow the instructions
- Copy the bot token

**2. Get your Chat ID:**
- Message [@userinfobot](https://t.me/userinfobot) on Telegram
- Copy the chat ID (it's a number)

**3. Add to `.env`:**
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

**4. Available commands:**
- `/status` - View current monitoring statistics
- `/start` - Show help message

### Usage

**Start copy trading:**
```bash
npm start
```

The bot will:
1. Connect to Hyperliquid via WebSocket
2. Subscribe to the tracked wallet's fills in real-time
3. Automatically execute trades when the tracked wallet trades
4. Update balance ratios every 5 minutes

**Stop monitoring:**
Press `Ctrl+C` to stop gracefully

## Architecture

### Service Layer

The application is built with 5 core services:
- **HyperliquidService** - API integration, order execution, and position management
- **WebSocketFillsService** - Real-time fill detection via WebSocket
- **TradeHistoryService** - Trade action determination and position scaling
- **MetaCacheService** - Coin metadata caching (indices, decimals)
- **TelegramService** - Notifications and bot commands

#### HyperliquidService
Core service for interacting with Hyperliquid API.

**Key Methods:**
- `getOpenPositions(wallet)` - Fetch open positions
- `getAccountBalance(wallet)` - Get balance (withdrawable, marginUsed, accountValue)
- `openLong(coin, size, fillPrice)` / `openShort(coin, size, fillPrice)` - Place market buy/sell orders
- `closePosition(coin, fillPrice)` - Close entire position
- `reducePosition(coin, size, fillPrice)` - Partially close position
- `formatPrice(price, coin)` - Round to exchange tick size
- `formatSize(size, coin)` - Round to size decimals

**Features:**
- **Smart order validation** - Ensures orders meet $10 minimum, auto-adjusts size if needed
- **Direct price matching** - Uses tracked wallet's exact fill price for optimal execution
- **Automatic slippage** - 0.5% added to buy orders, subtracted from sell orders
- **Price validation without slippage** - Validates using base fill price to match API
- **Tick size detection** - Automatically determines correct price precision
- **IOC market orders** - Immediate-Or-Cancel for fast execution

#### WebSocketFillsService
Real-time fill detection via WebSocket subscription.

**How it works:**
- Subscribes to `userFills` WebSocket channel for the tracked wallet
- Receives fills instantly when the tracked wallet trades (10-50ms latency)
- Filters out duplicate fills using transaction ID (tid) caching
- Skips initial snapshot to avoid processing historical trades
- Calls callback function immediately when new fills arrive

**Benefits:**
- 5-15x faster than polling (no 500-700ms average wait time)
- Lower API usage (1 persistent connection vs 60 REST calls/minute)
- More reliable (no missed trades during network delays)

#### TradeHistoryService
Determines trade actions and scales position sizes based on balance ratio.

**Main method:**
```typescript
determineAction(fill): { action, side, size, reason } | null
```

**Action determination:**
- Analyzes the tracked wallet's fill (buy/sell, size, price)
- Compares to your current positions
- Calculates scaled size: `trackedSize * balanceRatio`
- Returns action: `open`, `close`, `add`, `reduce`, or `reverse`

**Balance scaling:**
- Uses total account value (not just withdrawable)
- Ratio = `yourAccountValue / trackedAccountValue`
- Updated every 5 minutes automatically
- Ensures proportional position sizing

#### MetaCacheService
Coin metadata caching with 1-hour auto-refresh.

**What it caches:**
- Coin index (for order placement)
- Size decimals (for position sizing)
- Coin names

**Refresh strategy:**
- Loads meta on initialization
- Auto-refreshes every 60 minutes
- Ensures data stays current

#### TelegramService
Sends notifications and handles bot commands.

**Features:**
- Real-time trade execution notifications
- Error notifications for failed trades
- `/status` command for monitoring stats
- `/start` command for help
- Auto-updates stats every 5 minutes

**Key Methods:**
- `sendMessage(text)` - Send custom message
- `sendMonitoringStarted(tracked, user)` - Send startup notification
- `sendError(error)` - Send error notification
- `updateStats(stats)` - Update monitoring statistics

**Optional:** Gracefully disabled if no token/chatId configured.

### Caching Strategy

**Fills Cache (Real-time WebSocket):**
- WebSocket subscription to `userFills` for tracked wallet
- Receives fills instantly when they occur (10-50ms)
- Caches processed transaction IDs to avoid duplicates
- Zero polling overhead

**Meta Cache (1-hour refresh):**
- Loads once on startup
- Auto-refreshes after 60 minutes
- Provides coin indices and size decimals
- Minimal API overhead

**Balance Ratio Cache (5-minute refresh):**
- Fetches account balances every 5 minutes
- Calculates ratio: `yourAccountValue / trackedAccountValue`
- Reduces API calls from 60/min to 12/hour
- Maintains accuracy without excessive polling

**Benefits:**
- 5-15x faster trade detection
- Minimal API rate limiting risk
- Near-instant trade execution (50-120ms total)
- Direct price matching from tracked wallet

## How It Works

### Startup Flow

**1. Load Configuration**
- Reads `.env` file
- Validates `TRACKED_WALLET` (required)
- Validates `USER_WALLET` and `PRIVATE_KEY` (required for execution)
- Loads `MIN_ORDER_VALUE` (default: $10)
- Loads `IS_TESTNET` setting

**2. Initialize Services**
- `HyperliquidService` connects to Hyperliquid API
- `MetaCacheService` loads coin metadata
- `TelegramService` starts bot (if configured)

**3. Display Startup Info**
```
🚀 Copy Trading Bot Started

📊 Tracked Wallet: 0xd477...6e7e
👤 Your Wallet: 0x742d...0bEb
⚡ Mode: Real-time WebSocket (Balance updates every 5min)
```

**4. Initial Balance Fetch**
- Fetches tracked wallet balance (accountValue, withdrawable, marginUsed)
- Fetches your wallet balance
- Calculates balance ratio: `yourAccountValue / trackedAccountValue`
- Displays initial state with balance ratio

**5. WebSocket Subscription**
- Subscribes to tracked wallet's `userFills` channel
- Receives fills in real-time (10-50ms latency)
- Starts listening for trades

**6. Ready State**
```
✅ Monitoring started - watching for trades...
✓ Real-time WebSocket monitoring active
```

### Trade Execution Flow

When the tracked wallet executes a trade:

**1. Fill Received (10-50ms)**
```
[20:08:28] 🔔 NEW TRADE DETECTED (WebSocket)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Tracked Wallet: ADD LONG STRK
   Size: 1814.1000 @ $0.2025

💡 YOUR ACTION:
   ADD LONG 24.0039 STRK
   Tracked wallet increased LONG position in STRK by 1814.1000 @ $0.20.
```

**2. Action Determination**
- Analyzes the fill (buy/sell, size, coin)
- Compares to your current positions
- Determines action: `open`, `close`, `add`, `reduce`, or `reverse`
- Calculates your size: `trackedSize * balanceRatio`

**3. Price & Validation**
```
Using fill price: $0.2025
Order price with slippage: $0.203193 (0.5% added)
Validation against base fill price: $0.2025
Calculated value: 24.0 × $0.2025 = $4.86
ADJUSTED: 49.3 × $0.2025 = $9.98
```

- Uses tracked wallet's exact fill price
- Adds 0.5% slippage for execution
- Validates order value using **base fill price** (without slippage)
- If below $10 minimum, rounds size **up** using Math.ceil

**4. Order Execution (60-250ms)**
```
⚠️  Adjusted BUY order size to meet $10 minimum:
    24.0 → 49.3 STRK
    Order value: $4.86 → $9.99

✓ Executed: ADDED 49.3 STRK
```

**5. Telegram Notification (if enabled)**
```
✅ Trade Executed

Coin: STRK
Action: ADD LONG
Size: 49.3
Price: $0.2025

Tracked wallet increased LONG position in STRK by 1814.1000 @ $0.20.
```

**Total time: 50-120ms** from fill detection to order placement

### Balance Updates

Every 5 minutes:
```
[20:15:00] ✓ Balance updated - WebSocket monitoring active

💰 Balance Update [20:15:00]
  Tracked Account: $25,431.50
  Your Account: $12,000.00
  Balance Ratio: 1:0.4718 (+2.3%)
  Your Positions: 3
```

- Fetches fresh account balances
- Recalculates balance ratio
- Updates position sizing for future trades
- Shows ratio change percentage

### Position Scaling

All trades are automatically scaled to match your portfolio size.

**Balance Ratio Calculation:**
```typescript
balanceRatio = yourAccountValue / trackedAccountValue
```

**Position Sizing:**
```typescript
yourSize = trackedSize * balanceRatio
```

**Example:**
```
Tracked wallet: Buys 1000 STRK
Your account value: $12,000
Their account value: $25,431
Balance ratio: 0.4718

Your trade: Buy 471.8 STRK (scaled)
```

**Why account value (not withdrawable)?**
- Includes total portfolio value (equity + margin)
- More accurate for portfolio percentage matching
- Reflects actual capital allocation
- Updates every 5 minutes

## Configuration Reference

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TRACKED_WALLET` | Yes | Wallet address to copy trades from | `0x1234...5678` |
| `USER_WALLET` | Yes | Your wallet address | `0xabcd...ef01` |
| `PRIVATE_KEY` | Yes | Your private key for trade execution | `0x1234...` |
| `MIN_ORDER_VALUE` | No | Minimum order value in USD (default: 10) | `10` |
| `IS_TESTNET` | No | Use Hyperliquid testnet (default: false) | `false` |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token from @BotFather | `123456789:ABC...` |
| `TELEGRAM_CHAT_ID` | No | Your Telegram chat ID from @userinfobot | `123456789` |

## Example Output

### Initial Startup
```
🚀 Copy Trading Bot Started

📊 Tracked Wallet: 0xd477...6e7e
👤 Your Wallet: 0x742d...0bEb
⚡ Mode: Real-time WebSocket (Balance updates every 5min)

✓ Loaded 500 tick sizes from cache
✓ Meta cache initialized with 247 coins
✓ Telegram notifications enabled

💰 Balance Update [14:30:12]
  Tracked Account: $25,431.50
  Your Account: $12,000.00
  Balance Ratio: 1:0.4718
  Your Positions: 3

✅ Monitoring started - watching for trades...
✓ WebSocket fills subscription initialized for 0xd477...6e7e
✓ Real-time WebSocket monitoring active
```

### Trade Execution - Open Position
```
[14:35:22] 🔔 NEW TRADE DETECTED (WebSocket)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Tracked Wallet: OPEN LONG AVAX
   Size: 500.0000 @ $38.25

💡 YOUR ACTION:
   OPEN LONG 235.9000 AVAX
   Tracked wallet opened new LONG position in AVAX.

   ✓ Executed: OPENED LONG 235.9000 AVAX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Trade Execution - Add to Position (Below $10 Adjusted)
```
[14:42:15] 🔔 NEW TRADE DETECTED (WebSocket)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Tracked Wallet: ADD LONG STRK
   Size: 1814.1000 @ $0.2025

💡 YOUR ACTION:
   ADD LONG 24.0039 STRK
   Tracked wallet increased LONG position in STRK by 1814.1000 @ $0.20.

   ⚠️  Adjusted STRK: 24.0 → 49.3 ($4.86 → $9.99)

   ✓ Executed: ADDED 49.3000 STRK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Trade Execution - Reverse Position
```
[15:10:03] 🔔 NEW TRADE DETECTED (WebSocket)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Tracked Wallet: REVERSE SHORT BTC
   Size: 2.0000 @ $45,100.00

💡 YOUR ACTION:
   REVERSE SHORT 0.9436 BTC
   Tracked wallet reversed from LONG to SHORT.

   ✓ Closed old position
   ✓ Executed: OPENED new SHORT 0.9436 BTC

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Balance Update (Every 5 Minutes)
```
[15:15:00] ✓ Balance updated - WebSocket monitoring active

💰 Balance Update [15:15:00]
  Tracked Account: $26,123.45
  Your Account: $12,450.30
  Balance Ratio: 1:0.4767 (+1.0%)
  Your Positions: 4
```

## Telegram Notifications

When Telegram is configured, you'll receive real-time notifications for all trade executions and errors.

### Notification Types

**Trade Executed:**
```
✅ Trade Executed

Coin: AVAX
Action: OPEN LONG
Size: 235.9
Price: $38.25

Tracked wallet opened new LONG position in AVAX.
```

**Trade Execution with Adjustment:**
```
✅ Trade Executed

Coin: STRK
Action: ADD LONG
Size: 49.3
Price: $0.2025

⚠️  Order size adjusted from 24.0 to 49.3 to meet $10 minimum

Tracked wallet increased LONG position in STRK by 1814.1000 @ $0.20.
```

**Trade Execution Failed:**
```
❌ Trade Execution Failed

Coin: BTC
Error: Cannot process API request: Insufficient margin

Please check your account and try again.
```

### Status Command

Use `/status` in your Telegram bot to view current monitoring statistics:

```
📊 Monitoring Status

Tracked Wallet: 0xd477...e7e
Positions: 3
Balance: $25,431.50

Your Wallet: 0x742d...0bEb
Positions: 4
Balance: $12,450.30
Balance Ratio: 1:0.4767

Uptime: 2h 15m
Last trade: 5m ago
```

### Error Notifications

You'll also receive notifications when system errors occur:

```
❌ Error

WebSocket connection lost. Reconnecting...
```

```
❌ Error

Failed to fetch balance: Network timeout
```

## Development

### Build
```bash
npm run build
```

### Project Structure
```
src/
├── config/              # Environment configuration
│   └── index.ts
├── models/              # TypeScript interfaces
│   ├── position.model.ts
│   ├── order.model.ts
│   ├── balance.model.ts
│   └── ohlc.model.ts
├── services/            # Core business logic
│   ├── hyperliquid.service.ts      # API integration, order execution
│   ├── websocket-fills.service.ts  # Real-time fill detection
│   ├── trade-history.service.ts    # Action determination
│   ├── meta-cache.service.ts       # Metadata caching
│   └── telegram.service.ts         # Notifications
├── utils/               # Helper functions
│   ├── order-validation.utils.ts   # $10 minimum validation
│   └── scaling.utils.ts             # Balance ratio calculation
├── setup.ts            # WebSocket polyfill
└── monitor.ts          # Main application entry point
```

## License

ISC
