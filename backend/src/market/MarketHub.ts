import { EventEmitter } from 'node:events';
import type { ProviderState } from '@/shared/types';
import type { ProviderMappedAsset } from '@/backend/src/providers';
import { getProviderMappedAssets } from '@/backend/src/providers';
import { BinanceWsProvider, type BinanceTradeTick } from '@/backend/src/providers/crypto/binanceWs';
import { PollingMarketDataProvider, type PollingTick } from '@/backend/src/providers/polling/provider';
import { fetchPollingTick } from '@/backend/src/providers/polling/yahoo';

export interface MarketHubUpdate {
  type: 'assetUpdate';
  symbol: string;
  category: string;
  provider: string;
  providerSymbol: string;
  price: number;
  volume?: number;
  timestamp: string;
}

export interface MarketHubProviderState {
  type: 'providerState';
  provider: string;
  state: ProviderState;
  message?: string | null;
  latencyMs?: number;
  timestamp: string;
}

export interface MarketHubOptions {
  pollingIntervalByCategory?: Partial<Record<string, number>>;
}

const defaultIntervalsMs: Record<string, number> = {
  forex: 4_000,
  indices: 7_000,
  stocks: 5_000,
  commodities: 6_000,
};

export class MarketHub extends EventEmitter {
  private readonly assets: ProviderMappedAsset[];
  private readonly stopHandlers: Array<() => void> = [];

  constructor(private readonly options: MarketHubOptions = {}) {
    super();
    this.assets = getProviderMappedAssets({
      crypto: 'binance',
      forex: 'twelvedata',
      indices: 'twelvedata',
      stocks: 'alpaca',
      commodities: 'twelvedata',
    });
  }

  start() {
    this.assets.forEach((asset) => {
      if (asset.category === 'crypto' && asset.provider === 'binance' && asset.supportsStreaming) {
        const streamProvider = new BinanceWsProvider(asset.providerSymbol);
        const onTick = (tick: BinanceTradeTick) => this.emitAssetUpdate(asset, tick);
        const onState = (state: { provider: string; state: ProviderState; message?: string | null }) =>
          this.emitProviderState(state.provider, state.state, state.message ?? null);

        streamProvider.on('tick', onTick);
        streamProvider.on('providerState', onState);
        streamProvider.start();

        this.stopHandlers.push(() => {
          streamProvider.off('tick', onTick);
          streamProvider.off('providerState', onState);
          streamProvider.stop();
        });

        return;
      }

      const intervalMs =
        this.options.pollingIntervalByCategory?.[asset.category] ?? defaultIntervalsMs[asset.category] ?? 6_000;

      const pollingProvider = new PollingMarketDataProvider({
        provider: asset.provider,
        providerSymbol: asset.providerSymbol,
        intervalMs,
        fetchTick: () => fetchPollingTick(asset),
      });

      const onTick = (tick: PollingTick) => this.emitAssetUpdate(asset, tick);
      const onState = (state: { provider: string; state: ProviderState; message?: string | null; latencyMs?: number }) =>
        this.emitProviderState(state.provider, state.state, state.message ?? null, state.latencyMs);

      pollingProvider.on('tick', onTick);
      pollingProvider.on('providerState', onState);
      pollingProvider.start();

      this.stopHandlers.push(() => {
        pollingProvider.off('tick', onTick);
        pollingProvider.off('providerState', onState);
        pollingProvider.stop();
      });
    });
  }

  stop() {
    this.stopHandlers.splice(0).forEach((stop) => stop());
  }

  private emitAssetUpdate(asset: ProviderMappedAsset, tick: BinanceTradeTick | PollingTick) {
    const update: MarketHubUpdate = {
      type: 'assetUpdate',
      symbol: asset.symbol,
      category: asset.category,
      provider: tick.provider,
      providerSymbol: tick.providerSymbol,
      price: tick.price,
      volume: tick.volume,
      timestamp: tick.timestamp,
    };

    this.emit('event', update);
  }

  private emitProviderState(provider: string, state: ProviderState, message?: string | null, latencyMs?: number) {
    const providerEvent: MarketHubProviderState = {
      type: 'providerState',
      provider,
      state,
      message,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    this.emit('event', providerEvent);
  }
}
