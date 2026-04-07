/**
 * Capa API:
 * - REST para consultas puntuales
 * - WebSocket para estado en vivo del frontend
 */
export const API_MODULE = {
  rest: true,
  websocket: true,
  endpoints: {
    assets: {
      path: '/assets',
      method: 'GET',
      description:
        'Devuelve el catálogo habilitado de activos con metadata de categoría, proveedor y soporte de streaming.',
    },
    history: {
      path: '/assets/:symbol/history?timeframe=1H|4H|1D|1W|1M',
      method: 'GET',
      description:
        'Devuelve velas históricas OHLC, indicadores agregados y señal actual para el símbolo solicitado.',
    },
    signalHistory: {
      path: '/assets/:symbol/signals/history?limit=N',
      method: 'GET',
      description: 'Entrega las últimas N señales generadas para el activo.',
    },
    stream: {
      path: '/stream',
      method: 'WS',
      description:
        'Canal en vivo con payload normalizado por activo y eventos de estado de proveedor (up/degraded/down).',
    },
  },
};

export { startStreamServer } from './streamServer';
