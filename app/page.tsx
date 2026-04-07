'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetCatalogItem, MarketStreamEvent, ProviderState, StreamAssetUpdate } from '@/shared/types';

interface AssetsResponse {
  assets: AssetCatalogItem[];
  total: number;
}

type LiveStateBySymbol = Record<string, StreamAssetUpdate>;

type ProviderStateMap = Record<string, { state: ProviderState; message?: string | null; latencyMs?: number }>;

const STREAM_PORT = process.env.NEXT_PUBLIC_STREAM_PORT ?? '4500';
const STREAM_URL = `ws://localhost:${STREAM_PORT}/stream`;

export default function Home() {
  const [assets, setAssets] = useState<AssetCatalogItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [liveBySymbol, setLiveBySymbol] = useState<LiveStateBySymbol>({});
  const [providerStates, setProviderStates] = useState<ProviderStateMap>({});
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    let socket: WebSocket | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) {
        return;
      }

      setSocketStatus('connecting');
      socket = new WebSocket(STREAM_URL);

      socket.onopen = () => {
        reconnectAttempts.current = 0;
        setSocketStatus('connected');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as MarketStreamEvent;

          if (payload.type === 'assetUpdate') {
            setLiveBySymbol((current) => ({
              ...current,
              [payload.symbol]: payload,
            }));
            return;
          }

          if (payload.type === 'providerState') {
            setProviderStates((current) => ({
              ...current,
              [payload.provider]: {
                state: payload.state,
                message: payload.message,
                latencyMs: payload.latencyMs,
              },
            }));
          }
        } catch {
          setError('Se recibió un payload WS inválido.');
        }
      };

      socket.onclose = () => {
        if (unmounted) {
          return;
        }

        setSocketStatus('disconnected');

        reconnectAttempts.current += 1;
        const delayMs = Math.min(1_000 * 2 ** reconnectAttempts.current, 30_000);

        reconnectTimer.current = setTimeout(connect, delayMs);
      };

      socket.onerror = () => {
        setSocketStatus('disconnected');
      };
    };

    connect();

    return () => {
      unmounted = true;
      socket?.close();

      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
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

        <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm">
          <p>
            Stream: <strong>{STREAM_URL}</strong>
          </p>
          <p>
            Estado WS:{' '}
            <span className={socketStatus === 'connected' ? 'text-green-400' : 'text-yellow-300'}>
              {socketStatus}
            </span>
          </p>
        </div>

        <div className="grid gap-2 rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(providerStates).map(([provider, state]) => (
            <p key={provider}>
              <strong>{provider}</strong>:{' '}
              <span className={state.state === 'up' ? 'text-green-400' : 'text-yellow-300'}>{state.state}</span>
              {state.latencyMs ? ` (${state.latencyMs}ms)` : ''}
              {state.message ? ` - ${state.message}` : ''}
            </p>
          ))}
          {Object.keys(providerStates).length === 0 ? <p>Esperando estado de proveedores...</p> : null}
        </div>

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
          {filteredAssets.map((asset) => {
            const live = liveBySymbol[asset.symbol];
            const providerStatus = providerStates[asset.provider];

            return (
              <article key={`${asset.symbol}-${asset.provider}`} className="rounded-xl bg-gray-900 p-4">
                <p className="text-sm uppercase text-gray-400">{asset.category}</p>
                <h2 className="text-lg font-bold">{asset.symbol}</h2>
                <p className="text-sm text-gray-300">{asset.name}</p>
                <p className="mt-2 text-sm">Proveedor: {asset.provider}</p>
                <p className="text-sm text-gray-400">Símbolo proveedor: {asset.providerSymbol}</p>
                <p className="mt-2 text-sm font-semibold text-green-400">
                  Streaming: {asset.supportsStreaming ? 'Sí' : 'No (polling)'}
                </p>
                <p className="mt-2 text-base font-bold text-blue-300">
                  {live ? `Precio: ${live.price.toLocaleString()}` : 'Precio: esperando...'}
                </p>
                <p className="text-xs text-gray-400">
                  {live ? `Último update: ${new Date(live.timestamp).toLocaleTimeString()}` : 'Sin updates aún'}
                </p>
                {providerStatus?.state === 'degraded' ? (
                  <p className="mt-2 rounded bg-yellow-900/40 p-2 text-xs text-yellow-200">
                    Proveedor degradado: {providerStatus.message ?? 'latencia o fallos transitorios'}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
