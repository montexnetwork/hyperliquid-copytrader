import { EventClient, WebSocketTransport, WsUserFills } from '@nktkas/hyperliquid';

export class WebSocketFillsService {
  private eventClient: EventClient | null = null;
  private wsTransport: WebSocketTransport | null = null;
  private subscription: any = null;
  private isTestnet: boolean;
  private processedTids: Set<string> = new Set();
  private onFillCallback: ((fill: any) => void) | null = null;
  private isFirstSnapshot: boolean = true;

  constructor(isTestnet: boolean = false) {
    this.isTestnet = isTestnet;
  }

  async initialize(trackedWallet: string, onFill: (fill: any) => void): Promise<void> {
    if (this.eventClient) {
      return;
    }

    this.onFillCallback = onFill;

    const wsUrl = this.isTestnet
      ? 'wss://api.hyperliquid-testnet.xyz/ws'
      : 'wss://api.hyperliquid.xyz/ws';

    this.wsTransport = new WebSocketTransport({ url: wsUrl });
    this.eventClient = new EventClient({ transport: this.wsTransport });

    this.subscription = await this.eventClient.userFills(
      { user: trackedWallet as `0x${string}` },
      (data: WsUserFills) => {
        this.handleFills(data);
      }
    );

    console.log(`✓ WebSocket fills subscription initialized for ${trackedWallet}`);
  }

  private handleFills(data: WsUserFills): void {
    if (data.isSnapshot) {
      if (this.isFirstSnapshot) {
        console.log(`[WebSocket] Received initial snapshot with ${data.fills.length} historical fills`);
        data.fills.forEach(fill => {
          if (fill.tid) {
            this.processedTids.add(String(fill.tid));
          }
        });
        this.isFirstSnapshot = false;
      }
      return;
    }

    for (const fill of data.fills) {
      const tid = String(fill.tid);

      if (this.processedTids.has(tid)) {
        continue;
      }

      this.processedTids.add(tid);

      if (this.processedTids.size > 1000) {
        const tidsArray = Array.from(this.processedTids);
        this.processedTids = new Set(tidsArray.slice(-500));
      }

      if (this.onFillCallback) {
        this.onFillCallback(fill);
      }
    }
  }

  isConnected(): boolean {
    return this.eventClient !== null && this.subscription !== null;
  }

  async close(): Promise<void> {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    this.eventClient = null;
    this.wsTransport = null;
    this.processedTids.clear();
    this.onFillCallback = null;
  }
}
