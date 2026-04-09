import symbolsConfig from '@/config/symbols.json';

/**
 * Adaptadores por proveedor/API externa.
 * Cada proveedor debe exponer una interfaz común para obtener ticks/velas.
 */
export interface MarketDataProvider {
  name: string;
  fetchTick(symbol: string): Promise<unknown>;
  fetchCandles(symbol: string, interval: string, limit: number): Promise<unknown[]>;
}

export type AssetCategory = keyof typeof symbolsConfig;

export interface ProviderMappedAsset {
  symbol: string;
  name: string;
  category: AssetCategory;
  provider: string;
  providerSymbol: string;
  supportsStreaming: boolean;
}

export function getProviderMappedAssets(
  preferredProviderByCategory: Partial<Record<AssetCategory, string>> = {}
): ProviderMappedAsset[] {
  const categories = Object.entries(symbolsConfig) as Array<
    [AssetCategory, (typeof symbolsConfig)[AssetCategory]]
  >;

  return categories.flatMap(([category, assets]) => {
    const preferredProvider = preferredProviderByCategory[category];

    return assets
      .filter((asset) => asset.enabled)
      .map((asset) => {
        const providers = asset.providers as Record<string, string>;
        const streaming = asset.streaming as Record<string, boolean>;

        const provider = preferredProvider && providers[preferredProvider] ? preferredProvider : Object.keys(providers)[0];

        return {
          symbol: asset.symbol,
          name: asset.name,
          category,
          provider,
          providerSymbol: providers[provider],
          supportsStreaming: Boolean(streaming[provider]),
        };
      });
  });
}
