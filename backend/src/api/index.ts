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
  },
};
