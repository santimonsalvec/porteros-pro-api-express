import { describe, expect, it } from 'vitest';
import { AcceptCurrentTermsCommand } from '../../../../../src/application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommand.js';
import { AcceptCurrentTermsCommandHandler } from '../../../../../src/application/features/profile/commands/acceptCurrentTerms/acceptCurrentTermsCommandHandler.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeTermsAcceptanceRepository } from '../../../../fakes/fakeTermsAcceptanceRepository.js';

describe('AcceptCurrentTermsCommandHandler', () => {
  it('records an acceptance of the current versions with its evidence, and it becomes the latest', async () => {
    const terms = new FakeTermsAcceptanceRepository();
    const clock = new FixedClock('2026-09-29T12:00:00.000Z');
    const handler = new AcceptCurrentTermsCommandHandler(terms, { newId: () => 'ta-1' }, clock, { termsVersion: '2.0', privacyPolicyVersion: '1.5' });

    const result = await handler.handle(new AcceptCurrentTermsCommand('user-1', '1.2.3.4', 'app/1.0'));

    expect(result).toEqual({ termsVersion: '2.0', privacyPolicyVersion: '1.5', acceptedAt: '2026-09-29T12:00:00.000Z' });
    expect(terms.records[0]).toMatchObject({ userId: 'user-1', ipAddress: '1.2.3.4', userAgent: 'app/1.0' });
    expect((await terms.findLatestForUser('user-1'))?.termsVersion).toBe('2.0');
  });
});
