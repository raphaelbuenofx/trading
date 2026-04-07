export async function POST(req: Request) {
  try {
    const { price } = await req.json();
    const endpoint = process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434/api/generate';
    const model = process.env.OLLAMA_MODEL ?? 'llama3';

    const response = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt: `Eres un analista financiero profesional.

Analiza el precio y da una opinión realista.

Responde SOLO en JSON válido:
{
  "sentiment": "Alcista/Bajista/Neutral",
  "reason": "explicación clara en máximo 12 palabras en español",
  "confidence": número del 1 al 100
}

Reglas:
- Responde SOLO en español
- No escribas nada fuera del JSON
- No agregues texto extra
- Sé específico (no digas 'precio alto')

Precio actual: ${price}`,
        stream: false,
      }),
    });

    const data = (await response.json()) as { response?: string };
    const raw = data.response ?? '';

    let parsed: { sentiment?: string; reason?: string; confidence?: number } | null = null;

    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = null;
        }
      }
    }

    if (!parsed) {
      parsed = {
        sentiment: 'Neutral',
        reason: raw || 'Respuesta no estructurada del modelo local',
        confidence: 50,
      };
    }

    return Response.json({
      data: {
        sentiment: parsed.sentiment ?? 'Neutral',
        reason: parsed.reason ?? 'No reason',
        confidence: parsed.confidence ?? 50,
      },
    });
  } catch {
    return Response.json({
      data: {
        sentiment: 'Neutral',
        reason: 'Error IA',
        confidence: 50,
      },
    });
  }
}
