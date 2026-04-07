'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AssetCatalogItem } from '@/shared/types';

interface AssetsResponse {
  assets: AssetCatalogItem[];
  total: number;
}

export default function Home() {
  const [assets, setAssets] = useState<AssetCatalogItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAssets() {
      try {
        const response = await fetch('/assets');

        if (!response.ok) {
          throw new Error(`Error al cargar catálogo (${response.status})`);
        }

        const data = (await response.json()) as AssetsResponse;
        setAssets(data.assets);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Error inesperado');
      }
    }

    void loadAssets();
  }, []);

  const categories = useMemo(() => {
    return ['all', ...new Set(assets.map((asset) => asset.category))];
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const byCategory = selectedCategory === 'all' || asset.category === selectedCategory;
      const bySearch =
        normalizedSearch.length === 0 ||
        asset.symbol.toLowerCase().includes(normalizedSearch) ||
        asset.name.toLowerCase().includes(normalizedSearch) ||
        asset.provider.toLowerCase().includes(normalizedSearch);

      return byCategory && bySearch;
    });
  }, [assets, search, selectedCategory]);

  return (
    <main className="min-h-screen bg-black p-6 text-white">
      <section className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-3xl font-bold">Catálogo de Activos</h1>

        <input
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 outline-none focus:border-blue-400"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por símbolo, nombre o proveedor"
          type="search"
        />

        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedCategory === category
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
              onClick={() => setSelectedCategory(category)}
              type="button"
            >
              {category.toUpperCase()}
            </button>
          ))}
        </div>

        {error ? <p className="text-red-400">{error}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAssets.map((asset) => (
            <article key={`${asset.symbol}-${asset.provider}`} className="rounded-xl bg-gray-900 p-4">
              <p className="text-sm uppercase text-gray-400">{asset.category}</p>
              <h2 className="text-lg font-bold">{asset.symbol}</h2>
              <p className="text-sm text-gray-300">{asset.name}</p>
              <p className="mt-2 text-sm">Proveedor: {asset.provider}</p>
              <p className="text-sm text-gray-400">Símbolo proveedor: {asset.providerSymbol}</p>
              <p className="mt-2 text-sm font-semibold text-green-400">
                Streaming: {asset.supportsStreaming ? 'Sí' : 'No'}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
