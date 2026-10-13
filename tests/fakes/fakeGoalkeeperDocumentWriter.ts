import type { DocumentWriteResult, IdentityDocument, IGoalkeeperDocumentWriter } from '../../src/application/features/goalkeepers/common/adminPorts.js';
import { GoalkeeperProfile } from '../../src/domain/goalkeepers/goalkeeperProfile.js';
import type { FakeGoalkeeperProfileRepository } from './fakeGoalkeeperProfileRepository.js';
import type { FakeGoalkeeperRegistrationRepository } from './fakeGoalkeeperRegistrationRepository.js';

/** Writes the corrected document to the in-memory profile and registration, like the Mongo writer. */
export class FakeGoalkeeperDocumentWriter implements IGoalkeeperDocumentWriter {
  constructor(private readonly profiles: FakeGoalkeeperProfileRepository, private readonly registrations: FakeGoalkeeperRegistrationRepository) {}

  async correct(userId: string, expected: IdentityDocument, next: IdentityDocument): Promise<DocumentWriteResult> {
    const profile = await this.profiles.getByUserId(userId);
    if (!profile || profile.documentType !== expected.documentType || profile.documentNumber !== expected.documentNumber) return 'stale';
    if (await this.registrations.existsByDocument(next.documentType, next.documentNumber, userId)) return 'duplicate';
    this.profiles.seed(new GoalkeeperProfile({ ...profile, ...next }));
    const registration = await this.registrations.getByUserId(userId);
    if (registration) {
      registration.identification = { ...registration.identification, ...next };
      await this.registrations.update(registration);
    }
    return 'saved';
  }
}
