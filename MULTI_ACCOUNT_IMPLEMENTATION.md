# Multi-Subaccount Copy Trading Bot Implementation Plan

## Overview

Extend the copy trading bot to support 4-10 subaccounts within a single process, with:
- Single Telegram bot with account selector UI
- Dashboard with Summary tab + individual account tabs
- JSON configuration file for subaccount definitions

## Configuration

### accounts.json Structure

```json
{
  "privateKey": "0x...",
  "isTestnet": false,
  "globalMinOrderValue": 11,
  "globalDriftThresholdPercent": 1,
  "telegram": {
    "botToken": "...",
    "chatId": "...",
    "polling": true
  },
  "dashboardPort": 3000,
  "accounts": [
    {
      "id": "main",
      "name": "Main Account",
      "trackedWallet": "0x...",
      "userWallet": "0x...",
      "vaultAddress": "0x...",
      "enabled": true
    }
  ]
}
```

## Architecture Changes

### New Models

**`src/models/account.model.ts`**
- `SubAccountConfig`: id, name, trackedWallet, userWallet, vaultAddress, enabled, minOrderValue?, driftThresholdPercent?
- `MultiAccountConfig`: privateKey, isTestnet, accounts[], telegram, dashboardPort, globalMinOrderValue, globalDriftThresholdPercent

### Service Architecture

```
AccountManager (new)
  |
  +-- TrackedWalletManager (new) - one WebSocket pool per unique tracked wallet
  |     +-- Map<trackedWallet, { pool, fillQueue, subscribers[] }>
  |
  +-- AccountContext[] (one per subaccount)
        +-- FillProcessorService (refactored - accepts account context)
        +-- BalanceMonitorService (refactored - accepts account context)
        +-- LoggerService (refactored - per-account data dir)
        +-- SyncService, DriftDetector, RiskMonitor
```

**Shared Services:**
- HyperliquidService (single instance, methods accept vaultAddress param)
- TelegramService (single instance, aggregates all accounts)

## Implementation Phases

### Phase 1: Models and Config

1. Create `src/models/account.model.ts` with interfaces
2. Create `src/config/accounts.config.ts` - loads accounts.json
3. Create `accounts.json` template file
4. Update `src/config/index.ts` to use new config loader

**Files:**
- `v2/src/models/account.model.ts` (new)
- `v2/src/config/accounts.config.ts` (new)
- `v2/accounts.json` (new)
- `v2/src/config/index.ts` (modify)

### Phase 2: Core Service Refactoring

1. **HyperliquidService** - Add vaultAddress parameter to order methods:
   - `openLong(coin, size, price, vaultAddress?)`
   - `closePosition(coin, price, userWallet, vaultAddress?)`
   - etc.

2. **LoggerService** - Accept accountId in constructor, write to `data/{accountId}/`

3. **TrackedWalletManager** (new) - Manages WebSocket pools per tracked wallet:
   - `subscribeAccount(trackedWallet, accountId, fillHandler)`
   - `unsubscribeAccount(trackedWallet, accountId)`
   - Deduplicates pools when multiple accounts track same wallet

**Files:**
- `v2/src/services/hyperliquid.service.ts` (modify)
- `v2/src/services/logger.service.ts` (modify)
- `v2/src/services/tracked-wallet-manager.service.ts` (new)

### Phase 3: Per-Account Services

1. **FillProcessorService** - Refactor constructor:
   ```typescript
   constructor(accountId, userWallet, vaultAddress, hyperliquidService, loggerService, telegramService)
   ```

2. **BalanceMonitorService** - Refactor constructor:
   ```typescript
   constructor(accountId, trackedWallet, userWallet, ...)
   ```

3. **FillQueueService** - Add multi-subscriber pattern:
   - `addSubscriber(accountId, processor)`
   - Broadcast fills to all subscribers

4. **SyncService, RiskMonitorService** - Accept account context

**Files:**
- `v2/src/services/fill-processor.service.ts` (modify)
- `v2/src/services/balance-monitor.service.ts` (modify)
- `v2/src/services/fill-queue.service.ts` (modify)
- `v2/src/services/sync.service.ts` (modify)
- `v2/src/services/risk-monitor.service.ts` (modify)

### Phase 4: Telegram Multi-Account UI

