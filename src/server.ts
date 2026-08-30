import { createApp } from './app.js';
import { config } from './infrastructure/config.js';
import { buildDependencies } from './infrastructure/di.js';
import { logger } from './infrastructure/observability/logger.js';
import { startObservability } from './infrastructure/observability/otel.js';

async function main(): Promise<void> {
  const otelSdk = startObservability(config.otel.otlpEndpoint);
  const { dependencies, close } = await buildDependencies();
  const app = createApp(dependencies);

  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'PorterosPRO API listening');
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await close();
    await otelSdk.shutdown().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
