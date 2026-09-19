import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import type { ISender } from '../application/common/mediator/types.js';
import { GetGoalkeeperRegistrationQuery } from '../application/features/goalkeepers/queries/getGoalkeeperRegistration/getGoalkeeperRegistrationQuery.js';
import { GetDocumentTypesQuery } from '../application/features/goalkeepers/queries/getDocumentTypes/getDocumentTypesQuery.js';
import { SaveIdentificationSectionCommand } from '../application/features/goalkeepers/commands/saveIdentificationSection/saveIdentificationSectionCommand.js';
import { SavePhysicalDataSectionCommand } from '../application/features/goalkeepers/commands/savePhysicalDataSection/savePhysicalDataSectionCommand.js';
import { SaveAvailabilitySectionCommand } from '../application/features/goalkeepers/commands/saveAvailabilitySection/saveAvailabilitySectionCommand.js';
import { UpdateGoalkeeperPhysicalDataCommand } from '../application/features/goalkeepers/commands/updateGoalkeeperPhysicalData/updateGoalkeeperPhysicalDataCommand.js';
import { UpdateGoalkeeperAvailabilityCommand } from '../application/features/goalkeepers/commands/updateGoalkeeperAvailability/updateGoalkeeperAvailabilityCommand.js';
import { SaveDocumentPhotoCommand } from '../application/features/goalkeepers/commands/saveDocumentPhoto/saveDocumentPhotoCommand.js';
import { ActivateGoalkeeperCommand } from '../application/features/goalkeepers/commands/activateGoalkeeper/activateGoalkeeperCommand.js';
import { CancelGoalkeeperRegistrationCommand } from '../application/features/goalkeepers/commands/cancelGoalkeeperRegistration/cancelGoalkeeperRegistrationCommand.js';
import type { GoalkeeperRegistrationResponse } from '../application/features/goalkeepers/common/goalkeeperRegistrationResponse.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import { requireClientOnly } from '../infrastructure/auth/middleware/requireClientOnly.js';
import { requireCompleteProfile } from '../infrastructure/auth/middleware/requireCompleteProfile.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { config } from '../infrastructure/config.js';
import { saveIdentificationSectionRequestSchema } from './requests/goalkeepers/saveIdentificationSectionRequest.js';
import { savePhysicalDataSectionRequestSchema } from './requests/goalkeepers/savePhysicalDataSectionRequest.js';
import { saveAvailabilitySectionRequestSchema } from './requests/goalkeepers/saveAvailabilitySectionRequest.js';
import { updateGoalkeeperPhysicalDataRequestSchema } from './requests/goalkeepers/updateGoalkeeperPhysicalDataRequest.js';
import { updateGoalkeeperAvailabilityRequestSchema } from './requests/goalkeepers/updateGoalkeeperAvailabilityRequest.js';
import { ApiError } from './apiError.js';

/** Same accepted formats as `/api/images` (research.md §11) — no goalkeeper-specific override. */
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export interface GoalkeeperControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

/**
 * All `/me/*` routes require an authenticated client with an already-complete client
 * profile (research.md §6) — unlike `/api/clients/me`, there's no scenario here where
 * a client needs this resource before their own profile is complete, so the gate
 * applies uniformly, including to `GET`. `GET /document-types` is deliberately
 * outside this gate — public, non-sensitive reference data, mirrors `/api/locations/countries`.
 */
