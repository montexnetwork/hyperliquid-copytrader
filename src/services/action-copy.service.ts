import type { PositionChange } from '../models/change.model';
import type { Position } from '../models';
import { IgnoreListService } from './ignore-list.service';
import { AccumulationTrackerService } from './accumulation-tracker.service';
import { scaleChangeAmount, formatScaledSize } from '../utils/scaling.utils';

export interface ActionRecommendation {
  action: 'open' | 'close' | 'add' | 'reduce' | 'reverse' | 'ignore';
  coin: string;
  side: 'long' | 'short';
  size: number;
  reason: string;
  isIgnored: boolean;
}

export class ActionCopyService {
  constructor(
    private ignoreListService: IgnoreListService,
    private accumulationTracker: AccumulationTrackerService,
    private balanceRatio: number
  ) {}

  getRecommendation(
    change: PositionChange,
    userPositions: Position[],
    trackedPositions: Position[]
  ): ActionRecommendation | null {
    const userPosition = userPositions.find(p => p.coin === change.coin);
    const trackedPosition = trackedPositions.find(p => p.coin === change.coin);
    const isIgnored = this.ignoreListService.isIgnored(change.coin);
    const ignoredSide = this.ignoreListService.getIgnoredSide(change.coin);

    if (isIgnored) {
      return this.handleIgnoredPosition(change, userPosition, trackedPosition, ignoredSide);
    } else {
      return this.handleTrackedPosition(change, userPosition);
    }
  }

  private isPriceFavorable(
    side: 'long' | 'short',
    currentPrice: number,
    trackedEntryPrice: number
  ): boolean {
    if (side === 'long') {
      // For longs: only enter/add if current price < tracked entry (buying cheaper)
      return currentPrice < trackedEntryPrice;
    } else {
      // For shorts: only enter/add if current price > tracked entry (selling higher)
      return currentPrice > trackedEntryPrice;
    }
  }

  private handleIgnoredPosition(
    change: PositionChange,
    userPosition: Position | undefined,
    trackedPosition: Position | undefined,
    ignoredSide: 'long' | 'short' | null
  ): ActionRecommendation | null {
    if (change.type === 'reversed') {
      this.ignoreListService.removeFromIgnoreList(change.coin);
      const scaledSize = formatScaledSize(scaleChangeAmount(change.newSize, this.balanceRatio));

      return {
        action: 'open',
        coin: change.coin,
        side: change.newSide,
        size: scaledSize,
        reason: `Tracked wallet reversed ${change.coin} from ${change.previousSide?.toUpperCase()} to ${change.newSide.toUpperCase()}. Removed from ignore list and opening new side.`,
        isIgnored: false
      };
    }

    if (change.type === 'closed') {
      this.ignoreListService.removeFromIgnoreList(change.coin);

      return {
        action: 'ignore',
        coin: change.coin,
        side: ignoredSide || change.newSide,
        size: 0,
        reason: `Tracked wallet closed pre-existing ${change.coin} position. Removed from ignore list.`,
        isIgnored: true
      };
    }

    // Check if they're adding to position at a favorable price (averaging down/up)
    if (change.type === 'increased' && trackedPosition) {
      const entryPrice = trackedPosition.entryPrice;
      const markPrice = trackedPosition.markPrice;
      const isFavorable = this.isPriceFavorable(change.newSide, markPrice, entryPrice);

      if (isFavorable) {
        // Current price is better than their averaged entry - we should enter!
        this.ignoreListService.removeFromIgnoreList(change.coin);
        const pnlStatus = trackedPosition.unrealizedPnl < 0 ? `underwater $${trackedPosition.unrealizedPnl.toFixed(2)}` : `profitable $${trackedPosition.unrealizedPnl.toFixed(2)}`;

        // Check if user already has this position
        if (userPosition) {
          // User has the position - ADD the incremental amount
          const changeAmount = change.newSize - change.previousSize;
          const scaledChangeAmount = formatScaledSize(scaleChangeAmount(changeAmount, this.balanceRatio));

          // Record accumulation
          this.accumulationTracker.recordEntry(change.coin, scaledChangeAmount, change.newSize);

          return {
            action: 'add',
            coin: change.coin,
            side: change.newSide,
            size: scaledChangeAmount,
            reason: `Tracked wallet adding to ${change.coin} ${change.newSide.toUpperCase()} (${pnlStatus}). Mark $${markPrice.toFixed(2)} < Entry $${entryPrice.toFixed(2)}. Adding to your existing position.`,
            isIgnored: false
          };
        } else {
          // User doesn't have the position - OPEN new position
          const scaledSize = formatScaledSize(scaleChangeAmount(change.newSize, this.balanceRatio));

          // Record accumulation
          this.accumulationTracker.recordEntry(change.coin, scaledSize, change.newSize);

          return {
            action: 'open',
            coin: change.coin,
            side: change.newSide,
            size: scaledSize,
            reason: `Tracked wallet adding to ${change.coin} ${change.newSide.toUpperCase()} (${pnlStatus}). Mark $${markPrice.toFixed(2)} < Entry $${entryPrice.toFixed(2)}. Entering at favorable price.`,
            isIgnored: false
          };
        }
      }
    }

    return {
      action: 'ignore',
      coin: change.coin,
      side: change.newSide,
      size: 0,
      reason: `${change.coin} is a pre-existing position. Ignoring ${change.type} action.`,
      isIgnored: true
    };
  }

