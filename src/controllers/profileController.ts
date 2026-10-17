import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { CompleteProfileCommand } from '../application/features/profile/commands/completeProfile/completeProfileCommand.js';
import { AcceptCurrentTermsCommand } from '../application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommand.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { completeProfileRequestSchema } from './requests/profile/completeProfileRequest.js';
import { setLanguageRequestSchema } from './requests/profile/setLanguageRequest.js';
import { SetLanguageCommand } from '../application/features/profile/commands/setLanguage/setLanguageCommand.js';
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

  // Accepting the current terms again after a new version (feature 022).
  router.post('/terms/accept', requireAuth(deps.verifyAccessToken), async (req, res) => {
    const result = await deps.mediator.send(
      new AcceptCurrentTermsCommand(req.authClaims!.sub, req.ip ?? null, req.header('user-agent') ?? null),
    );
    res.status(201).json(result);
  });

  // The language the person reads the app in (feature 032): any signed-in account, complete or not.
  router.put('/language', requireAuth(deps.verifyAccessToken), async (req, res) => {
    const body = setLanguageRequestSchema.parse(req.body);
    const result = await deps.mediator.send(new SetLanguageCommand(req.authClaims!.sub, body.language));
    switch (result.outcome) {
      case 'saved':
        res.status(204).end();
        return;
      case 'user_not_found':
        throw new ApiError(401, 'unauthorized', 'The account no longer exists.');
    }
  });

  return router;
}
