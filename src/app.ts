import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { serve as swaggerServe, setup as swaggerSetup } from 'swagger-ui-express';
import { errorHandler } from './controllers/errorHandler.js';
import { logger } from './infrastructure/observability/logger.js';
import type { AppDependencies } from './appDependencies.js';
import { createAuthController } from './controllers/authController.js';
import { createProfileController } from './controllers/profileController.js';
import { createClientsController } from './controllers/clientsController.js';
import { createLocationsController } from './controllers/locationsController.js';
import { createHealthController } from './controllers/healthController.js';
import { createImagesController } from './controllers/imagesController.js';
import { createPorterosController } from './controllers/porterosController.js';
import { openapiSpec } from './infrastructure/openapi/openapiSpec.js';

/**
 * Assembles the Express app from injected dependencies — no controller imports a
 * concrete infrastructure implementation directly, only `AppDependencies`. Router
 * mount points are added incrementally as each feature is implemented.
 */
export function createApp(deps: AppDependencies): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use('/api/auth', createAuthController(deps));
  app.use('/api/profile', createProfileController(deps));
  app.use('/api/clients', createClientsController(deps));
  app.use('/api/locations', createLocationsController(deps));
  app.use('/api/images', createImagesController(deps));
  app.use('/api/porteros', createPorterosController(deps));
  app.use('/health', createHealthController(deps));

  app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
  app.use('/swagger', swaggerServe, swaggerSetup(openapiSpec));

  app.use(errorHandler);
  return app;
}
