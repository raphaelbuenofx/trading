'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetCatalogItem, MarketStreamEvent, ProviderState, StreamAssetUpdate } from '@/shared/types';

interface AssetsResponse {
  assets: AssetCatalogItem[];
  total: number;
}

type LiveStateBySymbol = Record<string, StreamAssetUpdate>;
type PriceHistoryBySymbol = Record<string, number[]>;
type ProviderStateMap = Record<string, { state: ProviderState; message?: string | null; latencyMs?: number }>;
type SignalLabel = 'Alcista' | 'Bajista' | 'Neutral';

interface SignalInsight {
  signal: SignalLabel;
  confidence: number;
  score: number;
  momentum: number;
  trend: number;
  volatility: number;
  rsi: number | null;
  explanation: string;
  analysis: string[];
}

const STREAM_PORT = process.env.NEXT_PUBLIC_STREAM_PORT ?? '4500';
const STREAM_URL = `ws://localhost:${STREAM_PORT}/stream`;
const APP_NAME = 'PulseTrade AI Desk';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length === 0) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function calculateRsi(prices: number[], period = 14) {
  if (prices.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let index = prices.length - period; index < prices.length; index += 1) {
    const delta = prices[index] - prices[index - 1];
    if (delta > 0) gains += delta;
    if (delta < 0) losses -= delta;
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

function createSignalInsight(prices: number[]): SignalInsight {
  const latest = prices.at(-1) ?? 0;
  const previous = prices.at(-2) ?? latest;
  const priceChangePct = previous === 0 ? 0 : ((latest - previous) / previous) * 100;

  const returns = prices.slice(1).map((price, index) => {
    const prev = prices[index];
    if (!prev) return 0;
    return ((price - prev) / prev) * 100;
  });

  const momentum = returns.slice(-5).length > 0 ? average(returns.slice(-5)) : priceChangePct;
  const shortWindow = prices.slice(-5);
  const longWindow = prices.slice(-20);
  const smaShort = shortWindow.length > 0 ? average(shortWindow) : latest;
  const smaLong = longWindow.length > 0 ? average(longWindow) : latest;
  const trend = smaLong === 0 ? 0 : ((smaShort - smaLong) / smaLong) * 100;
  const volatility = standardDeviation(returns.slice(-12));
  const rsi = calculateRsi(prices, 14);

  let score = 0;
  score += clamp(momentum * 18, -35, 35);
  score += clamp(trend * 22, -35, 35);
  score += clamp(priceChangePct * 12, -20, 20);
  score += clamp((1.8 - volatility) * 8, -18, 18);

  if (rsi !== null) {
    if (rsi > 67) score += 10;
    else if (rsi < 33) score -= 10;
  }

  score = Number(clamp(score, -100, 100).toFixed(2));

  let signal: SignalLabel = 'Neutral';
  if (score >= 16) signal = 'Alcista';
  if (score <= -16) signal = 'Bajista';

  const confidence = Number(clamp(45 + Math.abs(score) * 0.52 + Math.max(0, 2 - volatility) * 6, 50, 96).toFixed(1));

  const trendBias = trend > 0.25 ? 'positiva' : trend < -0.25 ? 'negativa' : 'lateral';
  const momentumBias = momentum > 0.12 ? 'favorable' : momentum < -0.12 ? 'débil' : 'mixto';
  const volBias = volatility > 1.6 ? 'elevada' : volatility < 0.8 ? 'contenida' : 'moderada';

  let explanation = 'Movimiento lateral reciente, sin confirmación clara de ruptura y sesgo mixto.';
  if (signal === 'Alcista') {
    explanation = `Momentum ${momentumBias}, tendencia ${trendBias} y estructura compradora sostienen sesgo alcista de corto plazo.`;
  }
  if (signal === 'Bajista') {
    explanation = `Debilidad del impulso, tendencia ${trendBias} y presión vendedora sugieren sesgo bajista inmediato.`;
  }

  const analysis = [
    `El activo mantiene una estructura ${signal === 'Neutral' ? 'de consolidación' : signal.toLowerCase()} en el corto plazo con sesgo ${trendBias}.`,
    `La volatilidad ${volBias} ${volatility > 1.6 ? 'exige gestión de riesgo más estricta.' : 'permite lecturas técnicas más limpias.'}`,
    rsi === null
      ? 'Señal basada en precio reciente y cruce de medias al no contar con RSI suficiente.'
      : `RSI en ${rsi.toFixed(1)} refleja un contexto ${rsi > 70 ? 'sobrecomprado' : rsi < 30 ? 'sobrevendido' : 'equilibrado'} sin perder la referencia direccional.`,
  ].slice(0, signal === 'Neutral' ? 2 : 3);

  return {
    signal,
    confidence,
    score,
    momentum,
    trend,
    volatility,
    rsi,
    explanation,
    analysis,
  };
}

function signalClassName(signal: SignalLabel) {
  if (signal === 'Alcista') return 'text-emerald-300 bg-emerald-500/15 border-emerald-400/40';
  if (signal === 'Bajista') return 'text-rose-300 bg-rose-500/15 border-rose-400/40';
  return 'text-amber-200 bg-amber-500/15 border-amber-400/40';
}

export default function Home() {
  const [assets, setAssets] = useState<AssetCatalogItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [liveBySymbol, setLiveBySymbol] = useState<LiveStateBySymbol>({});
  const [providerStates, setProviderStates] = useState<ProviderStateMap>({});
  const [historyBySymbol, setHistoryBySymbol] = useState<PriceHistoryBySymbol>({});
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
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
      if (unmounted) return;

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
            setLiveBySymbol((current) => ({ ...current, [payload.symbol]: payload }));
            setHistoryBySymbol((current) => {
              const previous = current[payload.symbol] ?? [];
              return {
                ...current,
                [payload.symbol]: [...previous, payload.price].slice(-80),
              };
            });
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
        if (unmounted) return;

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
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  const categories = useMemo(() => ['all', ...new Set(assets.map((asset) => asset.category))], [assets]);

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

  const enrichedAssets = useMemo(() => {
    return filteredAssets.map((asset) => {
      const live = liveBySymbol[asset.symbol];
      const history = historyBySymbol[asset.symbol] ?? (live ? [live.price] : []);
      const insight = createSignalInsight(history.length > 1 ? history : [live?.price ?? 100, live?.price ?? 100]);

      return {
        asset,
        live,
        insight,
        providerStatus: providerStates[asset.provider],
      };
    });
  }, [filteredAssets, historyBySymbol, liveBySymbol, providerStates]);

  const featured = useMemo(() => {
    return [...enrichedAssets].sort((a, b) => b.insight.confidence - a.insight.confidence).slice(0, 3);
  }, [enrichedAssets]);

  const marketBrief = useMemo(() => {
    if (enrichedAssets.length === 0) {
      return 'Cargando cobertura de mercado en tiempo real para generar el brief del día.';
    }

    const bullish = enrichedAssets.filter((entry) => entry.insight.signal === 'Alcista').length;
    const bearish = enrichedAssets.filter((entry) => entry.insight.signal === 'Bajista').length;
    const avgConfidence = average(enrichedAssets.map((entry) => entry.insight.confidence));

    if (bullish > bearish + 2) {
      return `Tono risk-on: predomina la rotación alcista con convicción media de ${avgConfidence.toFixed(1)}%.`;
    }

    if (bearish > bullish + 2) {
      return `Sesgo defensivo: lectura risk-off con presión vendedora en varios frentes y confianza ${avgConfidence.toFixed(1)}%.`;
    }

    return `Mercado mixto: equilibrio entre flujos compradores y vendedores, convicción agregada ${avgConfidence.toFixed(1)}%.`;
  }, [enrichedAssets]);

  const topBullish = useMemo(
    () => [...enrichedAssets].filter((entry) => entry.insight.signal === 'Alcista').sort((a, b) => b.insight.confidence - a.insight.confidence).slice(0, 4),
    [enrichedAssets],
  );

  const topBearish = useMemo(
    () => [...enrichedAssets].filter((entry) => entry.insight.signal === 'Bajista').sort((a, b) => b.insight.confidence - a.insight.confidence).slice(0, 4),
    [enrichedAssets],
  );

  const selectedAsset = useMemo(() => enrichedAssets.find((entry) => entry.asset.symbol === selectedSymbol) ?? null, [enrichedAssets, selectedSymbol]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="dashboard-shell mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[250px_1fr]">
        <aside className="glass-panel rounded-2xl p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">AI Trading Terminal</p>
          <h1 className="mt-2 text-2xl font-semibold">{APP_NAME}</h1>
          <nav className="mt-8 space-y-2">
            {['Dashboard', 'Markets', 'Signals', 'Watchlist', 'Reports', 'Settings'].map((item, index) => (
              <button key={item} className={`nav-pill w-full text-left ${index === 0 ? 'active' : ''}`} type="button">
                {item}
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3 text-xs text-slate-300">
            <p className="font-semibold text-cyan-200">Estado del stream</p>
            <p className={socketStatus === 'connected' ? 'text-emerald-300' : 'text-amber-300'}>{socketStatus}</p>
            <p className="mt-1 text-slate-400">{STREAM_URL}</p>
          </div>
        </aside>

        <section className="space-y-4">
          <header className="glass-panel rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Market Command Center</p>
                <h2 className="text-xl font-semibold">Panel premium de señales y flujo</h2>
              </div>
              <div className="flex gap-2 text-xs">
                {['Asia', 'London', 'New York'].map((session) => (
                  <span key={session} className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-slate-300">
                    {session}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
                <p className="text-slate-400">Proveedores monitoreados</p>
                <p className="mt-1 text-lg font-semibold">{Object.keys(providerStates).length || '0'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
                <p className="text-slate-400">Última actualización</p>
                <p className="mt-1 text-lg font-semibold">{new Date().toLocaleTimeString()}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm">
                <p className="text-slate-400">Resumen AI</p>
                <p className="mt-1 text-sm text-cyan-200">{marketBrief}</p>
              </div>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <section className="glass-panel rounded-2xl p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">AI Macro Desk</h3>
                <input
                  className="w-full max-w-xs rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm outline-none transition focus:border-cyan-400"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar símbolo, nombre o proveedor"
                  type="search"
                />
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      selectedCategory === category
                        ? 'bg-cyan-400 text-slate-950'
                        : 'border border-slate-700 bg-slate-900/70 text-slate-300 hover:border-cyan-500/40'
                    }`}
                    onClick={() => setSelectedCategory(category)}
                    type="button"
                  >
                    {category.toUpperCase()}
                  </button>
                ))}
              </div>

              {error ? <p className="mb-3 rounded-xl bg-rose-500/10 p-2 text-sm text-rose-300">{error}</p> : null}

              <div className="grid gap-3 md:grid-cols-2">
                {enrichedAssets.map(({ asset, live, insight, providerStatus }) => (
                  <article
                    key={`${asset.symbol}-${asset.provider}`}
                    className="asset-card cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-cyan-500/40"
                    onClick={() => setSelectedSymbol(asset.symbol)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-slate-400">{asset.category}</p>
                        <h4 className="text-lg font-semibold">{asset.symbol}</h4>
                        <p className="text-xs text-slate-400">{asset.name}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${signalClassName(insight.signal)}`}>
                        {insight.signal}
                      </span>
                    </div>

                    <p className="mt-3 text-2xl font-semibold text-cyan-100">{live ? live.price.toLocaleString() : 'Esperando...'}</p>
                    <p className="text-xs text-slate-400">Proveedor: {asset.provider} · {asset.supportsStreaming ? 'Streaming' : 'Polling'}</p>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                        <span>Confianza</span>
                        <span>{insight.confidence}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            insight.signal === 'Alcista' ? 'bg-emerald-400' : insight.signal === 'Bajista' ? 'bg-rose-400' : 'bg-amber-300'
                          }`}
                          style={{ width: `${insight.confidence}%` }}
                        />
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-slate-200">{insight.explanation}</p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-400">
                      {insight.analysis.map((line) => (
                        <li key={line}>• {line}</li>
                      ))}
                    </ul>

                    {providerStatus?.state === 'degraded' ? (
                      <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                        Proveedor degradado: {providerStatus.message ?? 'latencia o fallos transitorios'}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="glass-panel rounded-2xl p-4">
                <h3 className="text-base font-semibold">For You · Market Brief</h3>
                <p className="mt-2 text-sm text-slate-300">{marketBrief}</p>
              </section>

              <section className="glass-panel rounded-2xl p-4">
                <h3 className="text-base font-semibold">Capital Flow Snapshot</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-emerald-300">Más fuertes</p>
                  {topBullish.map(({ asset, insight }) => (
                    <div key={`bull-${asset.symbol}`} className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2">
                      <span>{asset.symbol}</span>
                      <span>{insight.confidence}%</span>
                    </div>
                  ))}
                  <p className="pt-2 text-rose-300">Más débiles</p>
                  {topBearish.map(({ asset, insight }) => (
                    <div key={`bear-${asset.symbol}`} className="flex items-center justify-between rounded-lg bg-rose-500/10 px-3 py-2">
                      <span>{asset.symbol}</span>
                      <span>{insight.confidence}%</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="glass-panel rounded-2xl p-4">
                <h3 className="text-base font-semibold">Featured Signals</h3>
                <div className="mt-2 space-y-2">
                  {featured.map(({ asset, insight }) => (
                    <div key={`featured-${asset.symbol}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <p className="text-sm font-medium">{asset.symbol}</p>
                      <p className="text-xs text-slate-400">{insight.signal} · {insight.confidence}%</p>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>

      {selectedAsset ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 p-4 md:items-center">
          <section className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-cyan-500/10">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Detalle AI</p>
                <h4 className="text-2xl font-semibold">{selectedAsset.asset.symbol}</h4>
                <p className="text-sm text-slate-400">{selectedAsset.asset.name}</p>
              </div>
              <button className="rounded-lg border border-slate-700 px-3 py-1 text-sm" onClick={() => setSelectedSymbol(null)} type="button">
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs text-slate-400">Precio actual</p>
                <p className="text-xl font-semibold text-cyan-100">
                  {selectedAsset.live ? selectedAsset.live.price.toLocaleString() : 'Esperando precio'}
                </p>
                <p className="text-xs text-slate-400">Proveedor: {selectedAsset.asset.provider}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs text-slate-400">Señal y confianza</p>
                <p className="text-xl font-semibold">{selectedAsset.insight.signal}</p>
                <p className="text-sm text-slate-300">{selectedAsset.insight.confidence}% de confianza</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-slate-200">{selectedAsset.insight.explanation}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-400">
              {selectedAsset.insight.analysis.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-slate-500">Actualizado: {new Date(selectedAsset.live?.timestamp ?? Date.now()).toLocaleString()}</p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
