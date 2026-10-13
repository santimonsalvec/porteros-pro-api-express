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

  it('keeps every field of a rate, a commission and booking rules (spec 004 of the admin)', () => {
    const rate = {
      id: 'r1', scope: 'zone', refId: 'bello', durationMinutes: 90, modality: 'futbol_11', level: 'competitive', amount: 60000,
      revision: 2, invalid: false, currency: 'COP', countryId: 'co', countryName: 'Colombia', cityId: 'med', cityName: 'Medellín',
      zoneName: 'Bello', zoneActive: true, targetValid: true, reason: 'Precio viejo',
    };
    expect(redactForAudit('rentalRate', rate)).toEqual(rate);
    const commission = { ...rate, scope: 'country', vatRateBps: 1900, vatAmount: 1330, totalWithVat: 8330 };
    delete (commission as Record<string, unknown>).durationMinutes;
    expect(redactForAudit('commissionSetting', commission)).toEqual(commission);
    const settings = {
      cityId: 'med', cityName: 'Medellín', countryId: 'co', countryName: 'Colombia', currency: 'COP', revision: 1,
      own: {
        bookingWindowDays: 7, minNoticeMinutes: 60, freeCancellationMinutes: 60, travelBufferMinutes: 45,
        leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: null, amount: 0 }] },
        goalkeeperPenalties: { lateNoticeMinutes: 120, lateSuspensionDays: 3, weeklyLimit: 3, windowDays: 7, limitSuspensionDays: 7 },
        checkInWindow: { opensMinutesBefore: 30, closesMinutesAfter: 15 }, noShowGraceMinutes: 60,
      },
      effective: { travelBufferMinutes: { value: 45, origin: 'city' } },
      defaults: { freeCancellationMinutes: 60 },
    };
    expect(redactForAudit('bookingSettings', { ...settings, country: settings.own })).toEqual({ ...settings, country: settings.own });
  });

  it('keeps a user correction without the phone number nor the email (spec 005 of the admin)', () => {
    const user = {
      id: 'u1', firstName: 'Laura', lastName: 'Gómez', countryCallingCode: '+57', numberEnding: '4567',
      changedFields: ['whatsAppNumber'], version: 'abc', isProfileComplete: true,
    };
    expect(redactForAudit('user', { ...user, whatsAppNumber: '3001234567', normalizedPhoneNumber: '573001234567', email: 'laura@x.co' })).toEqual(user);
  });

  it('keeps a document correction without the document number nor its photos', () => {
    const goalkeeper = { userId: 'g1', documentType: { code: 'CC', name: 'Cédula' }, idNumberChanged: true, changedFields: ['documentNumber'], version: 'v1' };
    expect(redactForAudit('goalkeeper', { ...goalkeeper, documentNumber: '1020304050', photos: { front: 'https://x' } })).toEqual(goalkeeper);
  });

  it('keeps a block or unblock, with its reason', () => {
    const block = { userId: 'u1', blocked: true, reason: 'Acoso a clientes', blockedAt: '2026-10-12T14:00:00.000Z', unblockedAt: null, availableForOffers: false };
    expect(redactForAudit('userBlock', { ...block, email: 'laura@x.co' })).toEqual(block);
  });
});

describe('operations writes (spec 006 of the admin)', () => {
  it('keeps an administrator cancellation, with its internal reason, and nothing from the bookings beyond their status', () => {
    const before = { requestId: 'r-1', status: 'partially_assigned', bookings: [{ bookingId: 'b-1', status: 'assigned' }] };
    expect(redactForAudit('request', { ...before, bookings: [{ ...before.bookings[0], checkIn: { photoUrl: 'https://x' }, cancellationNote: 'n' }] })).toEqual(before);

    const after = { requestId: 'r-1', bookingId: 'b-1', status: 'cancelled', cancelledBy: 'admin', cancelled: ['b-1'], refunds: 1, reason: 'La cancha cerró' };
    expect(redactForAudit('request', { ...after, comment: 'x', photoUrl: 'https://x', note: 'nota' })).toEqual(after);
  });

  it('keeps nothing of a booking read: a sensitive read stores no body', () => {
    expect(redactForAudit('booking', { photoUrl: 'https://x', at: '2026-10-18T20:00:00.000Z' })).toEqual({});
  });

  it('keeps the result of a test push, without its text', () => {
    const result = { userId: 'u-1', reached: 2, removed: 1, failed: 0, noDevice: false };
    expect(redactForAudit('user', { ...result, title: 'PorterosPRO', body: 'Notificación de prueba' })).toEqual(result);
  });

  // Finance (spec 007 of the admin).
  it('keeps the outcome of a forced reconciliation, without the payment references', () => {
    const kept = { topUpId: 't-1', status: 'approved', answer: 'APPROVED', result: 'applied', statusAfter: 'approved' };
    expect(redactForAudit('topUp', { ...kept, reference: 'PPR-1', gatewayTransactionId: 'w-9' })).toEqual(kept);
  });

  it("keeps an export's filters and row count, never personal data", () => {
    const filters = { status: 'rejected', kind: 'invoice', countryId: 'country-co', goalkeeperId: 'u-1', from: '2026-10-01', to: '2026-10-14', stale: true, rows: 12 };
    const topUpFilters = { status: 'pending', countryId: 'country-co', goalkeeperId: 'u-1', from: '2026-10-01', to: '2026-10-14', rows: 2 };
    expect(redactForAudit('topUps', { ...topUpFilters, email: 'ana@example.com' })).toEqual(topUpFilters);
    expect(redactForAudit('invoicingDocuments', { ...filters, buyer: { documentNumber: '123', email: 'a@b.co' } })).toEqual(filters);
  });

  it('keeps the revision and whether the credentials exist, never the credentials', () => {
    expect(
      redactForAudit('paymentGatewaySettings', { countryId: 'country-co', revision: 3, credentialsPresent: true, privateKey: 'prv', eventsSecret: 's', integritySecret: 'i' }),
    ).toEqual({ countryId: 'country-co', revision: 3, credentialsPresent: true });
    expect(redactForAudit('invoicingSettings', { countryId: 'country-co', provider: 'siigo', revision: 1, credentialsPresent: false, username: 'u', accessKey: 'k' })).toEqual({
      countryId: 'country-co',
      provider: 'siigo',
      revision: 1,
      credentialsPresent: false,
    });
  });
});
