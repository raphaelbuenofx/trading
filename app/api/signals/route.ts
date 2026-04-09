import type { IndicatorSet } from '@/shared/types';
import { evaluateRuleEngine, enhanceSignalExplanation } from '@/backend/src/signals';

interface SignalRequestBody {
  indicators: IndicatorSet;
  momentum?: number | null;
  volatility?: number | null;
  changePct?: number | null;
  threshold?: number;
  useLlmEnhancer?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignalRequestBody;

    if (!body?.indicators) {
      return Response.json({ error: 'indicators es requerido' }, { status: 400 });
    }

    const result = evaluateRuleEngine({
      indicators: body.indicators,
      momentum: body.momentum ?? null,
      volatility: body.volatility ?? null,
      changePct: body.changePct ?? null,
      threshold: body.threshold,
    });

    const enhancedExplanation = await enhanceSignalExplanation(
      {
        signal: result.signal,
        score: result.score,
        confidence: result.confidence,
        explanation: result.explanation,
      },
      { enabled: body.useLlmEnhancer === true },
    );

    return Response.json({
      data: {
        signal: result.signal,
        confidence: result.confidence,
        score: result.score,
        indicatorsUsed: result.usedIndicators,
        explanation: enhancedExplanation ?? result.explanation,
        ruleExplanation: result.explanation,
        threshold: result.threshold,
        activeRules: result.activeRules,
      },
    });
  } catch {
    return Response.json(
      {
        error: 'No se pudo calcular la señal',
      },
      { status: 500 },
    );
  }
}
