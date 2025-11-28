# CopyScalper

A high-performance copy trading bot for Hyperliquid DEX with real-time dashboard.

![Dashboard](screenshot.png)

## Features

- **Real-time copy trading** via WebSocket fill detection
- **Multi-account support** with independent tracking
- **Smart position sizing** based on balance ratios
- **Position drift sync** to maintain alignment with tracked wallets
- **Web dashboard** with live metrics, charts, and activity heatmap
- **Telegram notifications** (optional)

## Quick Start

```bash
npm install
cp accounts.example.json accounts.json  # Configure your accounts
npm start
```

## Configuration

Edit `accounts.json`:

```json
{
  "privateKey": "0x...",
  "accounts": [
    {
      "id": "main",
      "name": "Main Account",
      "trackedWallet": "0x...",
      "userWallet": "0x...",
      "enabled": true
    },
    {
      "id": "sub1",
      "name": "Subaccount 1",
      "trackedWallet": "0x...",
      "userWallet": "0x...",
      "vaultAddress": "0x...",
      "enabled": true
    }
  ]
}
```

## Dashboard

Access at `http://localhost:3000` - includes:
- Combined balance history across accounts
- Real-time P&L tracking (realized/unrealized)
- Position allocation pie charts
- 24h trading activity heatmap
- Risk metrics (margin, drawdown, leverage)

## License

ISC
