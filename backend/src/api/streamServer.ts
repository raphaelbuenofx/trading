import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { createHash } from 'node:crypto';
import { MarketHub, type MarketHubProviderState, type MarketHubUpdate } from '@/backend/src/market/MarketHub';
import { getProviderMappedAssets } from '@/backend/src/providers';
import { getAssetHistory, getAssetSignalHistory, normalizeTimeframe } from '@/backend/src/api/assetsHistory';

export interface StreamServerOptions {
  port?: number;
  pollingIntervalByCategory?: Partial<Record<string, number>>;
}

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function startStreamServer(options: StreamServerOptions = {}) {
  const port = options.port ?? Number(process.env.MARKET_STREAM_PORT ?? 4500);
  const clients = new Set<Duplex>();

  const server = createServer((request, response) => {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${port}`}`);

    if (requestUrl.pathname === '/assets') {
      sendJson(response, 200, { assets: getProviderMappedAssets() });
      return;
    }

    const historyMatch = requestUrl.pathname.match(/^\/assets\/([^/]+)\/history$/);
    if (historyMatch) {
      const timeframe = normalizeTimeframe(requestUrl.searchParams.get('timeframe'));
      const history = getAssetHistory(historyMatch[1], timeframe);

      if (!history) {
        sendJson(response, 404, { error: 'Asset not found' });
        return;
      }

      sendJson(response, 200, history);
      return;
    }

    const signalHistoryMatch = requestUrl.pathname.match(/^\/assets\/([^/]+)\/signals\/history$/);
    if (signalHistoryMatch) {
      const limit = Number(requestUrl.searchParams.get('limit') ?? '20');
      const signals = getAssetSignalHistory(signalHistoryMatch[1], Number.isNaN(limit) ? 20 : limit);

      if (!signals) {
        sendJson(response, 404, { error: 'Asset not found or no signals available' });
        return;
      }

      sendJson(response, 200, {
        symbol: decodeURIComponent(signalHistoryMatch[1]),
        count: signals.length,
        items: signals,
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  });
  const hub = new MarketHub({
    pollingIntervalByCategory: options.pollingIntervalByCategory,
  });

  hub.on('event', (event: MarketHubUpdate | MarketHubProviderState) => {
    const payload = JSON.stringify(event);
    const frame = encodeTextFrame(payload);

    clients.forEach((client) => {
      client.write(frame);
    });
  });

  server.on('upgrade', (request, socket) => {
    if (request.url !== '/stream') {
      socket.destroy();
      return;
    }

    const key = request.headers['sec-websocket-key'];
    if (!key || Array.isArray(key)) {
      socket.destroy();
      return;
    }

    socket.write(buildHandshakeResponse(key));
    clients.add(socket);

    sendSocketPayload(socket, {
      type: 'system',
      status: 'connected',
      message: 'Market stream connected',
      timestamp: new Date().toISOString(),
    });

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
      socket.destroy();
    });

    socket.on('end', () => {
      clients.delete(socket);
    });

    socket.on('data', (buffer) => {
      // Manejo mínimo de CLOSE frame (opcode 0x8)
      if (isCloseFrame(buffer)) {
        clients.delete(socket);
        socket.end();
      }
    });
  });

  hub.start();

  server.listen(port, () => {
    console.log(`Market stream available at ws://localhost:${port}/stream`);
  });

  return {
    close: () => {
      hub.stop();
      clients.forEach((client) => client.destroy());
      clients.clear();
      server.close();
    },
  };
}

function buildHandshakeResponse(secWebSocketKey: string) {
  const acceptValue = createHash('sha1').update(`${secWebSocketKey}${WS_MAGIC_STRING}`).digest('base64');

  return [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptValue}`,
    '\r\n',
  ].join('\r\n');
}

function sendSocketPayload(socket: Duplex, payload: unknown) {
  socket.write(encodeTextFrame(JSON.stringify(payload)));
}

function encodeTextFrame(message: string) {
  const payload = Buffer.from(message, 'utf8');
  const payloadLength = payload.length;

  if (payloadLength < 126) {
    return Buffer.concat([Buffer.from([0x81, payloadLength]), payload]);
  }

  if (payloadLength < 65_536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);

    return Buffer.concat([header, payload]);
  }

  throw new Error('Payload demasiado grande para frame simplificado');
}

function isCloseFrame(buffer: Buffer) {
  return buffer.length > 0 && (buffer[0] & 0x0f) === 0x08;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(JSON.stringify(payload));
}

export function isWebSocketUpgrade(request: IncomingMessage) {
  return request.headers.upgrade?.toLowerCase() === 'websocket';
}
