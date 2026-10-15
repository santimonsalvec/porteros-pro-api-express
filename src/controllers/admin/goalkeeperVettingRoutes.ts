import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import type { ISender } from '../../application/common/mediator/types.js';
import { GetGoalkeeperVettingQuery } from '../../application/features/goalkeepers/queries/getGoalkeeperVetting/getGoalkeeperVettingQuery.js';
import { ReviewBackgroundCheckCommand } from '../../application/features/goalkeepers/commands/reviewBackgroundCheck/reviewBackgroundCheckCommand.js';
import { DecideValidationCommand } from '../../application/features/goalkeepers/commands/decideValidation/decideValidationCommand.js';
import { VerifyGoalkeeperCommand } from '../../application/features/goalkeepers/commands/verifyGoalkeeper/verifyGoalkeeperCommand.js';
import { UploadVerificationEvidenceCommand } from '../../application/features/goalkeepers/commands/uploadVerificationEvidence/uploadVerificationEvidenceCommand.js';
import { RevokeValidationCommand } from '../../application/features/goalkeepers/commands/revokeValidation/revokeValidationCommand.js';
import { RevokeVerificationCommand } from '../../application/features/goalkeepers/commands/revokeVerification/revokeVerificationCommand.js';
import { ListReferrerOptionsQuery } from '../../application/features/goalkeepers/queries/listReferrerOptions/listReferrerOptionsQuery.js';
import { config } from '../../infrastructure/config.js';
import { ApiError } from '../apiError.js';
import { goalkeeperNotFound } from '../operatingBalance/operatingBalanceHttp.js';
import { decideValidationRequestSchema, referrerOptionsQuerySchema, revokeRequestSchema, reviewBackgroundCheckRequestSchema, verifyGoalkeeperRequestSchema } from '../requests/goalkeepers/vettingRequests.js';
import { conflict, invalidFields, notFound, parse, stale, type Route } from './geographyRoutes.js';

/**
 * Validation and verification of goalkeepers in the admin web (admin spec 030, contracts C2–C9).
 * Writes answer a small body — never document urls — because the audit keeps it as `after`; the
 * web reads the tab again afterwards.
 */
