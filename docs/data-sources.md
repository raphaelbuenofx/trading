# Fuentes de datos

Resumen operativo de proveedores usados por el proyecto, modo de integración, latencia esperada y restricciones típicas de planes gratuitos.

| Categoría | Proveedor | Modo | Latencia esperada | Restricciones de plan gratuito |
|---|---|---|---|---|
| Crypto | Binance | WebSocket (`@trade`) | Muy baja (sub-segundo a pocos segundos según red) | Límites de conexiones WS por IP/cuenta, políticas anti-abuso y posibles desconexiones forzadas. |
| Forex | Yahoo Finance (quote endpoint) | Polling HTTP | Media (segundos; depende de intervalo configurado) | Sin SLA formal para uso intensivo, posibles bloqueos/rate-limit y cobertura variable por par. |
| Índices | Yahoo Finance (quote endpoint) | Polling HTTP | Media (segundos; no tick-by-tick) | Posible retraso en índices, datos parciales en sesiones extendidas, límite implícito por tráfico. |
| Stocks | Yahoo Finance (quote endpoint) | Polling HTTP | Media (segundos) | Datos gratis no orientados a trading de alta frecuencia; posible delay y respuestas intermitentes. |
| Commodities | Yahoo Finance (futuros/commodities) | Polling HTTP | Media (segundos) | Cobertura desigual por símbolo; contratos específicos pueden no estar disponibles en todo momento. |
| Cualquier categoría (fallback) | Generador sintético interno | Cálculo local | Muy baja local | No representa mercado real; sólo continuidad cuando falla el proveedor externo. |

## Notas de implementación actual

- La selección de símbolos y proveedores por activo se define en `config/symbols.json`.
- El `MarketHub` usa Binance WS para `crypto` y polling para el resto de categorías.
- El polling actual consulta Yahoo y, ante fallo, cae automáticamente a precio sintético.
