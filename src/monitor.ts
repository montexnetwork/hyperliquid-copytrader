import './setup';
import { HyperliquidService } from './services/hyperliquid.service';
import { MonitoringService } from './services/monitoring.service';
import { IgnoreListService } from './services/ignore-list.service';
import { ActionCopyService } from './services/action-copy.service';
import { AccumulationTrackerService } from './services/accumulation-tracker.service';
import { TelegramService } from './services/telegram.service';
import type { Position } from './models';
import {
  displayPositionChange,
  displayActionRecommendation,
  displayMonitoringHeader,
  displayIgnoreListInit,
  formatTimestamp
} from './utils/display.utils';
import { calculateBalanceRatio } from './utils/scaling.utils';
import { loadConfig } from './config';

const DEFAULT_POLL_INTERVAL = 1000;

const monitorTrackedWallet = async (
  trackedWallet: string,
  userWallet: string | null,
  privateKey: string | null,
  pollInterval: number,
  isTestnet: boolean,
  telegramService: TelegramService
): Promise<void> => {
  const service = new HyperliquidService(privateKey, userWallet, isTestnet);
  await service.initialize();

  const monitoringService = new MonitoringService();
  const ignoreListService = new IgnoreListService();
  const accumulationTracker = new AccumulationTrackerService();
  const startTime = Date.now();

  let actionCopyService: ActionCopyService | null = null;
  let balanceRatio = 1;

  displayMonitoringHeader(trackedWallet, userWallet, pollInterval);

  if (telegramService.isEnabled()) {
    await telegramService.sendMonitoringStarted(trackedWallet, userWallet);
  }

  let isFirstRun = true;

  const poll = async (): Promise<void> => {
    try {
      const [trackedPositions, trackedBalance] = await Promise.all([
        service.getOpenPositions(trackedWallet),
        service.getAccountBalance(trackedWallet)
      ]);

      let userPositions: Position[] = [];
      let userBalance = null;

      if (userWallet) {
        [userPositions, userBalance] = await Promise.all([
          service.getOpenPositions(userWallet),
          service.getAccountBalance(userWallet)
        ]);

        balanceRatio = calculateBalanceRatio(
          parseFloat(userBalance.withdrawable),
          parseFloat(trackedBalance.withdrawable)
        );

        if (isFirstRun) {
          actionCopyService = new ActionCopyService(ignoreListService, accumulationTracker, balanceRatio);
        }
      }

      const snapshot = monitoringService.createSnapshot(
        trackedPositions,
        parseFloat(trackedBalance.withdrawable)
      );

      const changes = monitoringService.detectChanges(snapshot);

      if (isFirstRun) {
        ignoreListService.initialize(trackedPositions);

        console.log(`[${formatTimestamp(new Date())}] 📊 Initial snapshot captured`);
        console.log(`  Tracked Positions: ${trackedPositions.length}`);
        console.log(`  Tracked Balance (withdrawable): $${parseFloat(trackedBalance.withdrawable).toFixed(2)}`);

        if (userWallet && userBalance) {
          console.log(`  Your Positions: ${userPositions.length}`);
          console.log(`  Your Balance (withdrawable): $${parseFloat(userBalance.withdrawable).toFixed(2)}`);
          console.log(`  Balance Ratio: 1:${balanceRatio.toFixed(4)}`);
        }

        displayIgnoreListInit(ignoreListService.getIgnoreList());

        // Update telegram stats
        if (telegramService.isEnabled()) {
          telegramService.updateStats({
            trackedWallet,
            userWallet,
            trackedPositions: trackedPositions.length,
            trackedBalance: parseFloat(trackedBalance.withdrawable),
            userPositions: userPositions.length,
            userBalance: userBalance ? parseFloat(userBalance.withdrawable) : 0,
            balanceRatio,
            ignoredCoins: ignoreListService.getIgnoreList().map(i => `${i.coin} ${i.side.toUpperCase()}`),
            uptime: Date.now() - startTime
          });
        }

        isFirstRun = false;
      } else if (changes.length > 0) {
        // Process all changes and execute trades in parallel
        const tradeExecutions = changes.map(async (change) => {
          displayPositionChange(change);

          if (userWallet && actionCopyService) {
            const recommendation = actionCopyService.getRecommendation(
              change,
              userPositions,
              trackedPositions
            );

            if (recommendation) {
              displayActionRecommendation(recommendation);

              // Execute the trade if action is not 'ignore'
              if (recommendation.action !== 'ignore' && service.canExecuteTrades()) {
                try {
                  let orderResponse;

                  switch (recommendation.action) {
                    case 'open':
                      if (recommendation.side === 'long') {
                        orderResponse = await service.openLong(recommendation.coin, recommendation.size);
                      } else {
                        orderResponse = await service.openShort(recommendation.coin, recommendation.size);
                      }
                      console.log(`  ✓ Executed: ${recommendation.action.toUpperCase()} ${recommendation.side.toUpperCase()} ${recommendation.size} ${recommendation.coin}`);
                      break;

                    case 'close':
                      orderResponse = await service.closePosition(recommendation.coin, recommendation.size);
                      console.log(`  ✓ Executed: CLOSED ${recommendation.size} ${recommendation.coin}`);
                      break;

                    case 'add':
                      if (recommendation.side === 'long') {
                        orderResponse = await service.openLong(recommendation.coin, recommendation.size);
                      } else {
                        orderResponse = await service.openShort(recommendation.coin, recommendation.size);
                      }
                      console.log(`  ✓ Executed: ADDED ${recommendation.size} ${recommendation.coin} ${recommendation.side.toUpperCase()}`);
                      break;

                    case 'reduce':
                      orderResponse = await service.reducePosition(recommendation.coin, recommendation.size);
                      console.log(`  ✓ Executed: REDUCED ${recommendation.size} ${recommendation.coin}`);
                      break;

                    case 'reverse':
                      // First close the old position
                      const currentPos = userPositions.find(p => p.coin === recommendation.coin);
                      if (currentPos) {
                        await service.closePosition(recommendation.coin);
                        console.log(`  ✓ Executed: CLOSED old ${currentPos.side.toUpperCase()} position`);
                      }

                      // Then open the new position
                      if (recommendation.side === 'long') {
                        orderResponse = await service.openLong(recommendation.coin, recommendation.size);
                      } else {
                        orderResponse = await service.openShort(recommendation.coin, recommendation.size);
                      }
                      console.log(`  ✓ Executed: OPENED new ${recommendation.side.toUpperCase()} ${recommendation.size} ${recommendation.coin}`);
                      break;
                  }

                  // Send Telegram notification for successful execution (non-blocking)
                  if (telegramService.isEnabled() && orderResponse) {
                    telegramService.sendTradeExecutionWithChange(change, recommendation, orderResponse).catch(err => {
                      console.error('Failed to send Telegram notification:', err instanceof Error ? err.message : err);
                    });
                  }

                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  console.error(`  ✗ Trade execution failed: ${errorMessage}`);

                  // Send Telegram error notification (non-blocking)
                  if (telegramService.isEnabled()) {
                    telegramService.sendError(`Trade execution failed for ${recommendation.coin}: ${errorMessage}`).catch(() => {});
                  }
                }
              }
            }
          }
        });

        // Wait for all trades to execute in parallel
        await Promise.allSettled(tradeExecutions);

        // Update telegram stats after changes
        if (telegramService.isEnabled()) {
          telegramService.updateStats({
            trackedWallet,
            userWallet,
            trackedPositions: trackedPositions.length,
            trackedBalance: parseFloat(trackedBalance.withdrawable),
            userPositions: userPositions.length,
            userBalance: userBalance ? parseFloat(userBalance.withdrawable) : 0,
            balanceRatio,
            ignoredCoins: ignoreListService.getIgnoreList().map(i => `${i.coin} ${i.side.toUpperCase()}`),
            uptime: Date.now() - startTime
          });
        }
      } else {
        const time = formatTimestamp(new Date());
        process.stdout.write(`\r[${time}] ✓ No changes detected - monitoring...`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n[${formatTimestamp(new Date())}] ❌ Error:`, errorMessage);

      // Send telegram error notification
      if (telegramService.isEnabled()) {
        await telegramService.sendError(errorMessage);
      }
    }
  };

  await poll();

  const intervalId = setInterval(poll, pollInterval);

  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Monitoring stopped by user');
    clearInterval(intervalId);
    await service.cleanup();
    await telegramService.stop();
    process.exit(0);
  });
};

const main = async (): Promise<void> => {
  const config = loadConfig();

  if (!config.trackedWallet) {
    console.error('\nError: TRACKED_WALLET not configured in .env file');
    console.log('Please create a .env file with TRACKED_WALLET\n');
    console.log('Example .env:');
    console.log('  TRACKED_WALLET=0x1234...5678');
    console.log('  USER_WALLET=0xabcd...ef01');
    console.log('  PRIVATE_KEY=0x...');
    console.log('  IS_TESTNET=false\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const intervalArg = args.find(arg => arg.startsWith('--interval='));

  let pollInterval = DEFAULT_POLL_INTERVAL;
  if (intervalArg) {
    const interval = parseInt(intervalArg.split('=')[1], 10);
    if (!isNaN(interval) && interval >= 1000) {
      pollInterval = interval;
    } else {
      console.error('\nError: Invalid interval value (minimum 1000ms)\n');
      process.exit(1);
    }
  }

  // Initialize Telegram service
  const telegramService = new TelegramService(config.telegramBotToken, config.telegramChatId);
  if (telegramService.isEnabled()) {
    console.log('✓ Telegram notifications enabled');
  }

  await monitorTrackedWallet(config.trackedWallet, config.userWallet, config.privateKey, pollInterval, config.isTestnet, telegramService);
};

main();
