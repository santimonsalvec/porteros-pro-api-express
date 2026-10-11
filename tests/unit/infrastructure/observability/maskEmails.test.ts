import { describe, expect, it } from 'vitest';
import { maskEmails } from '../../../../src/infrastructure/observability/maskEmails.js';

describe('maskEmails', () => {
  it('keeps the first letter and the domain of every email, at any depth', () => {
    const at = new Date('2026-10-08T14:00:00.000Z');

    expect(
      maskEmails({ resourceId: 'ana@example.com', before: { email: 'Luis.P@porteros.pro', roleIds: ['soporte'] }, note: 'de ana@example.com a otro', at, n: 3, none: null }),
    ).toEqual({ resourceId: 'a***@example.com', before: { email: 'L***@porteros.pro', roleIds: ['soporte'] }, note: 'de a***@example.com a otro', at, n: 3, none: null });
  });

  it('leaves text without emails as it is', () => {
    expect(maskEmails(['staff-1', 'sin correo', 42])).toEqual(['staff-1', 'sin correo', 42]);
  });
});
