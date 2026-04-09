import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetHistoryResponse, AssetSignalHistoryEntry, Timeframe } from '@/shared/types';

const TIMEFRAMES: Timeframe[] = ['1H', '4H', '1D', '1W', '1M'];
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4500';

type ChartMode = 'candles' | 'line';

interface AssetDetailProps {
  symbol?: string;
}

interface LightweightChartsApi {
  createChart: (container: HTMLDivElement, options: Record<string, unknown>) => {
    remove: () => void;
    applyOptions: (opts: { width: number }) => void;
    timeScale: () => { fitContent: () => void };
    addCandlestickSeries: () => {
      setData: (data: Array<{ time: number; open: number; high: number; low: number; close: number }>) => void;
    };
    addLineSeries: (opts: { color: string; lineWidth: number }) => {
      setData: (data: Array<{ time: number; value: number }>) => void;
    };
  };
}

export default function AssetDetailPage({ symbol }: AssetDetailProps) {
  const resolvedSymbol = useMemo(() => {
    if (symbol) return symbol;
    if (typeof window === 'undefined') return 'BTC/USD';

    const segments = window.location.pathname.split('/').filter(Boolean);
    return decodeURIComponent(segments[segments.length - 1] ?? 'BTC/USD');
  }, [symbol]);

  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [chartMode, setChartMode] = useState<ChartMode>('candles');
  const [history, setHistory] = useState<AssetHistoryResponse | null>(null);
  const [signalHistory, setSignalHistory] = useState<AssetSignalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<{ remove: () => void; applyOptions: (opts: { width: number }) => void } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !history?.candles.length) return;

    chartRef.current?.remove();
    let disposed = false;

    const currentHistory = history;

    async function mountChart() {
      if (!chartContainerRef.current || !currentHistory) return;
      const lightweightCharts = await loadLightweightCharts();
      if (disposed || !chartContainerRef.current) return;

      const chart = lightweightCharts.createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 360,
        layout: {
          background: { color: '#0b1220' },
          textColor: '#d1d5db',
        },
        grid: {
          vertLines: { color: '#1f2937' },
          horzLines: { color: '#1f2937' },
        },
      });

      if (chartMode === 'candles') {
        const candleSeries = chart.addCandlestickSeries();
        candleSeries.setData(
          currentHistory.candles.map((candle) => ({
            time: toUtcTimestamp(candle.timestamp),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        );
      } else {
        const lineSeries = chart.addLineSeries({ color: '#60a5fa', lineWidth: 2 });
        lineSeries.setData(
          currentHistory.candles.map((candle) => ({
            time: toUtcTimestamp(candle.timestamp),
            value: candle.close,
          })),
        );
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;

      const onResize = () => {
        if (!chartContainerRef.current) return;
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      };

      window.addEventListener('resize', onResize);
      const previousRemove = chart.remove.bind(chart);
      chartRef.current = {
        ...chart,
        remove: () => {
          window.removeEventListener('resize', onResize);
          previousRemove();
        },
      };
    }

    mountChart().catch((chartError) => {
      if (!disposed) {
        setError(chartError instanceof Error ? chartError.message : 'No se pudo renderizar el chart');
      }
    });

    return () => {
      disposed = true;
      chartRef.current?.remove();
    };
  }, [history, chartMode]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const historyRes = await fetch(
          `${API_BASE_URL}/assets/${encodeURIComponent(resolvedSymbol)}/history?timeframe=${timeframe}`,
          { signal: controller.signal },
        );

        if (!historyRes.ok) {
          throw new Error(`No se pudo cargar histórico (${historyRes.status})`);
        }

        const historyPayload = (await historyRes.json()) as AssetHistoryResponse;
        setHistory(historyPayload);

        const signalRes = await fetch(
          `${API_BASE_URL}/assets/${encodeURIComponent(resolvedSymbol)}/signals/history?limit=12`,
          { signal: controller.signal },
        );

        if (signalRes.ok) {
          const signalPayload = (await signalRes.json()) as { items: AssetSignalHistoryEntry[] };
          setSignalHistory(signalPayload.items ?? []);
        } else {
          setSignalHistory([]);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, [resolvedSymbol, timeframe]);

  return (
    <div style={{ padding: 24, color: '#e5e7eb', background: '#020617', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Detalle de {resolvedSymbol}</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {TIMEFRAMES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTimeframe(item)}
            style={{
              borderRadius: 8,
              border: '1px solid #334155',
              padding: '6px 10px',
              background: timeframe === item ? '#1d4ed8' : '#0f172a',
              color: 'white',
            }}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setChartMode((prev) => (prev === 'candles' ? 'line' : 'candles'))}
          style={{ borderRadius: 8, border: '1px solid #334155', padding: '6px 10px', background: '#111827', color: 'white' }}
        >
          Modo: {chartMode === 'candles' ? 'Candles' : 'Línea'}
        </button>
      </div>

      {loading && <p>Cargando datos…</p>}
      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}

      {!loading && history && (
        <>
          {history.sourceStatus.missingSources.length > 0 && (
            <div style={{ marginBottom: 12, padding: 12, border: '1px solid #92400e', borderRadius: 8, background: '#451a03', color: '#fde68a' }}>
              <strong>Fallback de datos:</strong> {history.sourceStatus.message}
            </div>
          )}

          {history.candles.length > 0 ? (
            <div ref={chartContainerRef} style={{ width: '100%', marginBottom: 20 }} />
          ) : (
            <div style={{ padding: 24, border: '1px dashed #334155', borderRadius: 8 }}>No hay velas disponibles.</div>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <div style={{ border: '1px solid #334155', borderRadius: 10, padding: 12 }}>
              <h3>Indicadores</h3>
              {history.indicators ? (
                <ul>
                  <li>RSI: {history.indicators.rsi ?? 'N/A'}</li>
                  <li>MACD: {history.indicators.macd.macd ?? 'N/A'}</li>
                  <li>EMA 9/21: {history.indicators.ema[9] ?? 'N/A'} / {history.indicators.ema[21] ?? 'N/A'}</li>
                </ul>
              ) : (
                <p>Indicadores no disponibles para esta combinación.</p>
              )}
            </div>

            <div style={{ border: '1px solid #334155', borderRadius: 10, padding: 12 }}>
              <h3>Señal actual</h3>
              {history.signal ? <p>{history.signal.direction} · Score {history.signal.score}</p> : <p>Señal no disponible.</p>}
            </div>

            <div style={{ border: '1px solid #334155', borderRadius: 10, padding: 12 }}>
              <h3>Últimas señales</h3>
              {signalHistory.length ? (
                <ul style={{ maxHeight: 200, overflow: 'auto' }}>
                  {signalHistory.map((item) => (
                    <li key={item.generatedAt}>{new Date(item.generatedAt).toLocaleString()}: {item.direction} ({item.score})</li>
                  ))}
                </ul>
              ) : (
                <p>Sin historial de señales.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function toUtcTimestamp(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

async function loadLightweightCharts(): Promise<LightweightChartsApi> {
  if (typeof window === 'undefined') {
    throw new Error('Lightweight Charts sólo está disponible en navegador.');
  }

  const runtimeWindow = window as typeof window & { LightweightCharts?: LightweightChartsApi };

  if (runtimeWindow.LightweightCharts) {
    return runtimeWindow.LightweightCharts;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-lightweight-charts="true"]');

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Lightweight Charts')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js';
    script.async = true;
    script.dataset.lightweightCharts = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Lightweight Charts'));
    document.head.appendChild(script);
  });

  if (!runtimeWindow.LightweightCharts) {
    throw new Error('Lightweight Charts no quedó disponible tras cargar script.');
  }

  return runtimeWindow.LightweightCharts;
}
