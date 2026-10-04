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
import { createGoalkeeperController } from './controllers/goalkeeperController.js';
import { createZonesController } from './controllers/zonesController.js';
import { createGoalkeeperRequestsController } from './controllers/goalkeeperRequestsController.js';
import { createAdminController } from './controllers/adminController.js';
import { createRatingsController } from './controllers/ratingsController.js';
import { createInternalController } from './controllers/internalController.js';
import { createDevicesController } from './controllers/devicesController.js';
import { createNotificationsController } from './controllers/notificationsController.js';
import { createPaymentWebhooksController } from './controllers/paymentWebhooksController.js';
import { createPaymentReturnController } from './controllers/paymentReturnController.js';
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

  app.use('/auth', createAuthController(deps));
  app.use('/profile', createProfileController(deps));
  app.use('/clients', createClientsController(deps));
  app.use('/locations', createLocationsController(deps));
  app.use('/images', createImagesController(deps));
  app.use('/goalkeepers', createGoalkeeperController(deps));
  app.use('/zones', createZonesController(deps));
  app.use('/goalkeeper-requests', createGoalkeeperRequestsController(deps));
  app.use('/admin', createAdminController(deps));
  app.use('/devices', createDevicesController(deps));
  app.use('/notifications', createNotificationsController(deps));
  app.use('/ratings', createRatingsController(deps));
  app.use('/health', createHealthController(deps));
  // Platform-only endpoints (feature 013): outside the documented API and not in the OpenAPI document.
  app.use('/internal', createInternalController(deps));
  // Payment gateways' events (feature 022): outside the documented API, verified by each event's signature.
  app.use('/webhooks/payments', createPaymentWebhooksController(deps));
  // The page the gateway returns to, and the app link files that open it in the app (feature 022).
  app.use(createPaymentReturnController(deps));

  app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
  app.use('/swagger', swaggerServe, swaggerSetup(openapiSpec));

  app.use(errorHandler);
  return app;
}
