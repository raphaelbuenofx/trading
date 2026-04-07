import { EventEmitter } from 'node:events';

export interface PollingTick {
  provider: string;
  providerSymbol: string;
  price: number;
  volume?: number;
  timestamp: string;
}

export interface PollingProviderOptions {
  provider: string;
  providerSymbol: string;
  intervalMs: number;
  fetchTick: () => Promise<{ price: number; volume?: number }>;
}

export class PollingMarketDataProvider extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: PollingProviderOptions) {
    super();
  }

  start() {
    void this.poll();
    this.timer = setInterval(() => {
      void this.poll();
    }, this.options.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll() {
    const startedAt = Date.now();

    try {
      const result = await this.options.fetchTick();

      const tick: PollingTick = {
        provider: this.options.provider,
        providerSymbol: this.options.providerSymbol,
        price: result.price,
        volume: result.volume,
        timestamp: new Date().toISOString(),
      };

      this.emit('tick', tick);
      this.emit('providerState', {
        provider: this.options.provider,
        state: 'up' as const,
        latencyMs: Date.now() - startedAt,
        message: null,
      });
    } catch (error) {
      this.emit('providerState', {
        provider: this.options.provider,
        state: 'degraded' as const,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Error de polling',
      });
    }
  }
}
