# CopyScalper

A terminal-based copy trading application for Hyperliquid DEX that monitors wallet positions in real-time and provides intelligent trade recommendations.

## Features

- Real-time position monitoring via WebSocket
- "Clean slate" copy trading - only tracks NEW positions after monitoring starts
- Automatic position sizing based on account balance ratio
- Action-based recommendations (open, close, add, reduce, reverse)
- Telegram notifications for all position changes
- `/status` command to check monitoring stats via Telegram
- Cached market data for optimal performance
- Support for both mainnet and testnet

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

# Your wallet address (optional - needed for recommendations)
USER_WALLET=0xabcdefabcdefabcdefabcdefabcdefabcdefabcd

# Your private key (optional - needed for automatic execution)
PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234

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

**Start monitoring:**
```bash
npm start
```

**Custom polling interval:**
```bash
npm start -- --interval=5000
```

**One-time comparison:**
```bash
npm run compare
```

## Architecture

### Service Layer

The application is built with 8 core services:
- **HyperliquidService** - API integration and trading
- **MidsCacheService** - Real-time price caching
- **MetaCacheService** - Coin metadata caching
- **MonitoringService** - Position change detection
- **IgnoreListService** - Pre-existing position tracking
- **ActionCopyService** - Copy trading logic
- **TradeExecutionService** - Order execution
- **TelegramService** - Notifications and bot commands

#### HyperliquidService
Core service for interacting with Hyperliquid API.

**Key Methods:**
- `getOpenPositions(wallet)` - Fetch open positions for any wallet
- `getAccountBalance(wallet)` - Get withdrawable balance
- `openLong(coin, size)` / `openShort(coin, size)` - Market orders
- `closePosition(coin, size?)` - Close or reduce positions
- `formatPrice(price, coin)` - Round to tick size
- `formatSize(size, coin)` - Round to size decimals

**Features:**
- Integrated caching (mids + meta)
- Automatic price slippage (0.5%)
- Tick size detection from orderbook
- Market orders via IOC (Immediate-Or-Cancel)

#### MidsCacheService
Real-time price caching via WebSocket subscription.

**How it works:**
- Subscribes to `allMids` WebSocket channel on startup
- Updates a Map of coin → mid price in real-time
- Used by `getMarketPrice()` for fast price lookups
- Eliminates need for repeated L2 orderbook API calls

**Lifecycle:**
- `initialize()` - Connects WebSocket and subscribes
- `getMid(coin)` - Returns cached price or null
- `close()` - Unsubscribes and cleans up

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

#### MonitoringService
Position snapshot and change detection.

**Methods:**
- `createSnapshot(positions, balance)` - Captures current state
- `detectChanges(snapshot)` - Compares with previous snapshot

**Change types detected:**
- `opened` - New position appeared
- `closed` - Position fully closed
- `increased` - Position size grew
- `decreased` - Position size shrunk
- `reversed` - Position flipped from long → short or short → long

**Detection logic:**
- Tracks positions by coin name
- ANY size change triggers detection (no threshold)
- Compares current vs previous snapshot on each poll

#### IgnoreListService
Manages the "clean slate" ignore list.

**Purpose:**
Tracks pre-existing positions that should NOT be copied, ensuring you only copy trades that happen AFTER monitoring starts.

**Methods:**
- `initialize(positions)` - Adds all current positions to ignore list
- `isIgnored(coin)` - Check if coin should be ignored
- `getIgnoredSide(coin)` - Get the ignored side (long/short)
- `removeFromIgnoreList(coin)` - Stop ignoring a coin

**Lifecycle:**
- On startup: All existing positions → ignore list
- On close: Remove from ignore list
- On reverse: Remove from ignore list, copy new side

#### ActionCopyService
Core copy trading logic with position scaling.

**Constructor:**
```typescript
new ActionCopyService(ignoreListService, balanceRatio)
```

**Main method:**
```typescript
getRecommendation(change: PositionChange, userPositions: Position[]): ActionRecommendation | null
```

**Recommendation logic:**

1. **If coin is IGNORED:**
   - Closed → Remove from ignore list, no action
   - Reversed → Remove from ignore list, recommend opening new side
   - Other changes → Show as ignored, no action

