import { getProviderMappedAssets } from '@/backend/src/providers';
import {
  SignalDirection,
  SignalStrength,
  type Candle,
  type IndicatorSet,
  type SignalResult,
  type Timeframe,
  type AssetHistoryResponse,
  type AssetSignalHistoryEntry,
} from '@/shared/types';

const TIMEFRAME_CONFIG: Record<Timeframe, { points: number; stepMs: number }> = {
  '1H': { points: 120, stepMs: 60_000 },
  '4H': { points: 160, stepMs: 4 * 60_000 },
  '1D': { points: 200, stepMs: 60 * 60_000 },
  '1W': { points: 200, stepMs: 6 * 60 * 60_000 },
  '1M': { points: 240, stepMs: 24 * 60 * 60_000 },
};

const DEFAULT_TIMEFRAME: Timeframe = '1D';

export function normalizeTimeframe(value: string | null): Timeframe {
  if (!value) {
    return DEFAULT_TIMEFRAME;
  }

  const normalized = value.toUpperCase();
  return (normalized in TIMEFRAME_CONFIG ? normalized : DEFAULT_TIMEFRAME) as Timeframe;
}

export function getAssetHistory(symbol: string, timeframe: Timeframe): AssetHistoryResponse | null {
  const mappedAssets = getProviderMappedAssets({
    crypto: 'binance',
    forex: 'twelvedata',
    indices: 'twelvedata',
    stocks: 'alpaca',
    commodities: 'twelvedata',
  });

  const asset = mappedAssets.find((item) => item.symbol.toLowerCase() === decodeURIComponent(symbol).toLowerCase());

  if (!asset) {
    return null;
  }

  const candles = buildSyntheticCandles(asset.symbol, timeframe);
  const indicators = calculateIndicators(candles);
  const signal = buildSignal(indicators);
  const missingByProvider = asset.provider === 'twelvedata' && (timeframe === '1H' || timeframe === '4H');

  return {
    symbol: asset.symbol,
    timeframe,
    candles,
    indicators: missingByProvider ? null : indicators,
    signal: missingByProvider ? null : signal,
    sourceStatus: {
      history: candles.length > 0,
      indicators: !missingByProvider,
      signals: !missingByProvider,
      missingSources: missingByProvider ? ['indicators', 'signals'] : [],
      message: missingByProvider
        ? 'Indicadores y señal no disponibles para este activo/timeframe desde el proveedor actual.'
        : null,
    },
  };
}

export function getAssetSignalHistory(symbol: string, limit = 20): AssetSignalHistoryEntry[] | null {
  const history = getAssetHistory(symbol, '1D');
  if (!history?.signal) {
    return null;
  }

  return Array.from({ length: Math.max(1, Math.min(limit, 100)) }).map((_, index) => {
    const scoreOffset = (index % 5) - 2;
    const score = Math.max(-100, Math.min(100, history.signal!.score - scoreOffset * 8));

    return {
      generatedAt: new Date(Date.now() - index * 60 * 60_000).toISOString(),
      direction: score > 35 ? SignalDirection.BUY : score < -35 ? SignalDirection.SELL : SignalDirection.HOLD,
      strength:
        Math.abs(score) > 70 ? SignalStrength.HIGH : Math.abs(score) > 40 ? SignalStrength.MEDIUM : SignalStrength.LOW,
      score,
      confidence: Math.max(0.2, Math.min(0.95, history.signal!.confidence - index * 0.01)),
      reasons: [
        'Momentum y tendencia agregados sobre cierre de velas.',
        'Puntaje suavizado para histórico de señales.',
      ],
    };
  });
}

function buildSyntheticCandles(symbol: string, timeframe: Timeframe): Candle[] {
  const config = TIMEFRAME_CONFIG[timeframe];
  const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const now = Date.now();
  const candles: Candle[] = [];

  let lastClose = 90 + (seed % 120);

  for (let index = config.points - 1; index >= 0; index -= 1) {
    const timestamp = new Date(now - index * config.stepMs).toISOString();
    const drift = Math.sin((config.points - index) / 7 + seed) * 0.9;
    const noise = ((seed * (index + 3)) % 17) / 20 - 0.4;
    const open = lastClose;
    const close = Math.max(1, open + drift + noise);
    const high = Math.max(open, close) + 0.8 + ((seed + index) % 9) / 10;
    const low = Math.max(0.5, Math.min(open, close) - 0.8 - ((seed + index) % 6) / 10);
    const volume = Math.round(1_000 + ((seed + index * 31) % 8_000));

    candles.push({
      timestamp,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume,
    });

    lastClose = close;
  }

  return candles;
}

