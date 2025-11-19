import * as fs from 'fs';
import * as path from 'path';
import type { Position } from '../models';

interface BalanceSnapshot {
  timestamp: number;
  date: string;
  tracked: {
    address: string;
    balance: number;
    positions: PositionSnapshot[];
    totalNotional: number;
    positionCount: number;
  };
  user: {
    address: string;
    balance: number;
    positions: PositionSnapshot[];
    totalNotional: number;
    positionCount: number;
  };
  balanceRatio: number;
}

interface PositionSnapshot {
  coin: string;
  side: string;
  size: number;
  entryPrice: number;
  markPrice: number;
  notionalValue: number;
  unrealizedPnl: number;
  leverage: number;
}

export class SnapshotLoggerService {
  private readonly dataDir: string;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), 'data');
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private getFilePath(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.dataDir, `snapshots-${date}.jsonl`);
  }

  private formatPositions(positions: Position[]): PositionSnapshot[] {
    return positions.map(p => ({
      coin: p.coin,
      side: p.side,
      size: p.size,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      notionalValue: p.size * p.markPrice,
      unrealizedPnl: p.unrealizedPnl,
      leverage: p.leverage
    }));
  }

  private calculateTotalNotional(positions: Position[]): number {
    return positions.reduce((sum, p) => sum + (p.size * p.markPrice), 0);
  }

  logSnapshot(
    trackedWallet: string,
    trackedBalance: number,
    trackedPositions: Position[],
    userWallet: string,
    userBalance: number,
    userPositions: Position[],
    balanceRatio: number
  ): void {
    const snapshot: BalanceSnapshot = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      tracked: {
        address: trackedWallet,
        balance: trackedBalance,
        positions: this.formatPositions(trackedPositions),
        totalNotional: this.calculateTotalNotional(trackedPositions),
        positionCount: trackedPositions.length
      },
      user: {
        address: userWallet,
        balance: userBalance,
        positions: this.formatPositions(userPositions),
        totalNotional: this.calculateTotalNotional(userPositions),
        positionCount: userPositions.length
      },
      balanceRatio
    };

    try {
      const filePath = this.getFilePath();
      const jsonLine = JSON.stringify(snapshot) + '\n';
      fs.appendFileSync(filePath, jsonLine, 'utf-8');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to write snapshot: ${errorMessage}`);
    }
  }
}
