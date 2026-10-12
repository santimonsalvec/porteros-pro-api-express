import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { IImageRepository } from '../../../images/common/ports.js';
import type { IDocumentTypeRepository, IGoalkeeperProfileRepository } from '../../common/ports.js';
import { GetGoalkeeperDocumentQuery, type GetGoalkeeperDocumentResult } from './getGoalkeeperDocumentQuery.js';

export class GetGoalkeeperDocumentQueryHandler implements IQueryHandler<GetGoalkeeperDocumentQuery, GetGoalkeeperDocumentResult> {
  constructor(
    private readonly deps: {
      profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>;
      documentTypes: Pick<IDocumentTypeRepository, 'findByCode'>;
      images: Pick<IImageRepository, 'getById'>;
    },
  ) {}

  async handle({ userId }: GetGoalkeeperDocumentQuery): Promise<GetGoalkeeperDocumentResult> {
    const profile = await this.deps.profiles.getByUserId(userId);
    if (!profile) return { outcome: 'not_a_goalkeeper' };
    const [documentType, front, back] = await Promise.all([
      this.deps.documentTypes.findByCode(profile.documentType),
      this.deps.images.getById(profile.documentPhotoAId),
      this.deps.images.getById(profile.documentPhotoBId),
    ]);
    return {
      outcome: 'ok',
      document: {
        documentType: { code: profile.documentType, name: documentType?.name ?? profile.documentType },
        documentNumber: profile.documentNumber,
        photos: { front: front?.url ?? null, back: back?.url ?? null },
      },
    };
  }
}
