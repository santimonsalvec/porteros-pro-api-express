import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testAppFactory.js';
import { seedRole, signInStaff } from '../adminTestHelpers.js';
import { signInClient, type TestApp } from '../walletTestHelpers.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING } from '../../fixtures/walletFixtures.js';
import { DocumentType } from '../../../src/domain/goalkeepers/documentType.js';
import { GoalkeeperRegistration } from '../../../src/domain/goalkeepers/goalkeeperRegistration.js';
import { StoredImage } from '../../../src/domain/images/storedImage.js';

const NUMBER = COLOMBIA_INVOICING.documentNumber;

async function world() {
  const context = await buildTestApp();
  context.documentTypeRepository.seed(new DocumentType({ id: 'dt-cc', code: COLOMBIA_INVOICING.documentType, name: 'Cédula de ciudadanía' }));
  const keeper = await signInClient(context, 'sub-0001');
  context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(keeper.userId));
  for (const [userId, number] of [[keeper.userId, NUMBER], ['other-keeper', '7777777']] as const) {
    const registration = GoalkeeperRegistration.createEmpty(`reg-${userId}`, userId);
    registration.saveIdentification({ documentType: COLOMBIA_INVOICING.documentType, documentNumber: number });
    context.goalkeeperRegistrationRepository.seed(registration);
  }
  context.imageRepository.seed(new StoredImage({ id: 'photo-a', externalId: 'x', url: 'https://img.test/front.jpg', format: 'jpg', bytes: 1, width: 1, height: 1, uploadedBy: keeper.userId, createdAt: context.clock.now() }));
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  const detail = await request(context.app).get(`/admin/goalkeepers/${keeper.userId}`).set('Authorization', `Bearer ${owner.token}`);
  return { context, keeper, owner, version: detail.body.version as string };
}

const patch = (context: TestApp, token: string, userId: string, body: object) =>
  request(context.app).patch(`/admin/goalkeepers/${userId}/document`).set('Authorization', `Bearer ${token}`).send(body);

describe("a goalkeeper's document in the admin (spec 005 of the admin, US5)", () => {
  it('shows the number and photos on their own read, audited without them', async () => {
    const { context, keeper, owner } = await world();

    const response = await request(context.app).get(`/admin/goalkeepers/${keeper.userId}/document`).set('Authorization', `Bearer ${owner.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      documentType: { code: COLOMBIA_INVOICING.documentType, name: 'Cédula de ciudadanía' }, documentNumber: NUMBER,
      photos: { front: 'https://img.test/front.jpg', back: null },
    });
    const reads = context.adminAuditLog.entries.filter((entry) => entry.kind === 'read');
    expect(reads).toEqual([expect.objectContaining({ action: 'goalkeeper.document.read', resourceType: 'goalkeeper', resourceId: keeper.userId, permission: 'goalkeepers.read' })]);
    expect(JSON.stringify(context.adminAuditLog.entries)).not.toContain(NUMBER);
    expect(JSON.stringify(context.adminAuditLog.entries)).not.toContain('front.jpg');
  });

  it('corrects the number, audited without the number before or after', async () => {
    const { context, keeper, owner, version } = await world();

    const response = await patch(context, owner.token, keeper.userId, { version, documentType: COLOMBIA_INVOICING.documentType, documentNumber: '1234567890' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: keeper.userId, idNumberChanged: true, changedFields: ['documentNumber'], version: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toContain('1234567890');
    expect((await context.goalkeeperProfileRepository.getByUserId(keeper.userId))!.documentNumber).toBe('1234567890');
    const write = context.adminAuditLog.entries.find((entry) => entry.action === 'goalkeeper.document.update')!;
    expect(write).toMatchObject({ kind: 'write', permission: 'goalkeepers.update', after: { idNumberChanged: true } });
    expect(JSON.stringify(write)).not.toMatch(/1234567890|1020|7777777/);
    expect(JSON.stringify(write)).not.toContain(NUMBER);
  });

  it('answers each refusal with its code', async () => {
    const { context, keeper, owner, version } = await world();
    const type = COLOMBIA_INVOICING.documentType;

    const cases: [object, number, string][] = [
      [{ version, documentType: type }, 400, 'validation_failed'],
      [{ version, documentType: type, documentNumber: '  ' }, 400, 'validation_failed'],
      [{ version, documentType: 'XX', documentNumber: '1' }, 409, 'invalid_document_type'],
      [{ version: 'old', documentType: type, documentNumber: '1' }, 409, 'stale_revision'],
      [{ version, documentType: type, documentNumber: '7777777' }, 409, 'document_already_registered'],
    ];
    for (const [body, status, code] of cases) {
      const response = await patch(context, owner.token, keeper.userId, body);
      expect([response.status, response.body.error], JSON.stringify(body)).toEqual([status, code]);
    }
    expect((await patch(context, owner.token, 'nobody', { version, documentType: type, documentNumber: '1' })).status).toBe(404);
  });

  it('reading needs goalkeepers.read and correcting needs goalkeepers.update', async () => {
    const { context, keeper, version } = await world();
    await seedRole(context, 'lector', ['goalkeepers.read']);
    const reader = await signInStaff(context, { key: 'lector', roleId: 'lector' });
    await seedRole(context, 'nada', ['users.read']);
    const nobody = await signInStaff(context, { key: 'nada', roleId: 'nada' });

    expect((await request(context.app).get(`/admin/goalkeepers/${keeper.userId}/document`).set('Authorization', `Bearer ${nobody.token}`)).status).toBe(403);
    expect((await patch(context, reader.token, keeper.userId, { version, documentType: 'CC', documentNumber: '1' })).status).toBe(403);
    expect(context.adminAuditLog.entries.filter((entry) => entry.kind === 'read' && entry.outcome !== 'denied')).toEqual([]);
  });
});
