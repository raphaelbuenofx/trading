export enum SignalDirection {
  STRONG_BUY = 'STRONG_BUY',
  BUY = 'BUY',
  HOLD = 'HOLD',
  SELL = 'SELL',
  STRONG_SELL = 'STRONG_SELL',
}

export enum SignalStrength {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export type ProviderState = 'up' | 'degraded' | 'down';

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Tick {
  timestamp: string;
  price: number;
  volume?: number;
}

export interface IndicatorSet {
  rsi: number | null;
  macd: {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
  };
  ema: Record<number, number | null>;
  sma: Record<number, number | null>;
  bollinger: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    bandwidth: number | null;
  };
}

export interface SignalResult {
  direction: SignalDirection;
  strength: SignalStrength;
  score: number;
  confidence: number;
  reasons: string[];
  indicatorVotes: Record<string, number>;
  generatedAt: string;
}

export interface ProviderStatus {
  provider: string;
  state: ProviderState;
  latencyMs: number | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  message?: string;
}

export interface AssetSnapshot {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  category: string;
  price: number;
  change24hPct: number;
  volume24h: number;
  marketCap?: number;
  tick: Tick;
  latestCandle: Candle;
  indicators: IndicatorSet;
  signal: SignalResult;
  providerStatus: ProviderStatus[];
  updatedAt: string;
}

export interface AssetCatalogItem {
  symbol: string;
  name: string;
  category: string;
  provider: string;
  providerSymbol: string;
  supportsStreaming: boolean;
}

export interface StreamAssetUpdate {
  type: 'assetUpdate';
  symbol: string;
  category: string;
  provider: string;
  providerSymbol: string;
  price: number;
  volume?: number;
  timestamp: string;
}

export interface StreamProviderState {
  type: 'providerState';
  provider: string;
  state: ProviderState;
  message?: string | null;
  latencyMs?: number;
  timestamp: string;
}

export interface StreamSystemEvent {
  type: 'system';
  status: 'connected';
  message: string;
  timestamp: string;
}

export type MarketStreamEvent = StreamAssetUpdate | StreamProviderState | StreamSystemEvent;


export type Timeframe = '1H' | '4H' | '1D' | '1W' | '1M';

export interface SourceDataStatus {
  history: boolean;
  indicators: boolean;
  signals: boolean;
  missingSources: string[];
  message: string | null;
}

export interface AssetHistoryResponse {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  indicators: IndicatorSet | null;
  signal: SignalResult | null;
  sourceStatus: SourceDataStatus;
}

export interface AssetSignalHistoryEntry {
  generatedAt: string;
  direction: SignalDirection;
  strength: SignalStrength;
  score: number;
  confidence: number;
  reasons: string[];
}
