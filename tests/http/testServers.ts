import http from 'node:http';
import type { Express } from 'express';

const openServers = new Set<http.Server>();

/**
 * Serves the app on an ephemeral port bound to 127.0.0.1 — the address supertest connects to.
 * Letting supertest start its own server binds `::` instead, and on macOS any other program
 * listening on 127.0.0.1 with that same port number (IDEs, Postman, debuggers…) takes those
 * connections: random 401s, timeouts and "Parse Error: Expected HTTP/" in parallel runs.
 * Binding the loopback address itself means the OS only hands out a port that is free there.
 */
export async function listenOnLoopback(app: Express): Promise<http.Server> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  openServers.add(server);
  return server;
}

/** Closes every server opened by the current test (called from the http project's setup file). */
export async function closeTestServers(): Promise<void> {
  const servers = [...openServers];
  openServers.clear();
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
}