2. **If coin is NOT IGNORED:**
   - Compare tracked position vs your position
   - Calculate scaled size: `trackedSize * balanceRatio`
   - Return action: `open`, `close`, `add`, `reduce`, `reverse`

**Action types:**
- `open` - Open new position (you have none, they have one)
- `close` - Close position (you have one, they closed theirs)
- `add` - Increase position size
- `reduce` - Decrease position size
- `reverse` - Close current side and open opposite side

#### TradeExecutionService
Executes trade recommendations.

**Method:**
```typescript
executeRecommendation(recommendation: ActionRecommendation): Promise<ExecutionResult>
```

**Execution flow:**
- Maps recommendation action to HyperliquidService methods
- Handles all action types (open, close, add, reduce, reverse)
- Returns success/failure with order response

**Note:** Currently not wired up to auto-execute. Requires manual integration.

#### TelegramService
Sends notifications and handles bot commands.

**Features:**
- Real-time position change notifications
- `/status` command for monitoring stats
- `/start` command for help
- Error notifications
- Auto-updates stats after changes

**Constructor:**
```typescript
new TelegramService(botToken: string | null, chatId: string | null)
```

**Key Methods:**
- `sendPositionChange(change)` - Send position change notification
- `sendMonitoringStarted(tracked, user)` - Send startup message
- `sendError(error)` - Send error notification
- `updateStats(stats)` - Update current monitoring statistics

**Optional:** Gracefully disabled if no token/chatId configured.

### Caching Strategy

**Mids Cache (Real-time):**
- WebSocket subscription to `allMids` channel
- Updates continuously in background
- Zero API calls for price lookups
- Used for market order pricing

**Meta Cache (1-hour refresh):**
- Loads once on startup
- Auto-refreshes after 60 minutes
- Provides coin indices and size decimals
- Minimal API overhead

**Benefits:**
- Reduced API rate limiting risk
- Faster trade execution
- Lower latency
- Real-time price accuracy

## How It Works

### Startup Flow

**1. Load Configuration**
- Reads `.env` file
- Validates `TRACKED_WALLET` (required)
- Loads optional `USER_WALLET`, `PRIVATE_KEY`, `IS_TESTNET`

**2. Initialize Services**
- `HyperliquidService` connects to API
- `MidsCacheService` starts WebSocket subscription
- `MetaCacheService` loads coin metadata
- `TelegramService` starts bot (if configured)
- Logs: `✓ Mids cache initialized via WebSocket`
- Logs: `✓ Meta cache initialized with X coins`
- Logs: `✓ Telegram notifications enabled` (if configured)

**3. Display Header**
Shows monitoring setup:
```
========================================
  HYPERLIQUID COPY TRADING MONITOR
========================================
Tracked Wallet: 0x1234...5678
Your Wallet:    0xabcd...ef01
Poll Interval:  1000ms
========================================
```

**4. First Poll - Initial Snapshot**
- Fetches tracked wallet positions & balance
- Fetches your positions & balance (if USER_WALLET set)
- Calculates balance ratio: `yourBalance / trackedBalance`
- **Adds ALL current positions to ignore list**
- Displays initial state:
  ```
  📊 Initial snapshot captured
    Tracked Positions: 5
    Tracked Balance (withdrawable): $10000.00
    Your Positions: 3
    Your Balance (withdrawable): $5000.00
    Balance Ratio: 1:0.5000

  🚫 Ignore List Initialized
    • BTC LONG - will ignore until closed/reversed
    • ETH SHORT - will ignore until closed/reversed
  ```

**5. Monitoring Loop**
Polls every 1000ms (or custom interval):
- Fetch current positions and balances
- Create new snapshot
- Detect changes
- Display changes and recommendations
- Repeat

**No changes:**
```
[2024-01-15 14:30:45] ✓ No changes detected - monitoring...
```

**With changes:**
```
[2024-01-15 14:31:12] 📈 Position Change Detected

Position: SOL
Change: OPENED
Side: LONG
Size: 100.0
Entry Price: $95.50
Value: $9,550.00

💡 Trade Recommendation
Action: OPEN LONG
Coin: SOL
Size: 50.0 (scaled to your balance)
Estimated Value: $4,775.00
Reason: Tracked wallet opened new position
```

