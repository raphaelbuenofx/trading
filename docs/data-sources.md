# Fuentes de datos

## Proveedores objetivo
- Exchange/market APIs para ticks y velas OHLCV.
- Servicios secundarios para metadata (market cap, categorías y símbolos).

## Estrategia de integración
- Adaptadores por proveedor en `backend/src/providers`.
- Normalización central en `backend/src/market`.
- Contratos de transporte en `shared/types.ts`.

## Limitaciones conocidas
- Latencia y límites de rate limit por proveedor.
- Cobertura desigual de símbolos por mercado/categoría.
- Posibles desviaciones entre proveedores para el mismo activo.
- Dependencia de conectividad para actualización en vivo (WS).
