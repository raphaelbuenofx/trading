# Trading Hub (Next.js + Market Stream)

Plataforma de monitoreo de mercados con catálogo multi-activo, streaming en vivo para cripto y polling para el resto de categorías.

## Arquitectura final

```text
┌──────────────────────────┐
│ Frontend Next.js (App)   │
│ - app/page.tsx           │
│ - app/assets/route.ts    │
│ - app/api/signals/route  │
└─────────────┬────────────┘
              │ HTTP + WS
              ▼
┌──────────────────────────┐
│ Backend Market Stream    │
│ backend/src/api          │
│ - /assets (catálogo)     │
│ - /assets/:symbol/history│
│ - /stream (WebSocket)    │
└─────────────┬────────────┘
              │
              ▼
┌──────────────────────────────────────────┐
│ Capa de mercado (MarketHub)             │
│ - Enruta por categoría/proveedor         │
│ - Emite assetUpdate + providerState      │
└─────────────┬────────────────────────────┘
              │
   ┌──────────┴──────────┬─────────────────┐
   ▼                     ▼                 ▼
Binance WS          Yahoo polling     Fallback sintético
(crypto)            (resto categorías) (si API falla)
```

### Componentes

- **Configuración de símbolos:** `config/symbols.json` define categorías, símbolos habilitados y proveedores por activo.
- **Normalización de activos:** `backend/src/providers/index.ts` convierte la configuración en un catálogo uniforme.
- **Motor de mercado:** `backend/src/market/MarketHub.ts` decide modo WS/polling y emite eventos normalizados.
- **Servidor de stream:** `backend/src/api/streamServer.ts` expone endpoints HTTP y WS.
- **UI en vivo:** `app/page.tsx` consume `/assets` y `ws://.../stream`, mostrando estado de socket y proveedores.
- **Señales + IA opcional:** `app/api/signals/route.ts` calcula señales; `backend/src/signals/llmEnhancer.ts` habilita enriquecimiento con Ollama cuando se activa.

## Requisitos previos

- Node.js 20+
- npm 10+
- Conexión saliente a internet para:
  - `stream.binance.com` (WS cripto)
  - `query1.finance.yahoo.com` (quotes polling)
- (Opcional) Ollama local o remoto para explicación LLM de señales.

## Instalación

```bash
npm install
```

## Variables de entorno

Copia el archivo de ejemplo y ajusta valores:

```bash
cp .env.example .env.local
```

Variables disponibles (detalle completo en `.env.example`):

- Puertos (`MARKET_STREAM_PORT`, `NEXT_PUBLIC_STREAM_PORT`)
- Backend URL para páginas legacy (`NEXT_PUBLIC_BACKEND_URL`)
- Intervalos de polling por categoría
- Toggles por proveedor/canal
- Flags de Ollama opcional

## Arranque backend / frontend

### 1) Backend de stream (WS + endpoints de mercado)

```bash
MARKET_STREAM_PORT=4500 npx tsx backend/src/api/start-stream.ts
```

> Si no tienes `tsx` global, usa `npx` como arriba.

### 2) Frontend Next.js

```bash
NEXT_PUBLIC_STREAM_PORT=4500 npm run dev
```

Abrir en navegador: `http://localhost:3003`.

## UI premium AI terminal

El frontend fue rediseñado como terminal AI local-first:

- Sidebar con navegación (Dashboard, Markets, Signals, Watchlist, Reports, Settings).
- Header de estado con sesiones de mercado y resumen de tono AI.
- Tarjetas enriquecidas por activo con:
  - señal (`Alcista` / `Bajista` / `Neutral`)
  - confianza (%)
  - explicación breve en español
  - 1-3 frases de análisis técnico AI-style
- Paneles de apoyo: Featured Signals, Market Brief, Capital Flow Snapshot.
- Modal de detalle por activo al hacer click.

El motor de señal es local y rule-based (sin APIs pagas obligatorias), evaluando momentum, tendencia de medias, RSI y volatilidad.

## Flujo de datos por proveedor

### Crypto (Binance, WS)

1. `MarketHub` selecciona `binance` para categoría `crypto`.
2. `BinanceWsProvider` abre `wss://stream.binance.com:9443/ws/<symbol>@trade`.
3. Cada trade se normaliza a `assetUpdate`.
4. El servidor WS reenvía evento al frontend.
5. UI actualiza precio en tiempo real y estado del proveedor.

### Forex / Índices / Stocks / Commodities (polling)

1. `MarketHub` crea `PollingMarketDataProvider` por activo.
2. `fetchPollingTick` consulta Yahoo Finance Quote API.
3. Si falla Yahoo o no existe mapeo, se genera precio sintético.
4. Se emite `providerState` (`up`/`degraded`) con latencia.
5. Frontend muestra warning en degradación.

## Limitaciones de datos gratis por mercado

> Los límites exactos dependen del proveedor/plan y pueden cambiar sin aviso. Esta tabla describe el comportamiento esperado del proyecto hoy.

- **Crypto (Binance WS):** muy baja latencia para trades, pero sujeto a límites de conexiones y políticas anti-abuso del exchange.
- **Forex/Índices/Stocks/Commodities (Yahoo polling):**
  - no es feed tick-by-tick institucional,
  - puede tener retraso o gaps en horario extendido,
  - puede devolver errores intermitentes o datos incompletos en picos de tráfico.
- **Fallback sintético:** evita “pantalla vacía”, pero **no** representa mercado real; es sólo continuidad visual.

## Troubleshooting

### 1) Reconexión WS constante

**Síntomas:** estado `disconnected/connecting` repetidamente.

**Acciones:**

- Verifica que el backend esté corriendo en el mismo puerto que `NEXT_PUBLIC_STREAM_PORT`.
- Confirma acceso a `wss://stream.binance.com` (firewall/proxy corporativo).
- Revisa logs del backend: al caer Binance, el provider se marca `degraded` y reintenta automáticamente.

### 2) Rate limits o degradación de proveedor

**Síntomas:** mensajes `degraded`, latencia alta, saltos en precio.

**Acciones:**

- Aumenta intervalos de polling por categoría (reduce presión sobre APIs gratis).
- Desactiva proveedores no críticos vía toggles en `.env`.
- Considera cache temporal o consolidar requests por símbolo.

### 3) Proveedor caído / sin datos

**Síntomas:** activo sin updates o precio congelado.

**Acciones:**

- Revisa si el símbolo tiene mapeo válido en `config/symbols.json`.
- Si Yahoo responde error, el sistema cae a precio sintético (esperable).
- Cambia proveedor preferido por categoría en `MarketHub` cuando exista integración real alternativa.

### 4) Ollama opcional no responde

**Síntomas:** señal sin explicación enriquecida.

**Acciones:**

- Verifica `OLLAMA_ENABLED=true` y endpoint/modelo correctos.
- Comprueba conectividad a `OLLAMA_ENDPOINT`.
- Si falla, el sistema mantiene explicación por reglas (fallback seguro).

## Documentación adicional

- Matriz de fuentes: `docs/data-sources.md`
- Tipos compartidos: `shared/types.ts`
