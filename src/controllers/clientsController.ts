import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { GetClientProfileQuery } from '../application/features/clients/queries/getClientProfile/getClientProfileQuery.js';
import { UpdateClientProfileCommand } from '../application/features/clients/commands/updateClientProfile/updateClientProfileCommand.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import { requireClientOnly } from '../infrastructure/auth/middleware/requireClientOnly.js';
import { requireCompleteProfile } from '../infrastructure/auth/middleware/requireCompleteProfile.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { updateClientProfileRequestSchema } from './requests/clients/updateClientProfileRequest.js';
import { ApiError } from './apiError.js';

export interface ClientsControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

export function createClientsController(deps: ClientsControllerDependencies): Router {
  const router = Router();
  router.use(requireAuth(deps.verifyAccessToken), requireClientOnly());

  router.get('/me', async (req, res) => {
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new GetClientProfileQuery(claims.sub));

    if (result.outcome === 'not_found') {
      throw new ApiError(404, 'account_not_found', 'This account no longer exists.');
    }
    res.status(200).json(result.profile);
  });

  router.patch('/me', requireCompleteProfile(), async (req, res) => {
    const body = updateClientProfileRequestSchema.parse(req.body);
    const claims = req.authClaims!;

    const result = await deps.mediator.send(
      new UpdateClientProfileCommand(claims.sub, body.firstName, body.lastName, body.countryCode, body.whatsAppNumber),
    );

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.profile);
        return;
      case 'validation_failed':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', result.fieldErrors);
      case 'invalid_country_code':
        throw new ApiError(400, 'invalid_country_code', 'The provided country code is not recognized.');
      case 'duplicate_phone_number':
        throw new ApiError(409, 'duplicate_phone_number', 'This WhatsApp number is already associated with another account.');
      case 'profile_not_complete':
        throw new ApiError(409, 'profile_not_complete', 'Complete your profile before updating it.');
      case 'not_found':
        throw new ApiError(404, 'account_not_found', 'This account no longer exists.');
    }
  });

  return router;
}
