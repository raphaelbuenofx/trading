/**
 * Adaptadores por proveedor/API externa.
 * Cada proveedor debe exponer una interfaz común para obtener ticks/velas.
 */
export interface MarketDataProvider {
  name: string;
  fetchTick(symbol: string): Promise<unknown>;
  fetchCandles(symbol: string, interval: string, limit: number): Promise<unknown[]>;
}
