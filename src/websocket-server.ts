import { IncomingMessage, Server } from 'http';
import { v4 as uuid } from 'uuid';
import * as WebSocket from 'ws';
import { ServerOptions, WebSocketServer } from 'ws';
import { updateCerts } from './update-certs';
import { ClientConfig } from './types';
import { getTld } from './tld';

export interface MessageContext<TEvent = string, TPayload = any> {
  id: string;
  event: TEvent;
  payload: TPayload;
  connection?: Pick<ConnectionContext, 'id'>;
}

export const send = (client: WebSocket, data: unknown) => {
  client.send(JSON.stringify(data));
};

const terminate = (
  client: WebSocket,
  error: Error,
) => {
  console.error('Closing connection:', error);
  return client.close(1007, error?.message?.substring(0, 100));
};

export type WebsocketContext = {
  server: WebSocket.Server<typeof WebSocket.WebSocket>;
  connections: ConnectionContext[];
  interval: NodeJS.Timeout;
}

export type ConnectionContext = {
  id: string;
  ip: string;
  tld: string;
  config: ClientConfig;
  client: WebSocket.WebSocket;
  alive: boolean;
  ac: AbortController;
}

export const createWebSocketConnectionOpenHandler = (
  ws: WebsocketContext,
  handler: (connection: ConnectionContext) => Promise<void> | void,
) => {
  return async (client: WebSocket.WebSocket, request: IncomingMessage) => {
    if (!request.socket.remoteAddress) {
      return terminate(client, new Error('Could not get remoteAddress'));
    }

    if (!request.headers['x-config']?.length) {
      return terminate(client, new Error('Missing config header (x-config)'));
    }

    let config: ClientConfig;
    try {
      config = JSON.parse(request.headers['x-config'] as string);
    } catch (error) {
      return terminate(client, new Error('Could not parse config json'));
    }

    const tld = getTld(config);

    if (!tld) {
      return terminate(client, new Error('Could not get tld from config'));
    }

    const connection: ConnectionContext = {
      id: uuid().toString(),
      ip: request.socket.remoteAddress,
      tld,
      config,
      client,
      alive: true,
      ac: new AbortController(),
    };

    try {
      await updateCerts(connection);
    } catch (error) {
      return terminate(connection.client, new Error(`updateCerts failed: ${error?.message}`));
    }

    ws.connections.push(connection);
    handler(connection);
  };
};

export const createWebSocketPongHandler = (
  ws: WebsocketContext,
  connection: ConnectionContext,
) => {
  return () => {
    connection.alive = true;
  };
};

export const createWebSocketConnectionCloseHandler = (
  ws: WebsocketContext,
  connection: ConnectionContext,
) => {
  return () => {
    ws.connections.splice(ws.connections.indexOf(connection), 1);
    connection.ac.abort();
    console.log('Client', connection.id, 'disconnected!');
  };
};

export const startWebsocketServer = async (options: ServerOptions): Promise<WebsocketContext> => {
  const server = new WebSocketServer({
    ...options,
    clientTracking: false,
  });

  const connections: ConnectionContext[] = [];
  
  const interval = setInterval(function ping() {
    ws.connections.forEach(function each(_connection) {
      if (!_connection.alive) {
        return _connection.client.terminate();
      };
  
      _connection.alive = false;
      _connection.client.ping();
    });
  }, 5000);

  const ws: WebsocketContext = {
    server,
    connections,
    interval,
  };

  ws.server.on('connection', createWebSocketConnectionOpenHandler(ws, (connection) => {
    console.log('Client', connection.id, 'connected! Total:', ws.connections.length, 'Config:', connection.config);
    connection.client.on('close', createWebSocketConnectionCloseHandler(ws, connection));
    connection.client.on('pong', createWebSocketPongHandler(ws, connection));
  }));

  await new Promise<void>((resolve, reject) => {
    ws.server.once('error', (error) => {
      reject(error);
    });

    ws.server.once('listening', () => {
      resolve();
    });
  });

  const self = new WebSocket(`ws://127.0.0.1:${options.port}`, {
    headers: {
      'x-config': JSON.stringify({
        env: process.env,
        domains: [{
          name: process.env.tld,
          target: `127.0.0.1:${options.port}`
        }]
      }),
    },
  });

  self.once('close', () => {
    console.log('Self closed');
    stopWebsocketServer(ws);
  });

  await new Promise<void>((resolve, reject) => {
    self.once('error', (error) => {
      reject(new Error('Self error: ' + error?.message));
    });

    self.once('listening', () => {
      resolve();
    });
  });

  return ws;
};

export const stopWebsocketServer = (ws: WebsocketContext) => {
  clearInterval(ws.interval);
  ws.connections.length = 0;
  ws.server.close();
};