1. **State Management:**
   - `accountStates: Map<string, SubaccountState>` (per-account trading state)
   - `selectedAccountId: string | null` (current UI context)

2. **Commands:**
   - `/status` - Global dashboard (all accounts summary)
   - `/status <name>` - Specific account status
   - `/menu` - Account selector
   - `/accounts` - List all accounts

3. **Menu Structure:**
   ```
   /menu -> Account Selector -> Account Control Panel -> Actions
   ```

4. **Callback Data Pattern:** `{action}:{accountId}:{params}`
   - `sel:sub1`, `pause:sub1`, `close:BTC:100:sub1`

5. **Alerts:** Prefix with `[ACCOUNT_NAME]`

**Files:**
- `v2/src/services/telegram.service.ts` (major refactor)

### Phase 5: Dashboard Frontend

1. **Tab Navigation:**
   - Add tab container below header
   - Buttons for Summary + each account
   - Dropdown for mobile (>5 accounts)

2. **Summary View:**
   - Combined balance history (stacked area chart)
   - Account balance distribution chart
   - Account overview table (balance, PnL, positions per account)
   - Aggregated stats cards

3. **Account View:**
   - Existing dashboard filtered to selected account
   - Same charts/tables but account-specific data

**Files:**
- `v2/frontend/index.html` (modify - add tabs, summary view)

### Phase 6: Dashboard API

1. **New Endpoints:**
   - `GET /api/accounts` - List all accounts
   - `GET /api/summary?date=YYYY-MM-DD` - Aggregated data
   - `GET /api/balance-history/combined?days=10` - Combined history

2. **Modified Endpoints** (add `account` query param):
   - `/api/snapshots?account=main&date=...`
   - `/api/trades?account=main&date=...`
   - `/api/balance-history?account=main&days=10`

3. **Helper Functions:**
   - `getAccountDataDir(accountId)` - Returns data path for account
   - `getAccountList()` - Returns all configured accounts

**Files:**
- `v2/src/api/server.ts` (modify)

### Phase 7: Entry Point Rewrite

Rewrite `index.ts` with AccountManager pattern:

```typescript
async function main() {
  const config = loadMultiAccountConfig()
  const hyperliquidService = new HyperliquidService(config)
  const telegramService = new TelegramService(config.telegram)
  const trackedWalletManager = new TrackedWalletManager()

  for (const accountConfig of config.accounts.filter(a => a.enabled)) {
    await initializeAccount(accountConfig, ...)
  }

  startServer(accountContexts)
  startBalanceMonitors()
}
```

**Files:**
- `v2/src/index.ts` (major rewrite)

## Data Directory Structure

```
v2/data/
  main/
    snapshots-2025-11-27.jsonl
    trades-2025-11-27.jsonl
    tracked-fills-2025-11-27.jsonl
  sub1/
    snapshots-2025-11-27.jsonl
    ...
  sub2/
    ...
```

## Critical Files Summary

| File | Change Type |
|------|-------------|
| `src/models/account.model.ts` | New |
| `src/config/accounts.config.ts` | New |
| `src/services/tracked-wallet-manager.service.ts` | New |
| `accounts.json` | New |
| `src/index.ts` | Major rewrite |
| `src/services/telegram.service.ts` | Major refactor |
| `src/api/server.ts` | Moderate changes |
| `frontend/index.html` | Moderate changes |
| `src/services/hyperliquid.service.ts` | Minor changes |
| `src/services/logger.service.ts` | Minor changes |
| `src/services/fill-processor.service.ts` | Constructor refactor |
| `src/services/balance-monitor.service.ts` | Constructor refactor |
| `src/services/fill-queue.service.ts` | Add multi-subscriber |
| `src/services/sync.service.ts` | Constructor refactor |
| `src/services/risk-monitor.service.ts` | Constructor refactor |
| `src/config/index.ts` | Use new config loader |

## Implementation Order

1. Phase 1: Models and Config (foundation)
2. Phase 2: Core Service Refactoring (enables multi-account)
3. Phase 3: Per-Account Services (service instances)
4. Phase 7: Entry Point Rewrite (wire everything together)
5. Phase 4: Telegram Multi-Account UI
6. Phase 5 & 6: Dashboard (frontend + API)

This order ensures the core architecture is solid before adding UI layers.