export function createGoalkeeperController(deps: GoalkeeperControllerDependencies): Router {
  const router = Router();

  router.get('/document-types', async (_req, res) => {
    const result = await deps.mediator.send(new GetDocumentTypesQuery());
    res.status(200).json({ documentTypes: result.documentTypes });
  });

  router.use('/me', requireAuth(deps.verifyAccessToken), requireClientOnly(), requireCompleteProfile());

  router.get('/me', async (req, res) => {
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new GetGoalkeeperRegistrationQuery(claims.sub));
    res.status(200).json(result.registration);
  });

  router.patch('/me/identification', async (req, res) => {
    const body = saveIdentificationSectionRequestSchema.parse(req.body);
    const claims = req.authClaims!;
    const result = await deps.mediator.send(
      new SaveIdentificationSectionCommand(claims.sub, body.documentType, body.documentNumber, body.issueDate, body.birthDate),
    );

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.registration);
        return;
      case 'validation_failed':
        throw new ApiError(400, 'validation_failed', 'One or more fields are invalid.', result.fieldErrors);
      case 'invalid_document_type':
        throw new ApiError(400, 'invalid_document_type', 'The provided document type is not recognized.');
      case 'duplicate_document':
        throw new ApiError(409, 'duplicate_document', 'This identification document is already registered to a goalkeeper account.');
      case 'already_active':
        throw new ApiError(409, 'already_active', 'Your goalkeeper profile is already active; this data can no longer be changed here.');
    }
  });

  router.patch('/me/physical-data', async (req, res) => {
    const body = savePhysicalDataSectionRequestSchema.parse(req.body);
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new SavePhysicalDataSectionCommand(claims.sub, body.heightCm, body.weightKg));

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.registration);
        return;
      case 'validation_failed':
        throw new ApiError(400, 'validation_failed', 'One or more fields are invalid.', result.fieldErrors);
      case 'already_active':
        throw new ApiError(409, 'already_active', 'Your goalkeeper profile is already active; this data can no longer be changed here.');
    }
  });

  router.patch('/me/availability', async (req, res) => {
    const body = saveAvailabilitySectionRequestSchema.parse(req.body);
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new SaveAvailabilitySectionCommand(claims.sub, body.cityId, body.zoneIds));

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.registration);
        return;
      case 'invalid_city':
        throw new ApiError(400, 'invalid_city', 'The provided city does not exist.');
      case 'invalid_zones':
        throw new ApiError(400, 'invalid_zones', 'One or more selected zones are invalid.', undefined, {
          invalidZoneIds: result.invalidZoneIds,
        });
      case 'already_active':
        throw new ApiError(409, 'already_active', 'Your goalkeeper profile is already active; this data can no longer be changed here.');
    }
  });

  /*
   * Editing an ALREADY ACTIVE goalkeeper's profile. Deliberately separate from the
   * draft-registration section routes above (`/me/physical-data`, `/me/availability`),
   * which stay locked with `already_active`: the registration flow and the live
   * profile can now evolve independently. Authorized against the database (an existing
   * GoalkeeperProfile), not the JWT's `isGoalkeeper` claim.
   */
  router.patch('/me/profile/physical-data', async (req, res) => {
    const body = updateGoalkeeperPhysicalDataRequestSchema.parse(req.body);
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new UpdateGoalkeeperPhysicalDataCommand(claims.sub, body.heightCm, body.weightKg));

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.goalkeeper);
        return;
      case 'validation_failed':
        throw new ApiError(400, 'validation_failed', 'One or more fields are invalid.', result.fieldErrors);
      case 'not_a_goalkeeper':
        throw new ApiError(404, 'goalkeeper_not_found', 'You have not started a goalkeeper registration.');
      case 'not_active':
        throw new ApiError(409, 'goalkeeper_not_active', 'Your goalkeeper profile is not active yet; finish and activate your registration first.');
    }
  });

  router.put('/me/profile/availability', async (req, res) => {
    const body = updateGoalkeeperAvailabilityRequestSchema.parse(req.body);
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new UpdateGoalkeeperAvailabilityCommand(claims.sub, body.cityId, body.zoneIds));

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.goalkeeper);
        return;
      case 'invalid_city':
        throw new ApiError(400, 'invalid_city', 'The provided city does not exist.');
      case 'invalid_zones':
        throw new ApiError(400, 'invalid_zones', 'One or more selected zones are invalid.', undefined, {
          invalidZoneIds: result.invalidZoneIds,
        });
      case 'not_a_goalkeeper':
        throw new ApiError(404, 'goalkeeper_not_found', 'You have not started a goalkeeper registration.');
      case 'not_active':
        throw new ApiError(409, 'goalkeeper_not_active', 'Your goalkeeper profile is not active yet; finish and activate your registration first.');
    }
  });

  router.post('/me/activate', async (req, res) => {
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new ActivateGoalkeeperCommand(claims.sub));

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.registration);
        return;
      case 'incomplete':
        throw new ApiError(
          409,
          'goalkeeper_profile_incomplete',
          'Complete all sections before activating your goalkeeper profile.',
          undefined,
          { missingSections: result.missingSections },
        );
      case 'already_active':
        throw new ApiError(409, 'already_active', 'Your goalkeeper profile is already active.');
    }
  });

  router.post('/me/cancel', async (req, res) => {
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new CancelGoalkeeperRegistrationCommand(claims.sub));

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.registration);
        return;
      case 'already_active':
        throw new ApiError(409, 'already_active', 'Your goalkeeper profile is already active; it cannot be cancelled here.');
    }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.images.maxUploadSizeBytes },
  }).fields([
    { name: 'sideA', maxCount: 1 },
    { name: 'sideB', maxCount: 1 },
  ]);

  router.post(
    '/me/document-photo',
    (req: Request, res: Response, next: NextFunction) => {
      upload(req, res, (err: unknown) => {
        if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
          next(new ApiError(413, 'file_too_large', 'The uploaded file exceeds the maximum allowed size.'));
          return;
        }
        next(err);
      });
    },
    async (req, res) => {
      const claims = req.authClaims!;
      const files = req.files as { sideA?: Express.Multer.File[]; sideB?: Express.Multer.File[] } | undefined;
      const sideAFile = files?.sideA?.[0];
      const sideBFile = files?.sideB?.[0];

      if (!sideAFile && !sideBFile) {
        throw new ApiError(400, 'invalid_image', 'At least one of sideA or sideB must be provided.');
      }

      const fieldErrors: Record<string, string> = {};
      let latestRegistration: GoalkeeperRegistrationResponse | undefined;
      let anySucceeded = false;
      let anyAlreadyActive = false;
      let anyStorageUnavailable = false;

      const sides: Array<['sideA' | 'sideB', 'A' | 'B', typeof sideAFile]> = [
        ['sideA', 'A', sideAFile],
        ['sideB', 'B', sideBFile],
      ];

      for (const [fieldName, side, file] of sides) {
        if (!file) continue;

        const detected = await fileTypeFromBuffer(file.buffer);
        if (!detected || !ALLOWED_IMAGE_MIME_TYPES.has(detected.mime)) {
          fieldErrors[fieldName] = 'The uploaded file is not a supported image.';
          continue;
        }

        const result = await deps.mediator.send(new SaveDocumentPhotoCommand(claims.sub, side, file.buffer, detected.mime));
        if (result.outcome === 'already_active') {
          anyAlreadyActive = true;
        } else if (result.outcome === 'storage_unavailable') {
          anyStorageUnavailable = true;
          fieldErrors[fieldName] = 'The image could not be stored. Please try again.';
        } else {
          anySucceeded = true;
          latestRegistration = result.registration;
        }
      }

      if (anyAlreadyActive) {
        throw new ApiError(409, 'already_active', 'Your goalkeeper profile is already active; document photos can no longer be changed here.');
      }

      if (!anySucceeded) {
        if (anyStorageUnavailable) {
          throw new ApiError(502, 'storage_unavailable', 'The image could not be stored. Please try again.');
        }
        throw new ApiError(400, 'invalid_image', 'The uploaded file is not a supported image.', fieldErrors);
      }

      if (!latestRegistration) {
        const current = await deps.mediator.send(new GetGoalkeeperRegistrationQuery(claims.sub));
        latestRegistration = current.registration;
      }

      res.status(200).json(Object.keys(fieldErrors).length > 0 ? { ...latestRegistration, fieldErrors } : latestRegistration);
    },
  );

  return router;
}
