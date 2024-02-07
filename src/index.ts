import { startWebsocketServer, stopWebsocketServer } from './websocket-server';
import { startProxyServer } from './proxy';

export const main = async () => {
  const ws = await startWebsocketServer({
    port: 8888,
  });

  try {
    await startProxyServer(ws.connections);
    console.info('Proxy server started on ports: 443, 80');
  }
  catch (error) {
    console.error('Proxy server error:', error);
    stopWebsocketServer(ws);
  }
}