  private handleTrackedPosition(
    change: PositionChange,
    userPosition: Position | undefined
  ): ActionRecommendation | null {
    switch (change.type) {
      case 'opened':
        return this.handleOpened(change);

      case 'closed':
        return this.handleClosed(change, userPosition);

      case 'reversed':
        return this.handleReversed(change, userPosition);

      case 'increased':
        return this.handleIncreased(change, userPosition);

      case 'decreased':
        return this.handleDecreased(change, userPosition);

      default:
        return null;
    }
  }

  private handleOpened(change: PositionChange): ActionRecommendation {
    const scaledSize = formatScaledSize(scaleChangeAmount(change.newSize, this.balanceRatio));

    // For opens, we don't have historical price to compare
    // Store the entry price for future comparisons
    this.accumulationTracker.recordEntry(change.coin, scaledSize, change.newSize);

    return {
      action: 'open',
      coin: change.coin,
      side: change.newSide,
      size: scaledSize,
      reason: `Tracked wallet opened new ${change.newSide.toUpperCase()} position in ${change.coin} @ $${change.newPrice.toFixed(2)}.`,
      isIgnored: false
    };
  }

  private handleClosed(
    change: PositionChange,
    userPosition: Position | undefined
  ): ActionRecommendation {
    // Reset accumulation tracker for this coin
    this.accumulationTracker.reset(change.coin);

    if (!userPosition) {
      return {
        action: 'ignore',
        coin: change.coin,
        side: change.newSide,
        size: 0,
        reason: `Tracked wallet closed ${change.coin} but you don't have this position.`,
        isIgnored: false
      };
    }

    return {
      action: 'close',
      coin: change.coin,
      side: userPosition.side,
      size: userPosition.size,
      reason: `Tracked wallet closed ${change.coin} ${userPosition.side.toUpperCase()} position.`,
      isIgnored: false
    };
  }

  private handleReversed(
    change: PositionChange,
    userPosition: Position | undefined
  ): ActionRecommendation {
    const scaledNewSize = formatScaledSize(scaleChangeAmount(change.newSize, this.balanceRatio));

    if (!userPosition) {
      return {
        action: 'open',
        coin: change.coin,
        side: change.newSide,
        size: scaledNewSize,
        reason: `Tracked wallet reversed ${change.coin} to ${change.newSide.toUpperCase()}. Opening new position.`,
        isIgnored: false
      };
    }

    return {
      action: 'reverse',
      coin: change.coin,
      side: change.newSide,
      size: scaledNewSize,
      reason: `Tracked wallet reversed ${change.coin} from ${change.previousSide?.toUpperCase()} to ${change.newSide.toUpperCase()}.`,
      isIgnored: false
    };
  }

