import { seedRole, signInStaff } from './adminTestHelpers.js';
import { as } from './geographyTestHelpers.js';
import type { TestApp } from './walletTestHelpers.js';

/** A reader (`pricing.read` only) and an editor (`pricing.read` + `pricing.manage`) of prices (spec 004 of the admin). */
export async function pricingStaff(context: TestApp) {
  await seedRole(context, 'precios-lector', ['pricing.read']);
  await seedRole(context, 'precios-editor', ['pricing.read', 'pricing.manage']);
  const reader = await signInStaff(context, { key: 'precios-lector', roleId: 'precios-lector' });
  const editor = await signInStaff(context, { key: 'precios-editor', roleId: 'precios-editor' });
  return { reader: as(context, reader.token), editor: as(context, editor.token) };
}