**6. Cleanup (Ctrl+C)**
- Closes WebSocket connections
- Clears caches
- Exits gracefully

### The "Clean Slate" Concept

**Problem:**
If you start monitoring when the tracked wallet already has positions open, how do you match their entry prices?

**Solution: Clean Slate Approach**

1. **On startup:** Add ALL existing positions to ignore list
2. **During monitoring:**
   - Ignore changes to pre-existing positions
   - Only copy NEW positions opened after monitoring starts
   - If ignored position closes → remove from ignore list
   - If ignored position reverses → remove from ignore, copy new side

**Benefits:**
- Perfect entry price matching (you enter when they enter)
- No guesswork about partial positions
- Action-based copying (copy ACTIONS not STATES)
- Eventually builds up to full portfolio mirror

**Example Flow:**

```
Startup:
  Tracked wallet has: BTC LONG 1.0
  → Add "BTC LONG" to ignore list

Later - BTC closes:
  Tracked wallet: BTC position closed
  → Remove "BTC" from ignore list
  → No action (don't close, you never had it)

Later - BTC reverses to SHORT:
  Tracked wallet: BTC SHORT 2.0
  → Remove "BTC" from ignore list
  → Recommend: OPEN SHORT 1.0 (scaled)

Later - New position opens:
  Tracked wallet: ETH LONG 50.0
  → Not ignored (new position!)
  → Recommend: OPEN LONG 25.0 (scaled)
```

### Position Scaling

All recommendations are automatically scaled to your account size.

**Balance Ratio:**
```typescript
balanceRatio = yourWithdrawableBalance / trackedWithdrawableBalance
```

**Examples:**
- Your balance: $5,000, Tracked: $10,000 → Ratio: 0.5
- Your balance: $20,000, Tracked: $10,000 → Ratio: 2.0

**Position Sizing:**
```typescript
yourSize = trackedSize * balanceRatio
```

**Example:**
```
Tracked wallet: Opens BTC LONG 1.0
Your balance: $5,000
Their balance: $10,000
Ratio: 0.5

Recommendation: Open BTC LONG 0.5
```

**Why withdrawable balance?**
- More conservative than account value
- Excludes unrealized PnL
- Represents actual trading capital available

## Configuration Reference

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TRACKED_WALLET` | Yes | Wallet address to copy trades from | `0x1234...5678` |
| `USER_WALLET` | No | Your wallet address (for recommendations) | `0xabcd...ef01` |
| `PRIVATE_KEY` | No | Your private key (for auto-execution) | `0x1234...` |
| `IS_TESTNET` | No | Use Hyperliquid testnet | `false` |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token from @BotFather | `123456789:ABC...` |
| `TELEGRAM_CHAT_ID` | No | Your Telegram chat ID from @userinfobot | `123456789` |

### CLI Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--interval=<ms>` | Custom polling interval (min: 1000ms) | `--interval=5000` |

## Modes

### Monitor Mode (default)
Continuous real-time monitoring with recommendations.

**Requirements:**
- `TRACKED_WALLET` in .env
- Optional: `USER_WALLET` for recommendations

**Run:**
```bash
npm start
```

### Compare Mode
One-time snapshot comparison.

**Requirements:**
- `TRACKED_WALLET` in .env
- Optional: `USER_WALLET` for comparison

**Run:**
```bash
npm run compare
```

**Output:**
- Account balances
- Balance ratio
- Position comparisons
- Trade recommendations (one-time)
- Detailed position views

## Example Output

### Initial Startup
```
========================================
  HYPERLIQUID COPY TRADING MONITOR
========================================
Tracked Wallet: 0xd47776750bf095ae3f0461e06ce312c2e6026e7e
Your Wallet:    0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Poll Interval:  1000ms
========================================

✓ Mids cache initialized via WebSocket
✓ Meta cache initialized with 247 coins
✓ Telegram notifications enabled

[2024-01-15 14:30:12] 📊 Initial snapshot captured
  Tracked Positions: 3
  Tracked Balance (withdrawable): $25,431.50
  Your Positions: 1
  Your Balance (withdrawable): $12,000.00
  Balance Ratio: 1:0.4718

🚫 Ignore List Initialized
  • BTC LONG - will ignore until closed/reversed
  • ETH SHORT - will ignore until closed/reversed
  • SOL LONG - will ignore until closed/reversed

[2024-01-15 14:30:13] ✓ No changes detected - monitoring...
```

