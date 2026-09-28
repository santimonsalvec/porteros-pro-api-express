import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { RegisterDeviceCommand } from '../application/features/devices/commands/registerDevice/registerDeviceCommand.js';
import { UnregisterDeviceCommand } from '../application/features/devices/commands/unregisterDevice/unregisterDeviceCommand.js';
import { SendTestPushCommand } from '../application/features/devices/commands/sendTestPush/sendTestPushCommand.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import { registerDeviceRequestSchema, unregisterDeviceRequestSchema } from './requests/devices/deviceRequests.js';
import { ApiError } from './apiError.js';

export interface DevicesControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

const invalidToken = (): ApiError =>
  new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', {
    token: 'token must be 1 to 4096 characters',
  });

/**
 * Push devices (feature 014). Any signed-in user — client, goalkeeper or administrator, with or
 * without a completed profile (FR-001). Registration and removal both answer 204 whatever the
 * token's previous owner was, so nothing about other users leaks (FR-008).
 */
export function createDevicesController(deps: DevicesControllerDependencies): Router {
  const router = Router();
  router.use(requireAuth(deps.verifyAccessToken));

  router.post('/', async (req, res) => {
    const body = registerDeviceRequestSchema.parse(req.body);
    const result = await deps.mediator.send(new RegisterDeviceCommand(req.authClaims!.sub, body.token, body.platform));

    switch (result.outcome) {
      case 'registered':
      case 'refreshed':
      case 'transferred':
        res.status(204).end();
        return;
      case 'invalid_token':
        throw invalidToken();
    }
  });

  router.post('/unregister', async (req, res) => {
    const body = unregisterDeviceRequestSchema.parse(req.body);
    const result = await deps.mediator.send(new UnregisterDeviceCommand(req.authClaims!.sub, body.token));

    switch (result.outcome) {
      case 'removed':
      case 'not_found':
        res.status(204).end();
        return;
      case 'invalid_token':
        throw invalidToken();
    }
  });

  router.post('/test-push', async (req, res) => {
    const result = await deps.mediator.send(new SendTestPushCommand(req.authClaims!.sub));

    switch (result.outcome) {
      case 'sent':
        res.status(200).json(result.result);
        return;
      case 'rate_limited':
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new ApiError(429, 'too_many_requests', 'Too many test pushes; try again shortly.', undefined, {
          retryAfterSeconds: result.retryAfterSeconds,
        });
    }
  });

  return router;
}
