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
import { offersAvailabilityRequestSchema } from './requests/goalkeepers/offersAvailabilityRequest.js';
import { SetOffersAvailabilityCommand } from '../application/features/notifications/commands/setOffersAvailability/setOffersAvailabilityCommand.js';
import { ApiError } from './apiError.js';
import { goalkeeperNotFound, sendMovements, sendWallet } from './wallet/walletHttp.js';
import { sendTopUp, sendTopUpOptions, sendTopUps, startTopUp } from './payments/topUpHttp.js';
import { sendDocumentFile, sendMyDocument, sendMyDocuments } from './invoicing/invoicingHttp.js';
import { AcceptBookingCommand } from '../application/features/goalkeeperRequests/commands/acceptBooking/acceptBookingCommand.js';
import { ListAvailableBookingsQuery } from '../application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQuery.js';
import { ListGoalkeeperAgendaQuery } from '../application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQuery.js';
import { listClientBookingsRequestSchema } from './requests/goalkeeperRequests/listClientBookingsRequest.js';
import { zodFieldErrors } from './requests/goalkeeperRequests/getServiceQuoteRequest.js';
import { withdrawRequestSchema } from './requests/withdrawals/withdrawRequest.js';
import { checkInRequestSchema } from './requests/checkIn/checkInRequest.js';
import { CheckInToBookingCommand } from '../application/features/bookingLifecycle/commands/checkInToBooking/checkInToBookingCommand.js';
import { sendWithdrawals } from './withdrawals/withdrawalsHttp.js';
import { WithdrawFromBookingCommand } from '../application/features/bookingLifecycle/commands/withdrawFromBooking/withdrawFromBookingCommand.js';

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

  // The "available for offers" switch (feature 015): off hides and refuses matches; on sends the open ones now.
  router.put('/me/offers-availability', async (req, res) => {
    const body = offersAvailabilityRequestSchema.parse(req.body);
    const result = await deps.mediator.send(new SetOffersAvailabilityCommand(req.authClaims!.sub, body.available));

    switch (result.outcome) {
      case 'updated':
        res.status(200).json({ availableForOffers: result.availableForOffers, offersSent: result.offersSent });
        return;
      case 'not_a_goalkeeper':
        throw goalkeeperNotFound();
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

  // Matches the goalkeeper can take right now (feature 012).
  router.get('/me/available-bookings', async (req, res) => {
    const parsed = listClientBookingsRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new ListAvailableBookingsQuery(req.authClaims!.sub, parsed.data.page, parsed.data.pageSize));
    switch (result.outcome) {
      case 'success':
        res.status(200).json({
          items: result.items,
          page: result.page,
          pageSize: result.pageSize,
          totalItems: result.totalItems,
          totalPages: result.totalPages,
          unavailableReason: result.unavailableReason,
          missingAmount: result.missingAmount,
          suspendedUntil: result.suspendedUntil,
        });
        return;
      case 'not_a_goalkeeper':
        throw goalkeeperNotFound();
    }
  });

  // The goalkeeper's agenda: their bookings, upcoming then past, with the client's contact (feature 012).
  router.get('/me/bookings', async (req, res) => {
    const parsed = listClientBookingsRequestSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new ListGoalkeeperAgendaQuery(req.authClaims!.sub, parsed.data.page, parsed.data.pageSize));
    switch (result.outcome) {
      case 'success':
        res.status(200).json({
          items: result.items,
          page: result.page,
          pageSize: result.pageSize,
          totalItems: result.totalItems,
          totalPages: result.totalPages,
        });
        return;
      case 'not_a_goalkeeper':
        throw goalkeeperNotFound();
    }
  });

  // The goalkeeper takes a booking: assigned and charged in one step (feature 012).
  router.post('/me/bookings/:bookingId/accept', async (req, res) => {
    const result = await deps.mediator.send(new AcceptBookingCommand(req.authClaims!.sub, req.params.bookingId));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'accepted':
        res.status(201).json(result.booking);
        return;
      case 'replayed':
        res.status(200).json(result.booking);
        return;
      case 'already_taken':
        throw new ApiError(409, 'booking_already_taken', 'Another goalkeeper already took this booking.');
      case 'search_ended':
        throw new ApiError(409, 'search_ended', 'It is too close to the start to take this booking.');
      case 'zone_not_enabled':
        throw new ApiError(409, 'zone_not_enabled', 'This booking is outside the zones you have enabled.');
      case 'insufficient_funds':
        throw new ApiError(409, 'insufficient_funds', 'Your balance does not cover the commission of this booking.', undefined, {
          missingAmount: result.missingAmount,
        });
      case 'suspended':
        throw new ApiError(403, 'goalkeeper_suspended', 'You cannot take bookings while suspended.', undefined, {
          suspendedUntil: result.suspendedUntil,
        });
      case 'not_available_for_offers':
        throw new ApiError(409, 'goalkeeper_not_available', 'Turn on availability for offers to take matches.');
      case 'schedule_conflict':
        throw new ApiError(409, 'schedule_conflict', 'This booking clashes with a match you already have.', undefined, {
          conflictingBookingId: result.conflictingBookingId,
        });
      case 'own_request':
        throw new ApiError(409, 'own_request', 'You cannot take a booking of your own request.');
      case 'same_request':
        throw new ApiError(409, 'same_request', 'You already have a booking of this match.');
      case 'not_available':
        throw new ApiError(404, 'booking_not_available', 'This booking is not available.');
      case 'not_a_goalkeeper':
        throw goalkeeperNotFound();
    }
  });

  // The goalkeeper withdraws from a booking they took (feature 018): no refund, a replacement is
  // searched while there's time, and late or repeated withdrawals suspend them.
  router.post('/me/bookings/:bookingId/withdraw', async (req, res) => {
    const parsed = withdrawRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const result = await deps.mediator.send(new WithdrawFromBookingCommand(req.authClaims!.sub, req.params.bookingId, parsed.data.reason));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'withdrawn':
      case 'replayed':
        res.status(200).json({ ...result.booking, withdrawal: result.withdrawal });
        return;
      case 'not_a_goalkeeper':
        throw goalkeeperNotFound();
      case 'booking_not_found':
        throw new ApiError(404, 'booking_not_found', 'This booking does not exist or is not yours.');
      case 'not_withdrawable':
        throw new ApiError(409, 'booking_not_withdrawable', 'You can only withdraw from a booking assigned to you.', undefined, {
          status: result.status,
        });
      case 'match_started':
        throw new ApiError(409, 'match_started', 'The match has already started.', undefined, { startsAt: result.startsAt });
      case 'invalid_reason':
        throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', { reason: 'reason must have at most 200 characters' });
    }
  });

  // The goalkeeper confirms arrival with a photo uploaded to /api/images (feature 020): only inside
  // the window (start − 30 / start + 15 min); the location is evidence and never blocks.
  router.post('/me/bookings/:bookingId/check-in', async (req, res) => {
    const parsed = checkInRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', zodFieldErrors(parsed.error));
    }
    const { imageId, location } = parsed.data;
    const result = await deps.mediator.send(new CheckInToBookingCommand(req.authClaims!.sub, req.params.bookingId, imageId, location));

    // Exhaustive on purpose: adding an outcome without mapping it here fails compilation.
    switch (result.outcome) {
      case 'checked_in':
      case 'replayed':
        res.status(200).json(result.booking);
        return;
      case 'not_a_goalkeeper':
        throw goalkeeperNotFound();
      case 'booking_not_found':
        throw new ApiError(404, 'booking_not_found', 'This booking does not exist or is not yours.');
      case 'invalid_photo':
        throw new ApiError(400, 'invalid_photo', 'Upload the photo first; it must be yours.');
      case 'not_assigned':
        throw new ApiError(409, 'booking_not_assigned', 'This booking is no longer assigned to you.', undefined, { status: result.status });
      case 'too_early':
        throw new ApiError(409, 'check_in_not_open', 'The check-in is not open yet.', undefined, { opensAt: result.opensAt });
      case 'too_late':
        throw new ApiError(409, 'check_in_closed', 'The check-in window has closed.', undefined, { closedAt: result.closedAt });
    }
  });

  // Their own withdrawals and penalties, newest first (feature 018).
  router.get('/me/withdrawals', async (req, res) => {
    await sendWithdrawals(deps.mediator, req.authClaims!.sub, 'goalkeeper', req, res);
  });

  // The goalkeeper's wallet (feature 011). The goalkeeper is always the token's subject.
  router.get('/me/wallet', async (req, res) => {
    await sendWallet(deps.mediator, req.authClaims!.sub, res);
  });

  router.get('/me/wallet/movements', async (req, res) => {
    await sendMovements(deps.mediator, req.authClaims!.sub, 'goalkeeper', req, res);
  });

  // Top-ups through the country's payment gateway (feature 022).
  router.get('/me/wallet/top-up-options', async (req, res) => {
    await sendTopUpOptions(deps.mediator, req.authClaims!.sub, res);
  });

  router.post('/me/wallet/top-ups', async (req, res) => {
    await startTopUp(deps.mediator, req.authClaims!.sub, req, res);
  });

  router.get('/me/wallet/top-ups', async (req, res) => {
    await sendTopUps(deps.mediator, req.authClaims!.sub, req, res);
  });

  router.get('/me/wallet/top-ups/:topUpId', async (req, res) => {
    await sendTopUp(deps.mediator, req.authClaims!.sub, req.params.topUpId, res);
  });

  // Electronic invoices and credit notes (feature 023).
  router.get('/me/invoices', async (req, res) => {
    await sendMyDocuments(deps.mediator, req.authClaims!.sub, req, res);
  });

  router.get('/me/invoices/:documentId', async (req, res) => {
    await sendMyDocument(deps.mediator, req.authClaims!.sub, req.params.documentId, res);
  });

  router.get('/me/invoices/:documentId/pdf', async (req, res) => {
    await sendDocumentFile(deps.mediator, req.authClaims!.sub, req.params.documentId, 'pdf', res);
  });

  router.get('/me/invoices/:documentId/xml', async (req, res) => {
    await sendDocumentFile(deps.mediator, req.authClaims!.sub, req.params.documentId, 'xml', res);
  });

  return router;
}
