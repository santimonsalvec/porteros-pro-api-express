import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { UploadVerificationEvidenceCommand } from '../../../../../src/application/features/goalkeepers/commands/uploadVerificationEvidence/uploadVerificationEvidenceCommand.js';
import { UploadVerificationEvidenceCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/uploadVerificationEvidence/uploadVerificationEvidenceCommandHandler.js';
import { ListReferrerOptionsQuery } from '../../../../../src/application/features/goalkeepers/queries/listReferrerOptions/listReferrerOptionsQuery.js';
import { ListReferrerOptionsQueryHandler } from '../../../../../src/application/features/goalkeepers/queries/listReferrerOptions/listReferrerOptionsQueryHandler.js';
import { StoreImageCommand } from '../../../../../src/application/features/images/commands/storeImage/storeImageCommand.js';
import { PENDING_VETTING } from '../../../../../src/domain/goalkeepers/vetting.js';
import { User } from '../../../../../src/domain/users/user.js';
import { FakeSender } from '../../../../fakes/fakeSender.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { VALIDATED_VETTING, VERIFIED_VETTING } from '../../../../fixtures/vettingFixtures.js';
import { VettingHarness } from './vettingHarness.js';

let h: VettingHarness;

beforeEach(() => {
  h = new VettingHarness();
});

describe('UploadVerificationEvidence (admin spec 030, contracts C8)', () => {
  it('stores the image in the staff member\'s name for a goalkeeper', async () => {
    h.goalkeeper('gk-1', VALIDATED_VETTING);
    const sender = new FakeSender();
    sender.respondWith(StoreImageCommand, { outcome: 'success', image: { id: 'ev-1', url: 'https://img/ev-1.jpg', format: 'jpg', bytes: 1, width: 1, height: 1, createdAt: '' } });
    const handler = new UploadVerificationEvidenceCommandHandler({ profiles: h.profiles, sender });

    expect(await handler.handle(new UploadVerificationEvidenceCommand('staff-1', 'gk-1', Buffer.from('x'), 'image/jpeg'))).toEqual({
      outcome: 'created',
      imageId: 'ev-1',
      url: 'https://img/ev-1.jpg',
    });
    expect(sender.sent).toEqual([new StoreImageCommand('staff-1', Buffer.from('x'), 'image/jpeg')]);
  });

  it('is only for goalkeepers, and reports the storage being down', async () => {
    h.goalkeeper('gk-1', VALIDATED_VETTING);
    const sender = new FakeSender();
    sender.respondWith(StoreImageCommand, { outcome: 'storage_unavailable' });
    const handler = new UploadVerificationEvidenceCommandHandler({ profiles: h.profiles, sender });

    expect(await handler.handle(new UploadVerificationEvidenceCommand('staff-1', 'nobody', Buffer.from('x'), 'image/jpeg'))).toEqual({ outcome: 'not_a_goalkeeper' });
    expect(await handler.handle(new UploadVerificationEvidenceCommand('staff-1', 'gk-1', Buffer.from('x'), 'image/jpeg'))).toEqual({ outcome: 'storage_unavailable' });
  });
});

describe('ListReferrerOptions (contracts C9)', () => {
  it('offers validated and verified goalkeepers who are not blocked, never the goalkeeper themself', async () => {
    const users = new FakeUserRepository();
    const cities = new FakeMarketRepository();
    cities.seed(testMarket({ id: 'city-cali', name: 'Cali', countryId: 'country-co' }));
    for (const [id, first] of [['gk-1', 'Ana'], ['gk-2', 'Andrés'], ['gk-3', 'Anita'], ['gk-4', 'Antonio'], ['gk-5', 'Andrea']] as const) {
      const user = User.createFromExternalIdentity({ id, email: `${id}@example.com`, displayName: null, provider: 'google', subject: id });
      user.completeProfile(first, 'Portera', '+57', '300 000 0000');
      users.seed(user);
    }
    h.goalkeeper('gk-1', VALIDATED_VETTING);
    h.goalkeeper('gk-2', VERIFIED_VETTING);
    h.goalkeeper('gk-3', PENDING_VETTING);
    h.goalkeeper('gk-4', VALIDATED_VETTING);
    await h.blocks.block('gk-4', 'staff-1', 'motivo', h.now);
    const handler = new ListReferrerOptionsQueryHandler({
      userReader: { findIds: async () => ['gk-1', 'gk-2', 'gk-3', 'gk-4', 'gk-5'] },
      profiles: h.profiles,
      users,
      blocks: h.blocks,
      markets: cities,
    });

    const result = await handler.handle(new ListReferrerOptionsQuery('an', 'gk-1'));

    expect(result).toEqual({ items: [{ userId: 'gk-2', name: 'Andrés Portera', market: { id: 'city-cali', name: 'Cali' } }] });
  });

  it('needs at least two characters to search', async () => {
    const handler = new ListReferrerOptionsQueryHandler({
      userReader: { findIds: async () => { throw new Error('not searched'); } },
      profiles: h.profiles,
      users: new FakeUserRepository(),
      blocks: h.blocks,
      markets: new FakeMarketRepository(),
    });

    expect(await handler.handle(new ListReferrerOptionsQuery('a', 'gk-1'))).toEqual({ items: [] });
  });
});