  private handleIncreased(
    change: PositionChange,
    userPosition: Position | undefined
  ): ActionRecommendation {
    const changeAmount = change.newSize - change.previousSize;
    const scaledChangeAmount = formatScaledSize(scaleChangeAmount(changeAmount, this.balanceRatio));

    // Check if price is favorable for adding
    // For longs: only add if price decreased (buying cheaper)
    // For shorts: only add if price increased (selling higher)
    const previousPrice = change.previousPrice || change.newPrice;
    const isFavorable = this.isPriceFavorable(change.newSide, change.newPrice, previousPrice);

    if (!isFavorable) {
      return {
        action: 'ignore',
        coin: change.coin,
        side: change.newSide,
        size: 0,
        reason: `Tracked wallet increased ${change.coin} ${change.newSide.toUpperCase()}, but price is unfavorable (${change.newSide === 'long' ? 'increased' : 'decreased'} from $${previousPrice.toFixed(2)} to $${change.newPrice.toFixed(2)}). Waiting for better entry.`,
        isIgnored: false
      };
    }

    if (!userPosition) {
      const scaledTotalSize = formatScaledSize(scaleChangeAmount(change.newSize, this.balanceRatio));
      // Record accumulation
      this.accumulationTracker.recordEntry(change.coin, scaledTotalSize, change.newSize);

      return {
        action: 'open',
        coin: change.coin,
        side: change.newSide,
        size: scaledTotalSize,
        reason: `Tracked wallet increased ${change.coin} but you don't have it yet. Opening new position @ $${change.newPrice.toFixed(2)}.`,
        isIgnored: false
      };
    }

    // Record accumulation and update tracked size
    this.accumulationTracker.recordEntry(change.coin, scaledChangeAmount, change.newSize);

    return {
      action: 'add',
      coin: change.coin,
      side: change.newSide,
      size: scaledChangeAmount,
      reason: `Tracked wallet increased ${change.coin} ${change.newSide.toUpperCase()} by ${changeAmount.toFixed(4)} @ favorable price $${change.newPrice.toFixed(2)}.`,
      isIgnored: false
    };
  }

  private handleDecreased(
    change: PositionChange,
    userPosition: Position | undefined
  ): ActionRecommendation {
    if (!userPosition) {
      return {
        action: 'ignore',
        coin: change.coin,
        side: change.newSide,
        size: 0,
        reason: `Tracked wallet decreased ${change.coin} but you don't have this position.`,
        isIgnored: false
      };
    }

    // Calculate tracked wallet's absolute reduction amount
    const trackedReductionAmount = change.previousSize - change.newSize;
    const trackedReductionPercentage = (trackedReductionAmount / change.previousSize) * 100;

    // Scale the reduction by our balance ratio to see how much we should reduce
    const scaledReductionAmount = formatScaledSize(scaleChangeAmount(trackedReductionAmount, this.balanceRatio));

    // If the scaled reduction is >= our entire position, close 100%
    if (scaledReductionAmount >= userPosition.size) {
      // Reset accumulation
      this.accumulationTracker.reset(change.coin);

      return {
        action: 'close',
        coin: change.coin,
        side: change.newSide,
        size: userPosition.size,
        reason: `Tracked wallet reduced ${change.coin} by ${trackedReductionAmount.toFixed(4)} (${trackedReductionPercentage.toFixed(1)}%). Scaled reduction (${scaledReductionAmount.toFixed(4)}) >= your position (${userPosition.size.toFixed(4)}). Closing 100%.`,
        isIgnored: false
      };
    }

    // Otherwise, reduce by the scaled amount
    // Update tracked size in accumulation tracker
    this.accumulationTracker.updateTrackedSize(change.coin, change.newSize);

    return {
      action: 'reduce',
      coin: change.coin,
      side: change.newSide,
      size: scaledReductionAmount,
      reason: `Tracked wallet decreased ${change.coin} ${change.newSide.toUpperCase()} by ${trackedReductionAmount.toFixed(4)} (${trackedReductionPercentage.toFixed(1)}%). Reducing by ${scaledReductionAmount.toFixed(4)}.`,
      isIgnored: false
    };
  }
}
