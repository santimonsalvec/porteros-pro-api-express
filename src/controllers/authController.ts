import { Router } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import { GetSsoOptionsQuery } from '../application/features/auth/queries/getSsoOptions/getSsoOptionsQuery.js';
import { InvalidPlatformError } from '../application/features/auth/common/errors.js';
import { ExchangeSsoCredentialCommand } from '../application/features/auth/commands/exchangeSsoCredential/exchangeSsoCredentialCommand.js';
import { RefreshAccessTokenCommand } from '../application/features/auth/commands/refreshAccessToken/refreshAccessTokenCommand.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { exchangeSsoCredentialRequestSchema } from './requests/auth/exchangeSsoCredentialRequest.js';
import { refreshAccessTokenRequestSchema } from './requests/auth/refreshAccessTokenRequest.js';
import type { MeResponse } from './responses/auth/meResponse.js';
import { ApiError } from './apiError.js';

export interface AuthControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

export function createAuthController(deps: AuthControllerDependencies): Router {
  const router = Router();

  router.get('/sso-options', async (req, res) => {
    const platform = typeof req.query.platform === 'string' ? req.query.platform : '';
    try {
      const result = await deps.mediator.send(new GetSsoOptionsQuery(platform));
      res.status(200).json({ providers: result.providers });
    } catch (err) {
      if (err instanceof InvalidPlatformError) {
        throw new ApiError(
          400,
          'invalid_platform',
          "The 'platform' query parameter is required and must be one of: mobile, admin-web.",
        );
      }
      throw err;
    }
  });

  router.post('/sso/exchange', async (req, res) => {
    const body = exchangeSsoCredentialRequestSchema.parse(req.body);
    const result = await deps.mediator.send(
      new ExchangeSsoCredentialCommand(body.provider, body.platform, body.credential),
    );

    if (result.outcome === 'success') {
      res.status(200).json(result.tokens);
      return;
    }
    if (result.outcome === 'admin_sign_in_moved') {
      throw new ApiError(410, 'admin_sign_in_moved', 'The admin web signs in through POST /auth/admin/sign-in.');
    }
    throw new ApiError(401, 'invalid_credential', 'The provided credential could not be verified.');
  });

  router.post('/tokens/refresh', async (req, res) => {
    const body = refreshAccessTokenRequestSchema.parse(req.body);
    const result = await deps.mediator.send(new RefreshAccessTokenCommand(body.refreshToken));

    if (result.outcome === 'success') {
      res.status(200).json(result.tokens);
      return;
    }
    throw new ApiError(401, 'invalid_refresh_token', 'The refresh token is invalid, expired, or has already been used.');
  });

  router.get('/me', requireAuth(deps.verifyAccessToken), (req, res) => {
    const claims = req.authClaims!;
    const response: MeResponse = {
      userId: claims.sub,
      email: claims.email,
      // Kept for the app, which reads it as a required boolean; nothing grants admin rights here anymore (spec 001).
      isAdmin: false,
      isProfileComplete: claims.profileComplete === 'true',
    };
    res.status(200).json(response);
  });

  return router;
}
