import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../operatingBalanceTestHelpers.js';
import { buildGoalkeeperProfile } from '../../fixtures/operatingBalanceFixtures.js';
import { BackgroundCheck } from '../../../src/domain/goalkeepers/backgroundCheck.js';
import { PENDING_VETTING } from '../../../src/domain/goalkeepers/vetting.js';
import { StoredImage } from '../../../src/domain/images/storedImage.js';
import { VALIDATED_VETTING } from '../../fixtures/vettingFixtures.js';

async function world() {
  const context = await buildTestApp();
  const keeper = await signInClient(context, 'sub-4001');
  context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(keeper.userId, { vetting: PENDING_VETTING }));
  context.imageRepository.seed(new StoredImage({ id: 'img-bc', externalId: 'x', url: 'https://img.test/cert.jpg', format: 'jpg', bytes: 1, width: 1, height: 1, uploadedBy: keeper.userId, createdAt: context.clock.now() }));
  context.backgroundCheckRepository.seed(BackgroundCheck.upload('bc-1', keeper.userId, 'img-bc', context.clock.now()));
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, keeper, owner };
}

const read = (context: TestApp, token: string, userId: string) => request(context.app).get(`/admin/goalkeepers/${userId}/vetting`).set('Authorization', `Bearer ${token}`);
const post = (context: TestApp, token: string, path: string, body: object) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).send(body);

describe('goalkeeper validation in the admin (admin spec 030, contracts C2–C4)', () => {
  it('reads the validation tab, audited as a sensitive read', async () => {
    const { context, keeper, owner } = await world();

    const response = await read(context, owner.token, keeper.userId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      revision: 0,
      tier: 'unvalidated',
      backgroundChecks: [{ id: 'bc-1', status: 'pending', url: 'https://img.test/cert.jpg', revision: 0 }],
      canApproveValidation: { ok: false, missing: ['approved_background_check', 'pending_background_checks'] },
    });
    const reads = context.adminAuditLog.entries.filter((entry) => entry.action === 'goalkeeper.vetting.read');
    expect(reads).toHaveLength(1);
    expect(JSON.stringify(context.adminAuditLog.entries)).not.toContain('cert.jpg');
  });

  it('reviews the check, validates the goalkeeper and tells them, all audited without the documents', async () => {
    const { context, keeper, owner } = await world();

    const reviewed = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/background-checks/bc-1/review`, { revision: 0, decision: 'approve' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body).toMatchObject({ id: 'bc-1', status: 'approved', revision: 1 });

    const validated = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/validation`, { revision: 0, decision: 'approve' });
    expect(validated.status).toBe(200);
    expect(validated.body).toEqual({ revision: 1, tier: 'validated' });

    expect((await context.goalkeeperProfileRepository.getByUserId(keeper.userId))!.tier).toBe('validated');
    expect(context.notificationRepository.all().map((entry) => entry.type)).toEqual(['vetting.validated']);
    const actions = context.adminAuditLog.entries.filter((entry) => entry.kind === 'write').map((entry) => entry.action);
    expect(actions).toEqual(['goalkeeper.background_check.review', 'goalkeeper.validation.approve']);
    expect(JSON.stringify(context.adminAuditLog.entries)).not.toContain('cert.jpg');
  });

  it('says what is missing before it can validate, and rejects with a reason', async () => {
    const { context, keeper, owner } = await world();

    const early = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/validation`, { revision: 0, decision: 'approve' });
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ error: 'validation_not_ready', missing: ['approved_background_check', 'pending_background_checks'] });

    const noReason = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/validation`, { revision: 0, decision: 'reject' });
    expect(noReason.status).toBe(400);

    const rejected = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/validation`, { revision: 0, decision: 'reject', reason: 'Foto ilegible' });
    expect(rejected.status).toBe(200);
    expect(context.adminAuditLog.entries.some((entry) => entry.action === 'goalkeeper.validation.reject')).toBe(true);
  });

  it('answers stale_revision when someone changed it first', async () => {
    const { context, keeper, owner } = await world();

    const response = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/background-checks/bc-1/review`, { revision: 7, decision: 'approve' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('stale_revision');
  });

  it('a reviewed check cannot be reviewed again', async () => {
    const { context, keeper, owner } = await world();
    await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/background-checks/bc-1/review`, { revision: 0, decision: 'approve' });

    const again = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/background-checks/bc-1/review`, { revision: 1, decision: 'reject', reason: 'motivo' });

    expect(again.status).toBe(409);
    expect(again.body.error).toBe('background_check_reviewed');
  });

  it('needs goalkeepers.validate to decide and goalkeepers.read to look', async () => {
    const { context, keeper } = await world();
    await seedRole(context, 'reader', ['goalkeepers.read']);
    const reader = await signInStaff(context, { key: 'reader', roleId: 'reader', userId: 'reader-user' });
    await seedRole(context, 'nobody', ['users.read']);
    const nobody = await signInStaff(context, { key: 'nobody', roleId: 'nobody', userId: 'nobody-user' });

    expect((await read(context, reader.token, keeper.userId)).status).toBe(200);
    expect((await read(context, nobody.token, keeper.userId)).status).toBe(403);
    expect((await post(context, reader.token, `/admin/goalkeepers/${keeper.userId}/validation`, { revision: 0, decision: 'approve' })).status).toBe(403);
    expect((await request(context.app).get(`/admin/goalkeepers/${keeper.userId}/vetting`)).status).toBe(401);
  });

  it('is not found for someone who is not a goalkeeper', async () => {
    const { context, owner } = await world();

    expect((await read(context, owner.token, 'nobody')).status).toBe(404);
  });
});

