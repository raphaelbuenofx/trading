export const symbolsByCategory = {
  forex: ['EURUSD', 'GBPUSD', 'USDJPY'],
  crypto: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  stocks: ['AAPL', 'MSFT', 'NVDA'],
  indices: ['SPX', 'NDX', 'DXY'],
} as const;

export type SymbolCategory = keyof typeof symbolsByCategory;
