export interface LlmEnhancerInput {
  signal: string;
  score: number;
  confidence: number;
  explanation: string;
}

export interface LlmEnhancerOptions {
  model?: string;
  endpoint?: string;
  enabled?: boolean;
}

export async function enhanceSignalExplanation(
  input: LlmEnhancerInput,
  options: LlmEnhancerOptions = {},
): Promise<string | null> {
  if (!options.enabled) {
    return null;
  }

  const endpoint = options.endpoint ?? process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434/api/generate';
  const model = options.model ?? process.env.OLLAMA_MODEL ?? 'llama3';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        prompt: [
          'Resume en una sola frase clara para trader minorista.',
          'No inventes datos, solo reescribe.',
          `Señal: ${input.signal}`,
          `Score: ${input.score}`,
          `Confianza: ${input.confidence}`,
          `Base: ${input.explanation}`,
        ].join('\n'),
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { response?: string };
    const text = payload.response?.trim();

    return text ? text : null;
  } catch {
    return null;
  }
}
