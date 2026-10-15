import request from 'supertest';
import { Region } from '../../src/domain/locations/region.js';
import { seedRole, signInStaff } from './adminTestHelpers.js';
import type { TestApp } from './operatingBalanceTestHelpers.js';

/** Calls as one signed-in member (or any bearer token). */
export const as = (context: TestApp, token: string) => ({
  get: (path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object = {}) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).send(body),
  patch: (path: string, body: object) => request(context.app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
  put: (path: string, body: object) => request(context.app).put(path).set('Authorization', `Bearer ${token}`).send(body),
});

/** An owner, a reader (`geography.read` only) and an editor (`geography.read` + `geography.manage`). */
export async function geographyStaff(context: TestApp) {
  await seedRole(context, 'lector', ['geography.read']);
  await seedRole(context, 'editor', ['geography.read', 'geography.manage']);
  const owner = await signInStaff(context, { key: 'dueno' });
  const reader = await signInStaff(context, { key: 'lector', roleId: 'lector' });
  const editor = await signInStaff(context, { key: 'editor', roleId: 'editor' });
  // The seeded regions have no country; Antioquia belongs to Colombia (`c1`) here.
  context.regionRepository.seed(new Region({ id: 'region-antioquia', name: 'Antioquia', countryId: 'c1' }));
  return { owner: as(context, owner.token), reader: as(context, reader.token), editor: as(context, editor.token) };
}