### Position Opened
```
[2024-01-15 14:35:22] 📈 Position Change Detected

Position: AVAX
Change: OPENED
Side: LONG
Size: 500.0
Entry Price: $38.25
Value: $19,125.00

💡 Trade Recommendation
Action: OPEN LONG
Coin: AVAX
Size: 235.9 (scaled to your balance)
Estimated Value: $9,023.48
Reason: Tracked wallet opened new position
```

### Position Increased
```
[2024-01-15 14:42:15] 📈 Position Change Detected

Position: AVAX
Change: INCREASED
Side: LONG
Size Change: 500.0 → 750.0 (+250.0)
Value Change: $19,125.00 → $28,687.50

💡 Trade Recommendation
Action: ADD TO LONG
Coin: AVAX
Size: 117.95 (additional)
New Total: 353.85
Estimated Value: $13,535.21
Reason: Tracked wallet increased position
```

### Position Reversed (Ignored)
```
[2024-01-15 15:10:03] 🔄 Position Change Detected

Position: BTC
Change: REVERSED
Previous: LONG 1.0
Current: SHORT 2.0

💡 Trade Recommendation
Action: OPEN SHORT
Coin: BTC
Size: 0.9436 (scaled to your balance)
Estimated Value: $42,500.00
Reason: Tracked wallet reversed position (removed from ignore list)
```

## Telegram Notifications

When Telegram is configured, you'll receive real-time notifications for all position changes.

### Notification Types

**Position Opened:**
```
📈 Position OPENED

Coin: AVAX
Side: LONG
Size: 500.0
Entry Price: $38.25
Value: $19,125.00
```

**Position Closed:**
```
📉 Position CLOSED

Coin: BTC
Side: LONG
Size Closed: 1.5
Exit Price: $45,230.00
```

**Position Increased:**
```
⬆️ Position INCREASED

Coin: ETH
Side: LONG
Size Change: 10.0 → 15.0 (+5.0)
Price: $2,340.50
New Value: $35,107.50
```

**Position Decreased:**
```
⬇️ Position DECREASED

Coin: SOL
Side: SHORT
Size Change: 100.0 → 75.0 (-25.0)
Price: $95.30
New Value: $7,147.50
```

**Position Reversed:**
```
🔄 Position REVERSED

Coin: BTC
Previous: LONG 1.0
Current: SHORT 2.0
Price: $45,100.00
Value: $90,200.00
```

### Status Command

Use `/status` in your Telegram bot to view current monitoring statistics:

```
📊 Monitoring Status

Tracked Wallet: 0xd477...e7e
Positions: 3
Balance: $25,431.50

Your Wallet: 0x742d...0bEb
Positions: 1
Balance: $12,000.00
Balance Ratio: 1:0.4718

Ignored Positions: 3
  • BTC LONG
  • ETH SHORT
  • SOL LONG

Uptime: 2h 15m
```

### Error Notifications

You'll also receive notifications when errors occur:

```
❌ Error

Failed to fetch positions: Network timeout
```

## Development

### Build
```bash
npm run build
```

### Project Structure
```
src/
├── config/              # .env configuration
├── models/              # TypeScript interfaces
│   ├── position.model.ts
│   ├── order.model.ts
│   ├── balance.model.ts
│   ├── change.model.ts
│   └── comparison.model.ts
├── services/            # Core business logic
│   ├── hyperliquid.service.ts
│   ├── mids-cache.service.ts
│   ├── meta-cache.service.ts
│   ├── monitoring.service.ts
│   ├── ignore-list.service.ts
│   ├── action-copy.service.ts
│   ├── trade-execution.service.ts
│   ├── telegram.service.ts
│   └── copy-trading.service.ts
├── utils/               # Helper functions
│   ├── display.utils.ts
│   └── scaling.utils.ts
├── setup.ts            # WebSocket polyfill
├── monitor.ts          # Main monitoring app
└── index.ts            # Comparison mode

```

## License

ISC
