import { EventEmitter } from 'node:events';

export interface BinanceTradeTick {
  provider: 'binance';
  providerSymbol: string;
  price: number;
  volume: number;
  timestamp: string;
}

interface BinanceTradeMessage {
  e: string;
  s: string;
  p: string;
  q: string;
  T: number;
}

/**
 * Streaming gratuito de Binance para trades en vivo.
 */
export class BinanceWsProvider extends EventEmitter {
  readonly provider = 'binance';
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = true;

  constructor(private readonly providerSymbol: string) {
    super();
  }

  start() {
    this.shouldReconnect = true;
    this.connect();
  }

  stop() {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.socket?.close();
    this.socket = null;
  }

  private connect() {
    const normalized = this.providerSymbol.toLowerCase();
    const streamUrl = `wss://stream.binance.com:9443/ws/${normalized}@trade`;

    this.socket = new WebSocket(streamUrl);

    this.socket.addEventListener('open', () => {
      this.emit('providerState', { provider: this.provider, state: 'up' as const, message: null });
    });

    this.socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as BinanceTradeMessage;
        if (payload.e !== 'trade') {
          return;
        }

        const tick: BinanceTradeTick = {
          provider: 'binance',
          providerSymbol: payload.s,
          price: Number(payload.p),
          volume: Number(payload.q),
          timestamp: new Date(payload.T).toISOString(),
        };

        this.emit('tick', tick);
      } catch {
        this.emit('providerState', {
          provider: this.provider,
          state: 'degraded' as const,
          message: 'No se pudo parsear payload de Binance',
        });
      }
    });

    this.socket.addEventListener('close', () => {
      if (!this.shouldReconnect) {
        return;
      }

      this.emit('providerState', {
        provider: this.provider,
        state: 'degraded' as const,
        message: 'Socket Binance cerrado, reintentando',
      });

      this.reconnectTimer = setTimeout(() => this.connect(), 1_500);
    });

    this.socket.addEventListener('error', () => {
      this.emit('providerState', {
        provider: this.provider,
        state: 'degraded' as const,
        message: 'Error en conexión Binance WS',
      });
    });
  }
}
