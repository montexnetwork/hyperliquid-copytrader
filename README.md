# CopyScalper

A high-performance copy trading bot for Hyperliquid DEX that automatically mirrors trades from a tracked wallet in real-time.

## Features

- **Real-time fill detection** via WebSocket
- **Automatic trade execution** with intelligent position sizing
- **Smart order validation** - ensures all orders meet $10 minimum
- **Balance ratio scaling** - automatically scales positions based on portfolio size
- **Direct price matching** - uses tracked wallet's exact fill price
- **Telegram notifications** (optional)

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file:

```env
# Required
TRACKED_WALLET=0x1234567890123456789012345678901234567890
USER_WALLET=0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234

# Optional
MIN_ORDER_VALUE=10
IS_TESTNET=false
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
```

### Usage

```bash
npm start
```

The bot will:
1. Connect to Hyperliquid via WebSocket
2. Subscribe to tracked wallet's fills in real-time
3. Automatically execute trades when tracked wallet trades
4. Update balance ratios every minute

Stop with `Ctrl+C`

## How It Works

### Position Scaling

All trades are automatically scaled to match your portfolio size:

```
Balance Ratio = Your Account Value / Tracked Account Value
Your Position Size = Tracked Position Size × Balance Ratio
```

**Example:**
- Tracked wallet buys 1000 STRK
- Your account: $12,000
- Their account: $25,431
- Balance ratio: 0.4718
- Your trade: Buy 471.8 STRK

### Smart Order Validation

- Ensures all orders meet $10 minimum value
- Auto-adjusts size if needed (rounds up using Math.ceil)
- Validates using base fill price (without slippage)
- Adds 0.5% slippage for execution

## Performance

**Execution time:** ~1.4s from fill detection to order placement
- Network latency to Hyperliquid: ~1.3-1.4s
- Code execution: ~10-50ms

**Tip:** For best performance, host near Tokyo, Japan (where Hyperliquid validators are located)

## Telegram Setup (Optional)

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy token
2. Message [@userinfobot](https://t.me/userinfobot) → copy chat ID
3. Add to `.env`

**Commands:**
- `/status` - View current monitoring statistics
- `/start` - Show help message

## Development

```bash
npm run build
```

## License

ISC
