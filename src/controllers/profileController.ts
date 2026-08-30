import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { CompleteProfileCommand } from '../application/features/profile/commands/completeProfile/completeProfileCommand.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { completeProfileRequestSchema } from './requests/profile/completeProfileRequest.js';
import { ApiError } from './apiError.js';

export interface ProfileControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

export function createProfileController(deps: ProfileControllerDependencies): Router {
  const router = Router();

  router.post('/complete', requireAuth(deps.verifyAccessToken), async (req, res) => {
    const body = completeProfileRequestSchema.parse(req.body);
    const claims = req.authClaims!;

    const result = await deps.mediator.send(
      new CompleteProfileCommand(
        claims.sub,
        body.firstName,
        body.lastName,
        body.countryCode,
        body.whatsAppNumber,
        body.acceptedTerms,
        req.ip ?? null,
        req.header('user-agent') ?? null,
      ),
    );

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.tokens);
        return;
      case 'validation_failed':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', result.fieldErrors);
      case 'invalid_country_code':
        throw new ApiError(400, 'invalid_country_code', 'The provided country code is not recognized.');
      case 'duplicate_phone_number':
        throw new ApiError(409, 'duplicate_phone_number', 'This WhatsApp number is already associated with another account.');
      case 'already_complete':
        throw new ApiError(
          409,
          'profile_already_complete',
          "This account's profile has already been completed; no changes were made.",
        );
    }
  });

  return router;
}
