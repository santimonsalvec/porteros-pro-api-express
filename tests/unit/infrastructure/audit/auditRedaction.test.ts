import { describe, expect, it } from 'vitest';
import { redactForAudit } from '../../../../src/infrastructure/audit/auditRedaction.js';

describe('redactForAudit', () => {
  it('keeps only the allowed fields of a wallet movement', () => {
    expect(
      redactForAudit('wallet', { id: 'm-1', type: 'admin_adjustment', amount: 5000, balance: 12000, reason: 'Saldo', operationKey: 'k', internal: 'x' }),
    ).toEqual({ id: 'm-1', type: 'admin_adjustment', amount: 5000, balance: 12000, reason: 'Saldo', operationKey: 'k' });
  });

  it("keeps the gateway's environment but never its keys", () => {
    expect(
      redactForAudit('paymentGatewaySettings', {
        countryId: 'country-co',
        gateway: 'wompi',
        publicConfig: { publicKey: 'pub_test_x', environment: 'sandbox' },
        costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
        amounts: [20000, 50000],
      }),
    ).toEqual({
      countryId: 'country-co',
      gateway: 'wompi',
      publicConfig: { environment: 'sandbox' },
      costs: { percentBps: 265, fixed: 700, vatBps: 1900 },
      amounts: [20000, 50000],
    });
  });

  it("keeps the invoicing provider but never its configuration", () => {
    expect(redactForAudit('invoicingSettings', { countryId: 'country-co', provider: 'siigo', config: { username: 'u', accessKey: 'k' } })).toEqual({
      countryId: 'country-co',
      provider: 'siigo',
    });
  });

  it('drops secrets, identity documents, phone numbers and comments even when nested or allowed', () => {
    const redacted = redactForAudit('case', {
      caseId: 'c-1',
      status: 'resolved',
      resolution: { by: 'u', note: 'ok', token: 't', comment: 'No vino' },
      rating: { comment: 'No vino' },
      documentNumber: '123',
      whatsAppNumber: '300',
      phone: '300',
      password: 'p',
      clientSecret: 's',
      accessToken: 'a',
    });

    expect(redacted).toEqual({ caseId: 'c-1', status: 'resolved', resolution: { by: 'u', note: 'ok' } });
  });

  it('keeps the VAT rate, a document retry and a reversal', () => {
    expect(redactForAudit('taxSettings', { countryId: 'co', vatRateBps: 1900, updatedBy: 'u' })).toEqual({ countryId: 'co', vatRateBps: 1900, updatedBy: 'u' });
    expect(redactForAudit('invoicingDocument', { documentId: 'd-1', status: 'pending', attempts: 2, buyer: { documentNumber: '1' } })).toEqual({
      documentId: 'd-1',
      status: 'pending',
      attempts: 2,
    });
    expect(redactForAudit('withdrawal', { refund: true, liftSuspension: false, reason: 'Error', suspendedUntil: null })).toEqual({
      refund: true,
      liftSuspension: false,
      reason: 'Error',
      suspendedUntil: null,
    });
  });

  it('is null for an unknown resource type or a non-object', () => {
    expect(redactForAudit('mystery', { a: 1 })).toBeNull();
    expect(redactForAudit('wallet', null)).toBeNull();
    expect(redactForAudit('wallet', 'text')).toBeNull();
  });

  it('keeps who and why of a team change, and drops anything else', () => {
    expect(
      redactForAudit('staffMember', {
        staffId: 's-1',
        email: 'ana@example.com',
        displayName: 'Ana',
        role: { id: 'soporte', name: 'Soporte' },
        status: 'disabled',
        reason: 'Salió del equipo',
        userId: 'user-1',
        session: 'x',
      }),
    ).toEqual({ staffId: 's-1', email: 'ana@example.com', displayName: 'Ana', role: { id: 'soporte', name: 'Soporte' }, status: 'disabled', reason: 'Salió del equipo' });
    expect(
      redactForAudit('staffRole', { id: 'soporte', name: 'Soporte', description: 'x', permissions: ['cases.read'], memberCount: 2, reason: 'Ya no se usa', updatedAt: 'x' }),
    ).toEqual({ id: 'soporte', name: 'Soporte', description: 'x', permissions: ['cases.read'], memberCount: 2, reason: 'Ya no se usa' });
  });

  it('keeps the geography and catalog views of spec 003 of the admin, with their revision and reason', () => {
    expect(
      redactForAudit('country', { id: 'co', name: 'Colombia', countryCode: 'CO', dialCode: '+57', currency: 'COP', operating: true, regionCount: 33, revision: 2, reason: 'x', secretName: 'WOMPI_CO' }),
    ).toEqual({ id: 'co', name: 'Colombia', countryCode: 'CO', dialCode: '+57', currency: 'COP', operating: true, regionCount: 33, revision: 2, reason: 'x' });
    expect(redactForAudit('region', { id: 'ant', name: 'Antioquia', countryId: 'co', countryName: 'Colombia', cityCount: 125, revision: 0, extra: 1 })).toEqual({
      id: 'ant', name: 'Antioquia', countryId: 'co', countryName: 'Colombia', cityCount: 125, revision: 0,
    });
    expect(
      redactForAudit('city', {
        id: 'env', name: 'Envigado', region: { id: 'ant', name: 'Antioquia' }, country: { id: 'co', name: 'Colombia', countryCode: 'CO' },
        timeZone: 'America/Bogota', timeZoneValid: true, daneStateCode: '05', daneCityCode: '05266', zoneCity: { id: 'med', name: 'Medellín' },
        zoneCount: 0, satelliteCount: 0, state: 'operating', revision: 1, reason: 'r', readiness: { ready: true },
      }),
    ).toEqual({
      id: 'env', name: 'Envigado', region: { id: 'ant', name: 'Antioquia' }, country: { id: 'co', name: 'Colombia', countryCode: 'CO' },
      timeZone: 'America/Bogota', timeZoneValid: true, daneStateCode: '05', daneCityCode: '05266', zoneCity: { id: 'med', name: 'Medellín' },
      zoneCount: 0, satelliteCount: 0, state: 'operating', revision: 1, reason: 'r',
    });
    const geometry = { type: 'Polygon', coordinates: [[[-75.6, 6.2], [-75.5, 6.2], [-75.5, 6.3], [-75.6, 6.2]]] };
    expect(redactForAudit('zone', { id: 'z', cityId: 'med', name: 'Laureles', slug: 'laureles', active: false, displayOrder: 3, geometry, geometryValid: true, inUse: true, revision: 4, reason: 'cierre', note: 'n' })).toEqual({
      id: 'z', cityId: 'med', name: 'Laureles', slug: 'laureles', active: false, displayOrder: 3, geometry, geometryValid: true, inUse: true, revision: 4, reason: 'cierre',
    });
    expect(redactForAudit('documentType', { id: 'cc', code: 'cedula_ciudadania', name: 'Cédula', invoiceable: true, inUse: false, revision: 0, other: 1 })).toEqual({
      id: 'cc', code: 'cedula_ciudadania', name: 'Cédula', invoiceable: true, inUse: false, revision: 0,
    });
    expect(redactForAudit('matchSurface', { id: 'arena', name: 'Arena', active: true, order: 4, inUse: false, revision: 0, reason: 'nueva', x: 1 })).toEqual({
      id: 'arena', name: 'Arena', active: true, order: 4, inUse: false, revision: 0, reason: 'nueva',
    });
  });
});

