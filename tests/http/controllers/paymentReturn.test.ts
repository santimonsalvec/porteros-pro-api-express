import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Deposit } from '../../../src/domain/deposits/deposit.js';
import { buildTestApp } from '../testAppFactory.js';

function seedDeposit(context: Awaited<ReturnType<typeof buildTestApp>>, status: Deposit['status'] = 'pending') {
  const deposit = Deposit.start({
    id: '0192f000-0000-7000-8000-000000000001',
    goalkeeperId: 'gk-private-id',
    countryId: 'country-co', marketId: 'city-cali',
    gateway: 'wompi',
    environment: 'sandbox',
    amount: 20000,
    cost: 1464,
    currency: 'COP',
    now: context.clock.now(),
  });
  context.depositRepository.put(Deposit.rehydrate({ ...deposit.toProps(), status }));
  return deposit;
}

describe('GET /pagos/retorno/{reference} — the page the gateway returns to', () => {
  it.each<[Deposit['status'], string]>([
    ['pending', 'Depósito pendiente'],
    ['approved', 'Depósito aprobado'],
    ['declined', 'Depósito no completado'],
    ['expired', 'Depósito no completado'],
  ])('shows a %s deposit as "%s" with its amounts, and nothing personal', async (status, title) => {
    const context = await buildTestApp({ paymentReturn: { appOpenUrl: 'https://app.porterospro.co/saldo-operativo' } });
    const deposit = seedDeposit(context, status);

    const response = await request(context.app).get(`/pagos/retorno/${deposit.reference}?id=1234-abc`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain(`<h1>${title}</h1>`);
    expect(response.text).toContain('Monto: 20.000 COP · Recibes: 18.536 COP');
    expect(response.text).toContain('href="https://app.porterospro.co/saldo-operativo">Volver a PorterosPRO</a>');
    expect(response.text).not.toContain('gk-private-id');
    expect(response.text).not.toContain(deposit.id);
  });

  it('never credits: the deposit stays pending', async () => {
    const context = await buildTestApp();
    const deposit = seedDeposit(context);

    await request(context.app).get(`/pagos/retorno/${deposit.reference}?id=forged-approved`);

    expect(context.depositRepository.all()[0]?.status).toBe('pending');
    expect(context.operatingBalanceStore.movements()).toEqual([]);
  });

  it('answers a generic page for an unknown reference, escaping what it echoes', async () => {
    const context = await buildTestApp({ paymentReturn: { appOpenUrl: 'https://app.example/"><script>x</script>' } });

    const response = await request(context.app).get(`/pagos/retorno/${encodeURIComponent('<script>alert(1)</script>')}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('No encontramos este depósito');
    expect(response.text).not.toContain('<script>');
    expect(response.text).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('omits the button when no app address is configured', async () => {
    const context = await buildTestApp();
    const deposit = seedDeposit(context);

    const response = await request(context.app).get(`/pagos/retorno/${deposit.reference}`);

    expect(response.text).not.toContain('Volver a PorterosPRO</a>');
  });
});

describe('/.well-known — app link association', () => {
  it('serves both files from configuration', async () => {
    const context = await buildTestApp({
      paymentReturn: { androidPackage: 'co.porterospro.app', androidCertSha256: ['AB:CD'], iosAppId: 'TEAM123.co.porterospro.app' },
    });

    const android = await request(context.app).get('/.well-known/assetlinks.json');
    const ios = await request(context.app).get('/.well-known/apple-app-site-association');

    expect(android.status).toBe(200);
    expect(android.headers['content-type']).toMatch(/^application\/json/);
    expect(android.body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'co.porterospro.app', sha256_cert_fingerprints: ['AB:CD'] },
      },
    ]);
    expect(ios.status).toBe(200);
    expect(ios.headers['content-type']).toMatch(/^application\/json/);
    expect(ios.body.applinks.details[0]).toMatchObject({ appIDs: ['TEAM123.co.porterospro.app'], components: [{ '/': '/pagos/retorno/*' }] });
  });

  it('answers 404 when not configured', async () => {
    const context = await buildTestApp();

    expect((await request(context.app).get('/.well-known/assetlinks.json')).status).toBe(404);
    expect((await request(context.app).get('/.well-known/apple-app-site-association')).status).toBe(404);
  });
});
