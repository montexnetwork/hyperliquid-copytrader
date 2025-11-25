export interface BundledFill {
  coin: string;
  fills: any[];
  totalSize: number;
  averagePrice: number;
  side: 'B' | 'A';
  startPosition: number;
  finalPosition: number;
  timestamp: number;
}

export class FillBundlerService {
  bundleFills(fills: any[]): BundledFill {
    if (fills.length === 0) {
      throw new Error('Cannot bundle empty fills array');
    }

    const coin = fills[0].coin;
    let totalSize = 0;
    let totalValue = 0;
    const side = fills[0].side;
    const startPosition = parseFloat(fills[0].startPosition);
    const timestamp = parseFloat(fills[0].time);

    for (const fill of fills) {
      const size = parseFloat(fill.sz);
      const price = parseFloat(fill.px);
      totalSize += size;
      totalValue += size * price;
    }

    const averagePrice = totalValue / totalSize;

    const finalPosition = fills.reduce((pos, fill) => {
      const tradeSize = parseFloat(fill.sz);
      return fill.side === 'B' ? pos + tradeSize : pos - tradeSize;
    }, startPosition);

    return {
      coin,
      fills,
      totalSize,
      averagePrice,
      side,
      startPosition,
      finalPosition,
      timestamp
    };
  }
}
