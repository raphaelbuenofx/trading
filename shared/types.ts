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
