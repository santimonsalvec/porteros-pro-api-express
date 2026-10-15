import { beforeEach, describe, expect, it } from 'vitest';
import { GetGoalkeeperVettingQuery } from '../../../../../src/application/features/goalkeepers/queries/getGoalkeeperVetting/getGoalkeeperVettingQuery.js';
import { GetGoalkeeperVettingQueryHandler } from '../../../../../src/application/features/goalkeepers/queries/getGoalkeeperVetting/getGoalkeeperVettingQueryHandler.js';
import { grantVerification, rejectValidation, PENDING_VETTING } from '../../../../../src/domain/goalkeepers/vetting.js';
import { StoredImage } from '../../../../../src/domain/images/storedImage.js';
import { Rating } from '../../../../../src/domain/ratings/rating.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { User } from '../../../../../src/domain/users/user.js';
import { FakeImageRepository } from '../../../../fakes/fakeImageRepository.js';
import { FakeRatingRepository } from '../../../../fakes/fakeRatingRepository.js';
import { FakeStaffMemberRepository } from '../../../../fakes/fakeStaffMemberRepository.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { VALIDATED_VETTING } from '../../../../fixtures/vettingFixtures.js';
import { VETTING_NOW, VettingHarness } from './vettingHarness.js';

let h: VettingHarness;
let images: FakeImageRepository;
let staff: FakeStaffMemberRepository;
let users: FakeUserRepository;
let ratings: Rating[];

function image(id: string) {
  return new StoredImage({ id, externalId: id, url: `https://img/${id}.jpg`, format: 'jpg', bytes: 1, width: 1, height: 1, uploadedBy: 'x', createdAt: VETTING_NOW });
}

function rating(n: number, stars: number) {
  return Rating.create({ id: `r-${n}`, bookingId: `b-${n}`, requestId: `q-${n}`, side: 'client', authorId: 'client-1', subjectId: 'gk-1', answer: true, stars, comment: null, createdAt: VETTING_NOW });
}

const read = (goalkeeperId = 'gk-1') =>
  new GetGoalkeeperVettingQueryHandler({ ...h.deps, images, staff, users, ratings: new FakeRatingRepository(() => ratings) }).handle(new GetGoalkeeperVettingQuery(goalkeeperId));

beforeEach(async () => {
  h = new VettingHarness();
  images = new FakeImageRepository();
  staff = new FakeStaffMemberRepository();
  users = new FakeUserRepository();
  ratings = [];
  ['photo-a', 'photo-b', 'img-bc-1', 'img-bc-2'].forEach((id) => images.seed(image(id)));
  await staff.add(StaffMember.rehydrate({ ...StaffMember.invite({ id: 's1', email: 'ana@porteros.pro', roleId: 'owner', invitedBy: 'x' }, VETTING_NOW), userId: 'staff-1', displayName: 'Ana Soporte' }));
});

describe('GetGoalkeeperVetting (admin spec 030, contracts C2)', () => {
  it('shows a pending goalkeeper with what is missing, the documents and the history', async () => {
    h.goalkeeper('gk-1', rejectValidation(PENDING_VETTING, 'staff-1', new Date('2026-10-12T00:00:00.000Z'), 'Foto ilegible'));
    h.check('gk-1', 'bc-1', 'pending');
    await h.log.append({ id: 'log-1', goalkeeperId: 'gk-1', at: new Date('2026-10-12T00:00:00.000Z'), actor: { kind: 'staff', userId: 'staff-1' }, action: 'validation.rejected', method: null, reason: 'Foto ilegible', details: {} });
    ratings = [rating(1, 5), rating(2, 4)];

    const result = await read();

    expect(result).toEqual({
      outcome: 'ok',
      vetting: {
        revision: 1,
        tier: 'unvalidated',
        validatedAt: null,
        validatedBy: null,
        lastRejection: { reason: 'Foto ilegible', at: '2026-10-12T00:00:00.000Z', by: { userId: 'staff-1', name: 'Ana Soporte' } },
        verification: null,
        autoVerificationBlocked: false,
        identification: { photos: { front: 'https://img/photo-a.jpg', back: 'https://img/photo-b.jpg' } },
        backgroundChecks: [
          {
            id: 'bc-1',
            url: 'https://img/img-bc-1.jpg',
            uploadedAt: '2026-10-10T00:00:00.000Z',
            status: 'pending',
            reviewedAt: null,
            reviewedBy: null,
            rejectionReason: null,
            expiresAt: null,
            expired: false,
            expiringSoon: false,
            revision: 0,
          },
        ],
        reputation: { ratingCount: 2, ratingAverage: 4.5 },
        canApproveValidation: { ok: false, missing: ['approved_background_check', 'pending_background_checks'] },
        history: [
          { id: 'log-1', at: '2026-10-12T00:00:00.000Z', actor: { kind: 'staff', userId: 'staff-1', name: 'Ana Soporte' }, action: 'validation.rejected', method: null, reason: 'Foto ilegible', details: {} },
        ],
      },
    });
  });

  it('names the referrer and says whether they are still an active goalkeeper', async () => {
    const referrer = User.createFromExternalIdentity({ id: 'gk-9', email: 'gk9@example.com', displayName: null, provider: 'google', subject: 'gk-9' });
    referrer.completeProfile('Luis', 'Arquero', '+57', '300 111 2222');
    users.seed(referrer);
    h.goalkeeper('gk-9', VALIDATED_VETTING);
    h.goalkeeper(
      'gk-1',
      grantVerification(VALIDATED_VETTING, { method: 'referral', at: VETTING_NOW, by: { kind: 'staff', userId: 'staff-1' }, details: { referrerId: 'gk-9' } }),
    );
    h.check('gk-1', 'bc-2');

    const result = await read();

    expect(result.outcome === 'ok' && result.vetting.verification).toEqual({
      method: 'referral',
      at: VETTING_NOW.toISOString(),
      by: { kind: 'staff', userId: 'staff-1', name: 'Ana Soporte' },
      details: { referrer: { userId: 'gk-9', name: 'Luis Arquero', active: true } },
    });
    expect(result.outcome === 'ok' && result.vetting.tier).toBe('verified');
  });

  it('shows the evidence of another platform and the system as the author of a reputation seal', async () => {
    images.seed(image('ev-1'));
    h.goalkeeper(
      'gk-1',
      grantVerification(VALIDATED_VETTING, { method: 'other_platform', at: VETTING_NOW, by: { kind: 'system' }, details: { platformName: 'GoalApp', evidenceImageIds: ['ev-1'] } }),
    );

    const result = await read();

    expect(result.outcome === 'ok' && result.vetting.verification).toMatchObject({
      by: { kind: 'system' },
      details: { platformName: 'GoalApp', evidence: [{ imageId: 'ev-1', url: 'https://img/ev-1.jpg' }] },
    });
  });

  it('is not found for someone who is not a goalkeeper', async () => {
    expect(await read('nobody')).toEqual({ outcome: 'not_a_goalkeeper' });
  });
});