describe('goalkeeper verification in the admin (admin spec 030, contracts C6, C8, C9)', () => {
  async function verifiedWorld() {
    const context = await buildTestApp();
    const keeper = await signInClient(context, 'sub-4101');
    const referrer = await signInClient(context, 'sub-4102');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(keeper.userId, { vetting: VALIDATED_VETTING }));
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(referrer.userId, { vetting: VALIDATED_VETTING }));
    const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
    return { context, keeper, referrer, owner };
  }

  it('verifies by referral and audits it', async () => {
    const { context, keeper, referrer, owner } = await verifiedWorld();

    const response = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/verification`, {
      revision: VALIDATED_VETTING.revision,
      method: 'referral',
      referrerId: referrer.userId,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ verified: true, revision: VALIDATED_VETTING.revision + 1, tier: 'verified' });
    expect(context.adminAuditLog.entries.some((entry) => entry.action === 'goalkeeper.verification.grant')).toBe(true);
    expect(context.notificationRepository.all().map((entry) => entry.type)).toContain('vetting.verified');
  });

  it('records a failed practice without the seal', async () => {
    const { context, keeper, owner } = await verifiedWorld();

    const response = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/verification`, {
      revision: VALIDATED_VETTING.revision,
      method: 'practice',
      evaluatedOn: '2026-09-20',
      result: 'failed',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ verified: false, tier: 'validated' });
  });

  it('refuses a bad referrer, missing evidence and a goalkeeper who is not validated', async () => {
    const { context, keeper, owner } = await verifiedWorld();
    const pending = await signInClient(context, 'sub-4103');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(pending.userId, { vetting: PENDING_VETTING }));
    const body = (extra: object) => ({ revision: VALIDATED_VETTING.revision, ...extra });

    const self = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/verification`, body({ method: 'referral', referrerId: keeper.userId }));
    expect(self.status).toBe(409);
    expect(self.body.error).toBe('invalid_referrer');

    const evidence = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/verification`, body({ method: 'other_platform', platformName: 'GoalApp', evidenceImageIds: ['nope'] }));
    expect(evidence.status).toBe(409);
    expect(evidence.body.error).toBe('invalid_evidence');

    const notValidated = await post(context, owner.token, `/admin/goalkeepers/${pending.userId}/verification`, { revision: 0, method: 'practice', evaluatedOn: '2026-09-20', result: 'passed' });
    expect(notValidated.status).toBe(409);
    expect(notValidated.body.error).toBe('not_validated');

    const badMethod = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/verification`, body({ method: 'magic' }));
    expect(badMethod.status).toBe(400);
  });

  it('uploads evidence and offers referrers by name', async () => {
    const { context, keeper, owner } = await verifiedWorld();
    const tinyJpeg = (await import('node:fs')).readFileSync(new URL('../../fixtures/tinyImage.jpg', import.meta.url));

    const uploaded = await request(context.app).post(`/admin/goalkeepers/${keeper.userId}/verification-evidence`).set('Authorization', `Bearer ${owner.token}`).attach('file', tinyJpeg, 'ev.jpg');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toEqual({ imageId: expect.any(String), url: expect.any(String) });

    const options = await request(context.app).get(`/admin/goalkeepers/${keeper.userId}/referrer-options?q=Ana`).set('Authorization', `Bearer ${owner.token}`);
    expect(options.status).toBe(200);
    expect(options.body.items.map((item: { userId: string }) => item.userId)).not.toContain(keeper.userId);
  });

  it('needs goalkeepers.verify, also to verify while validating', async () => {
    const { context, keeper, referrer } = await verifiedWorld();
    await seedRole(context, 'validator', ['goalkeepers.read', 'goalkeepers.validate']);
    const validator = await signInStaff(context, { key: 'validator', roleId: 'validator', userId: 'validator-user' });

    const verify = await post(context, validator.token, `/admin/goalkeepers/${keeper.userId}/verification`, { revision: VALIDATED_VETTING.revision, method: 'referral', referrerId: referrer.userId });
    expect(verify.status).toBe(403);

    const pending = await signInClient(context, 'sub-4104');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(pending.userId, { vetting: PENDING_VETTING }));
    context.backgroundCheckRepository.seed(BackgroundCheck.upload('bc-9', pending.userId, 'img', context.clock.now()).approve('staff-0', context.clock.now()));
    const combined = await post(context, validator.token, `/admin/goalkeepers/${pending.userId}/validation`, {
      revision: 0,
      decision: 'approve',
      verification: { method: 'referral', referrerId: referrer.userId },
    });
    expect(combined.status).toBe(403);
    expect((await context.goalkeeperProfileRepository.getByUserId(pending.userId))!.tier).toBe('unvalidated');
  });
});

describe('revoking in the admin (admin spec 030, contracts C5, C7)', () => {
  it('revokes the seal, then the validation; the match already taken stays with the goalkeeper', async () => {
    const { closedMatchSetUp } = await import('../closeHelpers.js');
    const { context, g, bookingId } = await closedMatchSetUp();
    const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
    const revision = (await context.goalkeeperProfileRepository.getByUserId(g.userId))!.vetting.revision;

    const seal = await post(context, owner.token, `/admin/goalkeepers/${g.userId}/verification/revoke`, { revision, reason: 'Quejas repetidas' });
    expect(seal.status).toBe(200);
    expect(seal.body).toEqual({ revision: revision + 1, tier: 'validated' });

    const validation = await post(context, owner.token, `/admin/goalkeepers/${g.userId}/validation/revoke`, { revision: revision + 1, reason: 'Antecedente falso' });
    expect(validation.status).toBe(200);
    expect(validation.body.tier).toBe('unvalidated');

    const agenda = await request(context.app).get('/goalkeepers/me/bookings').set('Authorization', `Bearer ${g.token}`);
    expect(agenda.body.items.map((item: { bookingId: string }) => item.bookingId)).toContain(bookingId);
    const actions = context.adminAuditLog.entries.filter((entry) => entry.kind === 'write').map((entry) => entry.action);
    expect(actions).toEqual(['goalkeeper.verification.revoke', 'goalkeeper.validation.revoke']);
  });

  it('answers not verified and needs a reason', async () => {
    const { context, keeper, owner } = await world();

    const notVerified = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/verification/revoke`, { revision: 0, reason: 'motivo' });
    expect(notVerified.status).toBe(409);
    expect(notVerified.body.error).toBe('not_verified');
    expect((await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/validation/revoke`, { revision: 0, reason: 'x' })).status).toBe(400);
  });
});

describe('the goalkeeper list by level (admin spec 030, contracts C1)', () => {
  it('filters by level and answers each row\'s', async () => {
    const { context, keeper, owner } = await world();
    const other = await signInClient(context, 'sub-4201');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(other.userId, { vetting: VALIDATED_VETTING }));

    const pending = await request(context.app).get('/admin/goalkeepers?vetting=unvalidated').set('Authorization', `Bearer ${owner.token}`);

    expect(pending.status).toBe(200);
    expect(pending.body.items.map((item: { userId: string }) => item.userId)).toEqual([keeper.userId]);
    expect(pending.body.items[0].vetting).toMatchObject({ tier: 'unvalidated' });
    expect((await request(context.app).get('/admin/goalkeepers?vetting=nope').set('Authorization', `Bearer ${owner.token}`)).status).toBe(400);
  });
});

describe('every refusal of the vetting routes (admin spec 030, contracts C3–C8)', () => {
  const tinyJpeg = async () => (await import('node:fs')).readFileSync(new URL('../../fixtures/tinyImage.jpg', import.meta.url));

  it('reviewing: someone who is not a goalkeeper, an unknown check and an expiry in the past', async () => {
    const { context, keeper, owner } = await world();

    expect((await post(context, owner.token, '/admin/goalkeepers/nobody/background-checks/bc-1/review', { revision: 0, decision: 'approve' })).status).toBe(404);
    const unknown = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/background-checks/nope/review`, { revision: 0, decision: 'approve' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('background_check_not_found');
    const past = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/background-checks/bc-1/review`, { revision: 0, decision: 'approve', expiresAt: '2020-01-01' });
    expect(past.status).toBe(400);
  });

  it('validating: someone who is not a goalkeeper, twice, with a stale revision, or verifying with a bad referrer or evidence', async () => {
    const { context, keeper, owner } = await world();
    context.backgroundCheckRepository.seed(BackgroundCheck.upload('bc-ok', keeper.userId, 'img', context.clock.now()).approve('staff-0', context.clock.now()));
    await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/background-checks/bc-1/review`, { revision: 0, decision: 'reject', reason: 'Ilegible' });
    const approve = (extra: object = {}) => post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/validation`, { revision: 0, decision: 'approve', ...extra });

    expect((await post(context, owner.token, '/admin/goalkeepers/nobody/validation', { revision: 0, decision: 'approve' })).status).toBe(404);
    expect((await approve({ revision: 5 })).body.error).toBe('stale_revision');
    expect((await approve({ verification: { method: 'referral', referrerId: keeper.userId } })).body.error).toBe('invalid_referrer');
    expect((await approve({ verification: { method: 'other_platform', platformName: 'GoalApp', evidenceImageIds: ['nope'] } })).body.error).toBe('invalid_evidence');
    expect((await approve({ verification: { method: 'practice', evaluatedOn: '2999-01-01', result: 'passed' } })).status).toBe(400);
    expect((await approve()).status).toBe(200);
    const twice = await approve({ revision: 1 });
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe('already_validated');
  });

  it('verifying: someone who is not a goalkeeper, twice, with a stale revision or a future practice', async () => {
    const context = await buildTestApp();
    const keeper = await signInClient(context, 'sub-4301');
    context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(keeper.userId, { vetting: VALIDATED_VETTING }));
    const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
    const verify = (extra: object) => post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/verification`, { revision: VALIDATED_VETTING.revision, method: 'practice', evaluatedOn: '2026-09-20', result: 'passed', ...extra });

    expect((await post(context, owner.token, '/admin/goalkeepers/nobody/verification', { revision: 0, method: 'practice', evaluatedOn: '2026-09-20', result: 'passed' })).status).toBe(404);
    expect((await verify({ revision: 99 })).body.error).toBe('stale_revision');
    expect((await verify({ evaluatedOn: '2999-01-01' })).status).toBe(400);
    expect((await verify({})).status).toBe(200);
    expect((await verify({ revision: VALIDATED_VETTING.revision + 1 })).body.error).toBe('already_verified');
  });

  it('uploading evidence: no image, too large, not a goalkeeper, or the storage down', async () => {
    const { context, keeper, owner } = await world();
    const upload = (userId: string, file?: Buffer) => {
      const call = request(context.app).post(`/admin/goalkeepers/${userId}/verification-evidence`).set('Authorization', `Bearer ${owner.token}`);
      return file ? call.attach('file', file, 'ev.jpg') : call;
    };

    expect((await upload(keeper.userId)).body.error).toBe('invalid_image');
    expect((await upload(keeper.userId, Buffer.alloc(11 * 1024 * 1024, 0))).status).toBe(413);
    expect((await upload('nobody', await tinyJpeg())).status).toBe(404);
    context.imageStorageProvider.uploadError = new Error('down');
    expect((await upload(keeper.userId, await tinyJpeg())).status).toBe(502);
  });

  it('revoking: someone who is not a goalkeeper, a stale revision, or a goalkeeper not validated', async () => {
    const { context, keeper, owner } = await world();

    expect((await post(context, owner.token, '/admin/goalkeepers/nobody/validation/revoke', { revision: 0, reason: 'motivo' })).status).toBe(404);
    const notValidated = await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/validation/revoke`, { revision: 0, reason: 'motivo' });
    expect(notValidated.status).toBe(409);
    expect(notValidated.body.error).toBe('not_validated');
    expect((await post(context, owner.token, `/admin/goalkeepers/${keeper.userId}/validation/revoke`, { revision: 3, reason: 'motivo' })).body.error).toBe('stale_revision');
  });
});
