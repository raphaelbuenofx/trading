import type { IndicatorSet } from '@/shared/types';

export type TrendSignal = 'Alcista' | 'Bajista' | 'Neutral';

export interface RuleEngineInput {
  indicators: IndicatorSet;
  momentum: number | null;
  volatility: number | null;
  changePct: number | null;
  threshold?: number;
}

export interface ActiveRule {
  key: string;
  label: string;
  weight: number;
  vote: number;
  contribution: number;
}

export interface RuleEngineOutput {
  signal: TrendSignal;
  score: number;
  confidence: number;
  threshold: number;
  usedIndicators: string[];
  explanation: string;
  activeRules: ActiveRule[];
}

const WEIGHTS = {
  rsi: 1.2,
  macd: 1.5,
  emaCross: 1.3,
  smaCross: 1.3,
  momentum: 1.0,
  volatility: 0.8,
  changePct: 0.9,
} as const;

const MAX_ABS_SCORE = Object.values(WEIGHTS).reduce((acc, value) => acc + value, 0) * 100;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeVote(value: number, min: number, max: number) {
  if (value <= min) return -1;
  if (value >= max) return 1;

  const midpoint = (min + max) / 2;
  const halfRange = (max - min) / 2;

  return clamp((value - midpoint) / halfRange, -1, 1);
}

function scoreToSignal(score: number, threshold: number): TrendSignal {
  if (score >= threshold) return 'Alcista';
  if (score <= -threshold) return 'Bajista';

  return 'Neutral';
}

function buildExplanation(signal: TrendSignal, activeRules: ActiveRule[]) {
  const topRules = [...activeRules]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);

  if (topRules.length === 0) {
    return 'Sin reglas activas suficientes para justificar una dirección clara.';
  }

  const detail = topRules
    .map((rule) => `${rule.label} (${rule.vote > 0 ? 'positivo' : 'negativo'})`)
    .join(', ');

  if (signal === 'Neutral') {
    return `Se detecta equilibrio entre señales: ${detail}.`;
  }

  return `Sesgo ${signal.toLowerCase()} respaldado por ${detail}.`;
}

export function evaluateRuleEngine(input: RuleEngineInput): RuleEngineOutput {
  const threshold = clamp(safeNumber(input.threshold) ?? 25, 5, 100);
  const activeRules: ActiveRule[] = [];

  const rsi = safeNumber(input.indicators.rsi);
  if (rsi !== null) {
    const vote = normalizeVote(50 - rsi, -20, 20);
    activeRules.push({
      key: 'rsi',
      label: 'RSI',
      vote,
      weight: WEIGHTS.rsi,
      contribution: vote * WEIGHTS.rsi * 100,
    });
  }

  const macd = safeNumber(input.indicators.macd.macd);
  const macdSignal = safeNumber(input.indicators.macd.signal);
  const macdHistogram = safeNumber(input.indicators.macd.histogram);
  if (macd !== null && macdSignal !== null) {
    const delta = macd - macdSignal;
    const baseVote = normalizeVote(delta, -1.5, 1.5);
    const histogramBoost = macdHistogram === null ? 0 : clamp(macdHistogram / 3, -0.25, 0.25);
    const vote = clamp(baseVote + histogramBoost, -1, 1);

    activeRules.push({
      key: 'macd',
      label: 'MACD',
      vote,
      weight: WEIGHTS.macd,
      contribution: vote * WEIGHTS.macd * 100,
    });
  }

  const ema9 = safeNumber(input.indicators.ema[9]);
  const ema21 = safeNumber(input.indicators.ema[21]);
  if (ema9 !== null && ema21 !== null && ema21 !== 0) {
    const vote = normalizeVote(((ema9 - ema21) / ema21) * 100, -1.5, 1.5);
    activeRules.push({
      key: 'emaCross',
      label: 'Cruce EMA 9/21',
      vote,
      weight: WEIGHTS.emaCross,
      contribution: vote * WEIGHTS.emaCross * 100,
    });
  }

  const sma50 = safeNumber(input.indicators.sma[50]);
  const sma200 = safeNumber(input.indicators.sma[200]);
  if (sma50 !== null && sma200 !== null && sma200 !== 0) {
    const vote = normalizeVote(((sma50 - sma200) / sma200) * 100, -3.5, 3.5);
    activeRules.push({
      key: 'smaCross',
      label: 'Cruce SMA 50/200',
      vote,
      weight: WEIGHTS.smaCross,
      contribution: vote * WEIGHTS.smaCross * 100,
    });
  }

  const momentum = safeNumber(input.momentum);
  if (momentum !== null) {
    const vote = normalizeVote(momentum, -3, 3);
    activeRules.push({
      key: 'momentum',
      label: 'Momentum',
      vote,
      weight: WEIGHTS.momentum,
      contribution: vote * WEIGHTS.momentum * 100,
    });
  }

  const volatility = safeNumber(input.volatility);
  if (volatility !== null) {
    // Volatilidad muy alta reduce convicción direccional.
    const vote = normalizeVote(2 - volatility, -3, 3);
    activeRules.push({
      key: 'volatility',
      label: 'Volatilidad',
      vote,
      weight: WEIGHTS.volatility,
      contribution: vote * WEIGHTS.volatility * 100,
    });
  }

  const changePct = safeNumber(input.changePct);
  if (changePct !== null) {
    const vote = normalizeVote(changePct, -4, 4);
    activeRules.push({
      key: 'changePct',
      label: 'Cambio porcentual',
      vote,
      weight: WEIGHTS.changePct,
      contribution: vote * WEIGHTS.changePct * 100,
    });
  }

  const weightedScore = activeRules.reduce((acc, rule) => acc + rule.contribution, 0);
  const score = Number(clamp(weightedScore, -MAX_ABS_SCORE, MAX_ABS_SCORE).toFixed(2));

  const signal = scoreToSignal(score, threshold);

  const absVotes = activeRules.reduce((acc, rule) => acc + Math.abs(rule.vote), 0);
  const signedVotes = activeRules.reduce((acc, rule) => acc + rule.vote, 0);
  const consensus = absVotes > 0 ? Math.abs(signedVotes) / absVotes : 0;
  const magnitude = Math.abs(score) / MAX_ABS_SCORE;
  const confidence = Number(clamp(magnitude * 70 + consensus * 30, 0, 100).toFixed(2));

  return {
    signal,
    score,
    confidence,
    threshold,
    usedIndicators: activeRules.map((rule) => rule.key),
    explanation: buildExplanation(signal, activeRules),
    activeRules,
  };
}
