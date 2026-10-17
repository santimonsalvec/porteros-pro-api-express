import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Deposit } from '../../../src/domain/deposits/deposit.js';
import { User } from '../../../src/domain/users/user.js';
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

  it("speaks the owner's language, else the browser's, else Spanish (feature 032)", async () => {
    const context = await buildTestApp({ paymentReturn: { appOpenUrl: 'https://app.porterospro.co/saldo-operativo' } });
    const deposit = seedDeposit(context, 'approved');
    const owner = User.createFromExternalIdentity({ id: 'gk-private-id', email: 'gk@example.com', displayName: null, provider: 'google', subject: 'sub-gk' });
    owner.preferredLanguage = 'en';
    await context.userRepository.add(owner);

    const chosen = await request(context.app).get(`/pagos/retorno/${deposit.reference}`).set('Accept-Language', 'es');
    owner.preferredLanguage = null;
    await context.userRepository.update(owner);
    const browser = await request(context.app).get(`/pagos/retorno/${deposit.reference}`).set('Accept-Language', 'en-US,en;q=0.9');
    const neither = await request(context.app).get(`/pagos/retorno/${deposit.reference}`);
    const unknown = await request(context.app).get('/pagos/retorno/nope').set('Accept-Language', 'en');

    expect(chosen.text).toContain('<html lang="en">');
    expect(chosen.text).toContain('<h1>Deposit approved</h1>');
    expect(chosen.text).toContain('We added 18.536 COP to your operating balance.');
    expect(chosen.text).toContain('Amount: 20.000 COP · You receive: 18.536 COP');
    expect(chosen.text).toContain('>Back to PorterosPRO</a>');
    expect(browser.text).toContain('<h1>Deposit approved</h1>');
    expect(neither.text).toContain('<html lang="es">');
    expect(neither.text).toContain('<h1>Depósito aprobado</h1>');
    expect(unknown.text).toContain('We could not find this deposit');
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
