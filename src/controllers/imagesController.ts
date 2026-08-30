import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import type { ISender } from '../application/common/mediator/types.js';
import { StoreImageCommand } from '../application/features/images/commands/storeImage/storeImageCommand.js';
import { ResolveImageQuery } from '../application/features/images/queries/resolveImage/resolveImageQuery.js';
import { DeleteImageCommand } from '../application/features/images/commands/deleteImage/deleteImageCommand.js';
import { requireAuth } from '../infrastructure/auth/middleware/requireAuth.js';
import type { AccessTokenClaims } from '../application/features/auth/common/accessTokenClaims.js';
import { config } from '../infrastructure/config.js';
import { ApiError } from './apiError.js';

/** Storage-related formats this feature accepts — never on-demand transformation inputs (FR-011). */
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export interface ImagesControllerDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
}

export function createImagesController(deps: ImagesControllerDependencies): Router {
  const router = Router();
  router.use(requireAuth(deps.verifyAccessToken));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.images.maxUploadSizeBytes },
  }).single('image');

  router.post(
    '/',
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
      if (!req.file) {
        throw new ApiError(400, 'invalid_image', 'The uploaded file is not a supported image.');
      }

      const detected = await fileTypeFromBuffer(req.file.buffer);
      if (!detected || !ALLOWED_IMAGE_MIME_TYPES.has(detected.mime)) {
        throw new ApiError(400, 'invalid_image', 'The uploaded file is not a supported image.');
      }

      const claims = req.authClaims!;
      const result = await deps.mediator.send(new StoreImageCommand(claims.sub, req.file.buffer, detected.mime));

      if (result.outcome === 'storage_unavailable') {
        throw new ApiError(502, 'storage_unavailable', 'The image could not be stored. Please try again.');
      }
      res.status(201).json(result.image);
    },
  );

  router.get('/:id', async (req, res) => {
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new ResolveImageQuery(claims.sub, req.params.id));

    switch (result.outcome) {
      case 'success':
        res.status(200).json(result.image);
        return;
      case 'forbidden':
        throw new ApiError(403, 'forbidden', 'You do not have access to this image.');
      case 'not_found':
        throw new ApiError(404, 'image_not_found', 'This image no longer exists.');
    }
  });

  router.delete('/:id', async (req, res) => {
    const claims = req.authClaims!;
    const result = await deps.mediator.send(new DeleteImageCommand(claims.sub, req.params.id));

    switch (result.outcome) {
      case 'success':
        res.status(204).end();
        return;
      case 'forbidden':
        throw new ApiError(403, 'forbidden', 'You do not have access to this image.');
      case 'not_found':
        throw new ApiError(404, 'image_not_found', 'This image no longer exists.');
    }
  });

  return router;
}
