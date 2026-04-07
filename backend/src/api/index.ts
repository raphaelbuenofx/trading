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
    stream: {
      path: '/stream',
      method: 'WS',
      description:
        'Canal en vivo con payload normalizado por activo y eventos de estado de proveedor (up/degraded/down).',
    },
  },
};

export { startStreamServer } from './streamServer';
