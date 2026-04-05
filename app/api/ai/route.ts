export async function POST(req: Request) {
  try {
    const { price } = await req.json();

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      body: JSON.stringify({
        model: "llama3",
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

    const data = await response.json();
console.log("RAW IA:", data.response);
    let parsed;

    try {
      parsed = JSON.parse(data.response);
    } catch {
      // 👇 fallback SIEMPRE SEGURO
      parsed = {
        sentiment: "Neutral",
        reason: String(data.response),
        confidence: 50,
      };
    }
    
try {
  parsed = JSON.parse(data.response);
} catch {
  const match = data.response.match(/\{[\s\S]*\}/);

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
    sentiment: "Neutral",
    reason: String(data.response),
    confidence: 50,
  };
}

return Response.json({
  data: {
    sentiment: parsed.sentiment || parsed.Sentiment || "Neutral",
    reason: parsed.reason || parsed.Reason || "No reason",
    confidence: parsed.confidence || parsed.Confidence || 50,
  },
});
  } catch (error) {
    return Response.json({
      data: {
        sentiment: "Neutral",
        reason: "Error IA",
        confidence: 50,
      },
    });
  }
}