import * as fs from 'fs';
import * as path from 'path';

interface AccumulationData {
  coin: string;
  accumulatedPercentage: number;
  trackedTotalSize: number;
  userTotalSize: number;
  lastUpdated: Date;
}

export class AccumulationTrackerService {
  private accumulations: Map<string, AccumulationData> = new Map();
  private readonly CACHE_FILE = path.resolve(process.cwd(), 'data', 'accumulation-tracker.json');

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.CACHE_FILE)) {
        const data = fs.readFileSync(this.CACHE_FILE, 'utf-8');
        const cache = JSON.parse(data);

        Object.entries(cache).forEach(([coin, value]: [string, any]) => {
          if (coin !== 'lastUpdated') {
            this.accumulations.set(coin, {
              ...value,
              lastUpdated: new Date(value.lastUpdated)
            });
          }
        });

        console.log(`✓ Loaded ${this.accumulations.size} accumulation records`);
      }
    } catch (error) {
      console.error('Failed to load accumulation tracker:', error instanceof Error ? error.message : error);
    }
  }

  private save(): void {
    try {
      const dataDir = path.dirname(this.CACHE_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const cache: Record<string, any> = {
        lastUpdated: new Date().toISOString()
      };

      this.accumulations.forEach((data, coin) => {
        cache[coin] = {
          ...data,
          lastUpdated: data.lastUpdated.toISOString()
        };
      });

      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (error) {
      console.error('Failed to save accumulation tracker:', error instanceof Error ? error.message : error);
    }
  }

  recordEntry(coin: string, userSize: number, trackedSize: number): void {
    const existing = this.accumulations.get(coin);

    if (existing) {
      // Add to existing accumulation
      const newUserTotal = existing.userTotalSize + userSize;
      const newTrackedTotal = trackedSize;

      this.accumulations.set(coin, {
        coin,
        accumulatedPercentage: (newUserTotal / newTrackedTotal) * 100,
        trackedTotalSize: newTrackedTotal,
        userTotalSize: newUserTotal,
        lastUpdated: new Date()
      });
    } else {
      // First entry
      this.accumulations.set(coin, {
        coin,
        accumulatedPercentage: (userSize / trackedSize) * 100,
        trackedTotalSize: trackedSize,
        userTotalSize: userSize,
        lastUpdated: new Date()
      });
    }

    this.save();
  }

  updateTrackedSize(coin: string, newTrackedSize: number): void {
    const existing = this.accumulations.get(coin);

    if (existing) {
      this.accumulations.set(coin, {
        ...existing,
        trackedTotalSize: newTrackedSize,
        accumulatedPercentage: (existing.userTotalSize / newTrackedSize) * 100,
        lastUpdated: new Date()
      });

      this.save();
    }
  }

  getAccumulatedPercentage(coin: string): number {
    const data = this.accumulations.get(coin);
    return data ? data.accumulatedPercentage : 0;
  }

  getAccumulationData(coin: string): AccumulationData | null {
    return this.accumulations.get(coin) || null;
  }

  reset(coin: string): void {
    this.accumulations.delete(coin);
    this.save();
  }

  clear(): void {
    this.accumulations.clear();
    this.save();
  }

  getAllAccumulations(): Map<string, AccumulationData> {
    return new Map(this.accumulations);
  }
}
