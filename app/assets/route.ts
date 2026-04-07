import { getProviderMappedAssets } from '@/backend/src/providers';

const preferredProviders = {
  crypto: 'binance',
  forex: 'oanda',
  indices: 'polygon',
  stocks: 'alpaca',
  commodities: 'oanda',
} as const;

export async function GET() {
  const assets = getProviderMappedAssets(preferredProviders);

  return Response.json({
    assets,
    total: assets.length,
  });
}