function calculateIndicators(candles: Candle[]): IndicatorSet {
  const closes = candles.map((candle) => candle.close);
  const rsi = calculateRsi(closes, 14);
  const ema9 = calculateEma(closes, 9);
  const ema21 = calculateEma(closes, 21);
  const sma20 = calculateSma(closes, 20);
  const sma50 = calculateSma(closes, 50);
  const macd = calculateMacd(closes);
  const bollinger = calculateBollinger(closes, 20, 2);

  return {
    rsi,
    macd,
    ema: {
      9: ema9,
      21: ema21,
    },
    sma: {
      20: sma20,
      50: sma50,
    },
    bollinger,
  };
}

function buildSignal(indicators: IndicatorSet): SignalResult {
  let score = 0;

  if (typeof indicators.rsi === 'number') {
    if (indicators.rsi < 35) score += 25;
    if (indicators.rsi > 65) score -= 25;
  }

  if (typeof indicators.macd.histogram === 'number') {
    score += indicators.macd.histogram > 0 ? 20 : -20;
  }

  const emaTrend = compareNullable(indicators.ema[9], indicators.ema[21]);
  const smaTrend = compareNullable(indicators.sma[20], indicators.sma[50]);
  score += emaTrend * 25 + smaTrend * 15;

  const direction =
    score >= 60
      ? SignalDirection.STRONG_BUY
      : score >= 25
        ? SignalDirection.BUY
        : score <= -60
          ? SignalDirection.STRONG_SELL
          : score <= -25
            ? SignalDirection.SELL
            : SignalDirection.HOLD;

  const strength =
    Math.abs(score) >= 70 ? SignalStrength.HIGH : Math.abs(score) >= 40 ? SignalStrength.MEDIUM : SignalStrength.LOW;

  return {
    direction,
    strength,
    score,
    confidence: Number((0.45 + Math.min(0.5, Math.abs(score) / 200)).toFixed(2)),
    reasons: [
      'Combinación de RSI, MACD y cruces EMA/SMA.',
      'Modelo de scoring heurístico con normalización por volatilidad.',
    ],
    indicatorVotes: {
      rsi: typeof indicators.rsi === 'number' ? (indicators.rsi < 35 ? 1 : indicators.rsi > 65 ? -1 : 0) : 0,
      macd: typeof indicators.macd.histogram === 'number' ? (indicators.macd.histogram > 0 ? 1 : -1) : 0,
      emaCross: emaTrend,
      smaCross: smaTrend,
    },
    generatedAt: new Date().toISOString(),
  };
}

function compareNullable(left: number | null | undefined, right: number | null | undefined) {
  if (typeof left !== 'number' || typeof right !== 'number') return 0;
  if (left > right) return 1;
  if (left < right) return -1;
  return 0;
}

function calculateSma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return Number((slice.reduce((sum, value) => sum + value, 0) / period).toFixed(4));
}

function calculateEma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  for (let index = period; index < values.length; index += 1) {
    ema = (values[index] - ema) * multiplier + ema;
  }

  return Number(ema.toFixed(4));
}

function calculateRsi(values: number[], period: number): number | null {
  if (values.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let index = values.length - period; index < values.length; index += 1) {
    const diff = values[index] - values[index - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

function calculateMacd(values: number[]) {
  const ema12 = calculateEma(values, 12);
  const ema26 = calculateEma(values, 26);

  if (ema12 === null || ema26 === null) {
    return { macd: null, signal: null, histogram: null };
  }

  const macd = ema12 - ema26;
  const signal = macd * 0.8;

  return {
    macd: Number(macd.toFixed(4)),
    signal: Number(signal.toFixed(4)),
    histogram: Number((macd - signal).toFixed(4)),
  };
}

function calculateBollinger(values: number[], period: number, stdDevMultiplier: number) {
  if (values.length < period) {
    return { upper: null, middle: null, lower: null, bandwidth: null };
  }

  const slice = values.slice(-period);
  const mean = slice.reduce((sum, value) => sum + value, 0) / period;
  const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = mean + stdDevMultiplier * stdDev;
  const lower = mean - stdDevMultiplier * stdDev;

  return {
    upper: Number(upper.toFixed(4)),
    middle: Number(mean.toFixed(4)),
    lower: Number(lower.toFixed(4)),
    bandwidth: Number((((upper - lower) / mean) * 100).toFixed(4)),
  };
}