export function registerGoalkeeperVettingRoutes(route: Route, mediator: ISender): void {
  /** The tier and revision, the state a write's audit keeps as `before`. */
  const vettingState = async (req: Request) => {
    const result = await mediator.send(new GetGoalkeeperVettingQuery(userIdOf(req)));
    return result.outcome === 'ok' ? { revision: result.vetting.revision, tier: result.vetting.tier } : null;
  };

  // Identity photos and background checks: a sensitive read, audited without the data.
  route(
    'get',
    '/goalkeepers/:userId/vetting',
    { permission: 'goalkeepers.read', read: { action: 'goalkeeper.vetting.read', resourceType: 'goalkeeper', resourceId: userIdOf } },
    async (req, res) => {
      const result = await mediator.send(new GetGoalkeeperVettingQuery(userIdOf(req)));
      if (result.outcome === 'not_a_goalkeeper') throw goalkeeperNotFound();
      res.status(200).json(result.vetting);
    },
  );

  route(
    'post',
    '/goalkeepers/:userId/background-checks/:checkId/review',
    {
      permission: 'goalkeepers.validate',
      audit: {
        action: 'goalkeeper.background_check.review',
        resourceType: 'goalkeeper',
        resourceId: userIdOf,
        before: async (req) => {
          const result = await mediator.send(new GetGoalkeeperVettingQuery(userIdOf(req)));
          const check = result.outcome === 'ok' ? result.vetting.backgroundChecks.find((item) => item.id === checkIdOf(req)) : undefined;
          return check ? { id: check.id, status: check.status, expiresAt: check.expiresAt, revision: check.revision } : null;
        },
      },
    },
    async (req, res) => {
      const body = parse(reviewBackgroundCheckRequestSchema, req.body);
      const result = await mediator.send(
        new ReviewBackgroundCheckCommand({ staffUserId: req.adminAccess!.userId, goalkeeperId: userIdOf(req), checkId: checkIdOf(req), ...body }),
      );
      switch (result.outcome) {
        case 'reviewed': {
          const read = await mediator.send(new GetGoalkeeperVettingQuery(userIdOf(req)));
          const check = read.outcome === 'ok' ? read.vetting.backgroundChecks.find((item) => item.id === checkIdOf(req)) : undefined;
          res.status(200).json(check ? { id: check.id, status: check.status, expiresAt: check.expiresAt, rejectionReason: check.rejectionReason, revision: check.revision } : {});
          return;
        }
        case 'not_a_goalkeeper':
          throw goalkeeperNotFound();
        case 'not_found':
          throw notFound('background_check_not_found');
        case 'already_reviewed':
          throw conflict('background_check_reviewed', 'This document was already reviewed.');
        case 'stale':
          throw stale();
        case 'invalid_fields':
          throw invalidFields(result.fieldErrors);
      }
    },
  );

  route(
    'post',
    '/goalkeepers/:userId/validation',
    {
      permission: 'goalkeepers.validate',
      audit: { action: 'goalkeeper.validation.decide', resourceType: 'goalkeeper', resourceId: userIdOf, before: vettingState },
    },
    async (req, res) => {
      const body = parse(decideValidationRequestSchema, req.body);
      // Verifying in the same step also needs the verification permission (contracts C4).
      const access = req.adminAccess!;
      if (body.verification && !access.isOwner && !access.permissions.includes('goalkeepers.verify')) {
        throw new ApiError(403, 'permission_denied', 'Your role does not allow this action.', undefined, { permission: 'goalkeepers.verify' });
      }
      // The audit names what was decided.
      res.locals.auditAction = body.decision === 'approve' ? 'goalkeeper.validation.approve' : 'goalkeeper.validation.reject';
      const result = await mediator.send(new DecideValidationCommand({ staffUserId: req.adminAccess!.userId, goalkeeperId: userIdOf(req), ...body }));
      switch (result.outcome) {
        case 'approved':
        case 'rejected':
          res.status(200).json(await vettingState(req));
          return;
        case 'not_a_goalkeeper':
          throw goalkeeperNotFound();
        case 'not_ready':
          throw new ApiError(409, 'validation_not_ready', 'The goalkeeper cannot be validated yet.', undefined, { missing: result.missing });
        case 'already_validated':
          throw conflict('already_validated', 'The goalkeeper is already validated.');
        case 'stale':
          throw stale();
        case 'invalid_fields':
          throw invalidFields(result.fieldErrors);
        case 'invalid_referrer':
          throw conflict('invalid_referrer', 'The referrer must be another validated goalkeeper who is not blocked.');
        case 'invalid_evidence':
          throw conflict('invalid_evidence', 'Upload the evidence images again.');
      }
    },
  );

  route(
    'post',
    '/goalkeepers/:userId/verification',
    {
      permission: 'goalkeepers.verify',
      audit: { action: 'goalkeeper.verification.grant', resourceType: 'goalkeeper', resourceId: userIdOf, before: vettingState },
    },
    async (req, res) => {
      const body = parse(verifyGoalkeeperRequestSchema, req.body);
      const result = await mediator.send(new VerifyGoalkeeperCommand({ staffUserId: req.adminAccess!.userId, goalkeeperId: userIdOf(req), ...body }));
      switch (result.outcome) {
        case 'verified':
        case 'practice_failed':
          res.status(200).json({ verified: result.outcome === 'verified', ...(await vettingState(req)) });
          return;
        case 'not_a_goalkeeper':
          throw goalkeeperNotFound();
        case 'not_validated':
          throw conflict('not_validated', 'The goalkeeper must be validated first.');
        case 'already_verified':
          throw conflict('already_verified', 'The goalkeeper is already verified.');
        case 'stale':
          throw stale();
        case 'invalid_referrer':
          throw conflict('invalid_referrer', 'The referrer must be another validated goalkeeper who is not blocked.');
        case 'invalid_evidence':
          throw conflict('invalid_evidence', 'Upload the evidence images again.');
        case 'invalid_fields':
          throw invalidFields(result.fieldErrors);
      }
    },
  );

  const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.images.maxUploadSizeBytes } }).single('file');
  route(
    'post',
    '/goalkeepers/:userId/verification-evidence',
    'goalkeepers.verify',
    (req: Request, res: Response, next: NextFunction) => {
      evidenceUpload(req, res, (err: unknown) => {
        if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
          next(new ApiError(413, 'file_too_large', 'The uploaded file exceeds the maximum allowed size.'));
          return;
        }
        next(err);
      });
    },
    async (req, res) => {
      const file = req.file;
      const detected = file ? await fileTypeFromBuffer(file.buffer) : undefined;
      if (!file || !detected || !EVIDENCE_IMAGE_TYPES.has(detected.mime)) throw new ApiError(400, 'invalid_image', 'The uploaded file is not a supported image.');
      const result = await mediator.send(new UploadVerificationEvidenceCommand(req.adminAccess!.userId, userIdOf(req), file.buffer, detected.mime));
      switch (result.outcome) {
        case 'created':
          res.status(201).json({ imageId: result.imageId, url: result.url });
          return;
        case 'not_a_goalkeeper':
          throw goalkeeperNotFound();
        case 'storage_unavailable':
          throw new ApiError(502, 'storage_unavailable', 'The image could not be stored. Please try again.');
      }
    },
  );

  for (const [path, permission, action, Command, notCode] of [
    ['/goalkeepers/:userId/validation/revoke', 'goalkeepers.validate', 'goalkeeper.validation.revoke', RevokeValidationCommand, 'not_validated'],
    ['/goalkeepers/:userId/verification/revoke', 'goalkeepers.verify', 'goalkeeper.verification.revoke', RevokeVerificationCommand, 'not_verified'],
  ] as const) {
    route('post', path, { permission, audit: { action, resourceType: 'goalkeeper', resourceId: userIdOf, before: vettingState } }, async (req, res) => {
      const body = parse(revokeRequestSchema, req.body);
      const input = { staffUserId: req.adminAccess!.userId, goalkeeperId: userIdOf(req), ...body };
      const result = Command === RevokeValidationCommand ? await mediator.send(new RevokeValidationCommand(input)) : await mediator.send(new RevokeVerificationCommand(input));
      switch (result.outcome) {
        case 'revoked':
          res.status(200).json(await vettingState(req));
          return;
        case 'not_a_goalkeeper':
          throw goalkeeperNotFound();
        case 'stale':
          throw stale();
        case 'invalid_fields':
          throw invalidFields(result.fieldErrors);
        default:
          throw conflict(notCode, notCode === 'not_validated' ? 'The goalkeeper is not validated.' : 'The goalkeeper is not verified.');
      }
    });
  }

  route('get', '/goalkeepers/:userId/referrer-options', 'goalkeepers.verify', async (req, res) => {
    const { q } = parse(referrerOptionsQuerySchema, req.query);
    res.status(200).json(await mediator.send(new ListReferrerOptionsQuery(q, userIdOf(req))));
  });
}

const EVIDENCE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const userIdOf = (req: Request) => String(req.params.userId);
const checkIdOf = (req: Request) => String(req.params.checkId);
