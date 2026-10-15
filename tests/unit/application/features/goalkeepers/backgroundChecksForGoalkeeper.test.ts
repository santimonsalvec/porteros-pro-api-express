import { beforeEach, describe, expect, it } from 'vitest';
import { UploadBackgroundCheckCommand } from '../../../../../src/application/features/goalkeepers/commands/uploadBackgroundCheck/uploadBackgroundCheckCommand.js';
import { UploadBackgroundCheckCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/uploadBackgroundCheck/uploadBackgroundCheckCommandHandler.js';
import { DeleteBackgroundCheckCommand } from '../../../../../src/application/features/goalkeepers/commands/deleteBackgroundCheck/deleteBackgroundCheckCommand.js';
import { DeleteBackgroundCheckCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/deleteBackgroundCheck/deleteBackgroundCheckCommandHandler.js';
import { ListMyBackgroundChecksQuery } from '../../../../../src/application/features/goalkeepers/queries/listMyBackgroundChecks/listMyBackgroundChecksQuery.js';
import { ListMyBackgroundChecksQueryHandler } from '../../../../../src/application/features/goalkeepers/queries/listMyBackgroundChecks/listMyBackgroundChecksQueryHandler.js';
import { StoreImageCommand } from '../../../../../src/application/features/images/commands/storeImage/storeImageCommand.js';
import { DeleteImageCommand } from '../../../../../src/application/features/images/commands/deleteImage/deleteImageCommand.js';
import { BackgroundCheck } from '../../../../../src/domain/goalkeepers/backgroundCheck.js';
import { StoredImage } from '../../../../../src/domain/images/storedImage.js';
import { FakeBackgroundCheckRepository } from '../../../../fakes/fakeBackgroundCheckRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeImageRepository } from '../../../../fakes/fakeImageRepository.js';
import { FakeSender } from '../../../../fakes/fakeSender.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';

const NOW = new Date('2026-10-15T15:00:00.000Z');
const storedImage = { id: 'img-new', url: 'https://img/new.jpg', format: 'jpg', bytes: 10, width: 1, height: 1, createdAt: NOW.toISOString() };

let profiles: FakeGoalkeeperProfileRepository;
let checks: FakeBackgroundCheckRepository;
let images: FakeImageRepository;
let sender: FakeSender;
let ids: number;

function deps() {
  return { profiles, checks, images, sender, idGenerator: { newId: () => `bc-${++ids}` }, clock: { now: () => NOW } };
}

function image(id: string) {
  return new StoredImage({ id, externalId: `ext-${id}`, url: `https://img/${id}.jpg`, format: 'jpg', bytes: 1, width: 1, height: 1, uploadedBy: 'gk-1', createdAt: NOW });
}

beforeEach(() => {
  profiles = new FakeGoalkeeperProfileRepository();
  checks = new FakeBackgroundCheckRepository();
  images = new FakeImageRepository();
  sender = new FakeSender();
  ids = 0;
  profiles.seed(buildGoalkeeperProfile('gk-1'));
});

describe('UploadBackgroundCheck (admin spec 030, contracts A3)', () => {
  const upload = (userId = 'gk-1') => new UploadBackgroundCheckCommandHandler(deps()).handle(new UploadBackgroundCheckCommand(userId, Buffer.from('x'), 'image/jpeg'));

  it('stores the image and creates a pending check', async () => {
    sender.respondWith(StoreImageCommand, { outcome: 'success', image: storedImage });

    expect(await upload()).toEqual({
      outcome: 'created',
      check: { id: 'bc-1', url: 'https://img/new.jpg', uploadedAt: NOW.toISOString(), status: 'pending', rejectionReason: null, expiresAt: null, expired: false },
    });
    expect(checks.all()).toHaveLength(1);
  });

  it('is only for active goalkeepers', async () => {
    expect(await upload('nobody')).toEqual({ outcome: 'not_a_goalkeeper' });
    expect(sender.sent).toHaveLength(0);
  });

  it('refuses a sixth active check before storing anything', async () => {
    for (let n = 1; n <= 5; n++) checks.seed(BackgroundCheck.upload(`old-${n}`, 'gk-1', `img-${n}`, NOW));

    expect(await upload()).toEqual({ outcome: 'limit_reached' });
    expect(sender.sent).toHaveLength(0);
  });

  it('rejected and expired checks do not count toward the limit', async () => {
    for (let n = 1; n <= 4; n++) checks.seed(BackgroundCheck.upload(`old-${n}`, 'gk-1', `img-${n}`, NOW));
    checks.seed(BackgroundCheck.upload('rejected', 'gk-1', 'img-r', NOW).reject('staff-1', NOW, 'Ilegible'));
    checks.seed(BackgroundCheck.upload('expired', 'gk-1', 'img-e', NOW).approve('staff-1', new Date('2025-01-01'), new Date('2025-06-01')));
    sender.respondWith(StoreImageCommand, { outcome: 'success', image: storedImage });

    expect((await upload()).outcome).toBe('created');
  });

  it('reports the storage being down without creating a check', async () => {
    sender.respondWith(StoreImageCommand, { outcome: 'storage_unavailable' });

    expect(await upload()).toEqual({ outcome: 'storage_unavailable' });
    expect(checks.all()).toHaveLength(0);
  });
});

describe('DeleteBackgroundCheck (contracts A4)', () => {
  const remove = (checkId: string) => new DeleteBackgroundCheckCommandHandler(deps()).handle(new DeleteBackgroundCheckCommand('gk-1', checkId));

  it('deletes a pending check and its image', async () => {
    checks.seed(BackgroundCheck.upload('bc-1', 'gk-1', 'img-1', NOW));
    sender.respondWith(DeleteImageCommand, { outcome: 'success' });

    expect(await remove('bc-1')).toEqual({ outcome: 'deleted' });
    expect(checks.all()).toHaveLength(0);
    expect(sender.sent).toEqual([new DeleteImageCommand('gk-1', 'img-1')]);
  });

  it('keeps a reviewed check, and knows nothing of another goalkeeper\'s', async () => {
    checks.seed(BackgroundCheck.upload('bc-1', 'gk-1', 'img-1', NOW).approve('staff-1', NOW));
    checks.seed(BackgroundCheck.upload('bc-2', 'gk-2', 'img-2', NOW));

    expect(await remove('bc-1')).toEqual({ outcome: 'reviewed' });
    expect(await remove('bc-2')).toEqual({ outcome: 'not_found' });
    expect(sender.sent).toHaveLength(0);
  });
});

describe('ListMyBackgroundChecks (contracts A2)', () => {
  it('lists the goalkeeper\'s checks newest first, with their images and expiry', async () => {
    images.seed(image('img-1'));
    images.seed(image('img-2'));
    checks.seed(BackgroundCheck.upload('bc-1', 'gk-1', 'img-1', new Date('2026-09-01')).approve('staff-1', new Date('2025-10-01'), new Date('2026-10-01')));
    checks.seed(BackgroundCheck.upload('bc-2', 'gk-1', 'img-2', new Date('2026-10-14')));

    const result = await new ListMyBackgroundChecksQueryHandler(deps()).handle(new ListMyBackgroundChecksQuery('gk-1'));

    expect(result).toEqual({
      outcome: 'ok',
      items: [
        { id: 'bc-2', url: 'https://img/img-2.jpg', uploadedAt: '2026-10-14T00:00:00.000Z', status: 'pending', rejectionReason: null, expiresAt: null, expired: false },
        { id: 'bc-1', url: 'https://img/img-1.jpg', uploadedAt: '2026-09-01T00:00:00.000Z', status: 'approved', rejectionReason: null, expiresAt: '2026-10-01T00:00:00.000Z', expired: true },
      ],
    });
  });

  it('is only for active goalkeepers', async () => {
    expect(await new ListMyBackgroundChecksQueryHandler(deps()).handle(new ListMyBackgroundChecksQuery('nobody'))).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
