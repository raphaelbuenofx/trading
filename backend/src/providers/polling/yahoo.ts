import type { ProviderMappedAsset } from '@/backend/src/providers';

const yahooSymbolMap: Record<string, string> = {
  'EUR/USD': 'EURUSD=X',
  'USD/JPY': 'JPY=X',
  'SPX/USD': '^GSPC',
  'NDX/USD': '^NDX',
  'AAPL/USD': 'AAPL',
  'NVDA/USD': 'NVDA',
  'XAU/USD': 'GC=F',
  'WTI/USD': 'CL=F',
};

const syntheticBasePrices: Record<string, number> = {
  'EUR/USD': 1.08,
  'USD/JPY': 151,
  'SPX/USD': 5200,
  'NDX/USD': 18200,
  'AAPL/USD': 185,
  'NVDA/USD': 900,
  'XAU/USD': 2300,
  'WTI/USD': 79,
};

const lastSyntheticPrices = new Map<string, number>();

export async function fetchPollingTick(asset: ProviderMappedAsset): Promise<{ price: number; volume?: number }> {
  const yahooSymbol = yahooSymbolMap[asset.symbol];

  if (!yahooSymbol) {
    return buildSynthetic(asset.symbol);
  }

  const response = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`,
    {
      headers: {
        'User-Agent': 'market-hub/1.0',
      },
    }
  );

  if (!response.ok) {
    return buildSynthetic(asset.symbol);
  }

  const data = (await response.json()) as {
    quoteResponse?: {
      result?: Array<{
        regularMarketPrice?: number;
        regularMarketVolume?: number;
      }>;
    };
  };

  const quote = data.quoteResponse?.result?.[0];
  if (!quote?.regularMarketPrice) {
    return buildSynthetic(asset.symbol);
  }

  return {
    price: quote.regularMarketPrice,
    volume: quote.regularMarketVolume,
  };
}

function buildSynthetic(symbol: string): { price: number } {
  const current = lastSyntheticPrices.get(symbol) ?? syntheticBasePrices[symbol] ?? 100;
  const drift = (Math.random() - 0.5) * current * 0.0015;
  const next = Math.max(current + drift, 0.0001);
  lastSyntheticPrices.set(symbol, next);

  return { price: Number(next.toFixed(6)) };
}
