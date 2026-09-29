import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TopUp } from '../../../src/domain/payments/topUp.js';
import { buildTestApp } from '../testAppFactory.js';

function seedTopUp(context: Awaited<ReturnType<typeof buildTestApp>>, status: TopUp['status'] = 'pending') {
  const topUp = TopUp.start({
    id: '0192f000-0000-7000-8000-000000000001',
    goalkeeperId: 'gk-private-id',
    countryId: 'country-co',
    gateway: 'wompi',
    environment: 'sandbox',
    amount: 20000,
    cost: 1464,
    currency: 'COP',
    now: context.clock.now(),
  });
  context.topUpRepository.put(TopUp.rehydrate({ ...topUp.toProps(), status }));
  return topUp;
}

describe('GET /pagos/retorno/{reference} — the page the gateway returns to', () => {
  it.each<[TopUp['status'], string]>([
    ['pending', 'Recarga pendiente'],
    ['approved', 'Recarga aprobada'],
    ['declined', 'Recarga no completada'],
    ['expired', 'Recarga no completada'],
  ])('shows a %s top-up as "%s" with its amounts, and nothing personal', async (status, title) => {
    const context = await buildTestApp({ paymentReturn: { appOpenUrl: 'https://app.porterospro.co/billetera' } });
    const topUp = seedTopUp(context, status);

    const response = await request(context.app).get(`/pagos/retorno/${topUp.reference}?id=1234-abc`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain(`<h1>${title}</h1>`);
    expect(response.text).toContain('Monto: 20.000 COP · Recibes: 18.536 COP');
    expect(response.text).toContain('href="https://app.porterospro.co/billetera">Volver a PorterosPRO</a>');
    expect(response.text).not.toContain('gk-private-id');
    expect(response.text).not.toContain(topUp.id);
  });

  it('never credits: the top-up stays pending', async () => {
    const context = await buildTestApp();
    const topUp = seedTopUp(context);

    await request(context.app).get(`/pagos/retorno/${topUp.reference}?id=forged-approved`);

    expect(context.topUpRepository.all()[0]?.status).toBe('pending');
    expect(context.walletStore.movements()).toEqual([]);
  });

  it('answers a generic page for an unknown reference, escaping what it echoes', async () => {
    const context = await buildTestApp({ paymentReturn: { appOpenUrl: 'https://app.example/"><script>x</script>' } });

    const response = await request(context.app).get(`/pagos/retorno/${encodeURIComponent('<script>alert(1)</script>')}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('No encontramos esta recarga');
    expect(response.text).not.toContain('<script>');
    expect(response.text).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('omits the button when no app address is configured', async () => {
    const context = await buildTestApp();
    const topUp = seedTopUp(context);

    const response = await request(context.app).get(`/pagos/retorno/${topUp.reference}`);

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
