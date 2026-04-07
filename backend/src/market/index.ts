/**
 * Normalización de ticks/velas para convertir payloads de proveedores
 * al contrato compartido en `shared/types.ts`.
 */
export const MARKET_NORMALIZATION_VERSION = 'v1';

export { MarketHub } from './MarketHub';
export type { MarketHubOptions, MarketHubProviderState, MarketHubUpdate } from './MarketHub';
