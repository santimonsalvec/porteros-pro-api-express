import { Router, type Response } from 'express';
import type { ISender } from '../application/common/mediator/types.js';
import {
  GetTopUpByReferenceQuery,
  type TopUpReturnView,
} from '../application/features/payments/queries/getTopUpByReference/getTopUpByReferenceQuery.js';
import { formatAmount } from '../domain/notifications/outcomeMessages.js';

/** Where the return page's button goes, and the app link association (research.md §8). Empty = not configured. */
export interface PaymentReturnSettings {
  appOpenUrl: string;
  androidPackage: string;
  androidCertSha256: string[];
  iosAppId: string;
}

export interface PaymentReturnControllerDependencies {
  mediator: ISender;
  paymentReturn: PaymentReturnSettings;
}

const RETURN_PATH = '/pagos/retorno';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function describe(topUp: TopUpReturnView): { title: string; detail: string } {
  switch (topUp.status) {
    case 'approved':
      return { title: 'Recarga aprobada', detail: `Acreditamos ${formatAmount(topUp.net, topUp.currency)} a tu billetera.` };
    case 'pending':
      return { title: 'Recarga pendiente', detail: 'Estamos esperando la confirmación del pago. Te avisaremos cuando se acredite.' };
    case 'declined':
    case 'voided':
    case 'error':
    case 'expired':
      return { title: 'Recarga no completada', detail: 'El pago no se completó. Puedes intentar con otro medio de pago.' };
  }
}

function page(settings: PaymentReturnSettings, title: string, paragraphs: string[]): string {
  const button = settings.appOpenUrl
    ? `<a class="button" href="${escapeHtml(settings.appOpenUrl)}">Volver a PorterosPRO</a>`
    : '<p>Ya puedes volver a la aplicación de PorterosPRO.</p>';
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · PorterosPRO</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f7f5;color:#1b2a1f}
main{max-width:28rem;margin:0 auto;padding:3rem 1rem;text-align:center}
h1{font-size:1.5rem;margin:0 0 1rem}
p{line-height:1.5;margin:0 0 .75rem}
.button{display:inline-block;margin-top:1.5rem;padding:.875rem 1.5rem;border-radius:.75rem;background:#1f7a3d;color:#fff;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
${paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('\n')}
${button}
</main>
</body>
</html>`;
}

function sendPage(res: Response, html: string): void {
  res
    .status(200)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Robots-Tag': 'noindex',
    })
    .send(html);
}

/**
 * The page a payment gateway returns to (clarification 1): public, read-only, in Spanish. It shows
 * the status and amounts only — never who paid — and never credits: only the gateway's
 * confirmation or the reconciliation does. The `.well-known` files let the app open it directly.
 */
export function createPaymentReturnController(deps: PaymentReturnControllerDependencies): Router {
  const router = Router();
  const settings = deps.paymentReturn;

  router.get(`${RETURN_PATH}/:reference`, async (req, res) => {
    const result = await deps.mediator.send(new GetTopUpByReferenceQuery(req.params.reference));
    if (result.outcome === 'not_found') {
      sendPage(res, page(settings, 'No encontramos esta recarga', ['Revisa el estado de tus recargas en la aplicación.']));
      return;
    }
    const { title, detail } = describe(result.topUp);
    sendPage(
      res,
      page(settings, title, [
        detail,
        `Monto: ${formatAmount(result.topUp.amount, result.topUp.currency)} · Recibes: ${formatAmount(result.topUp.net, result.topUp.currency)}`,
      ]),
    );
  });

  router.get('/.well-known/assetlinks.json', (_req, res) => {
    if (!settings.androidPackage || settings.androidCertSha256.length === 0) {
      res.status(404).json({});
      return;
    }
    res.status(200).json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: settings.androidPackage, sha256_cert_fingerprints: settings.androidCertSha256 },
      },
    ]);
  });

  router.get('/.well-known/apple-app-site-association', (_req, res) => {
    if (!settings.iosAppId) {
      res.status(404).json({});
      return;
    }
    res.status(200).json({
      applinks: {
        details: [{ appIDs: [settings.iosAppId], components: [{ '/': `${RETURN_PATH}/*` }], appID: settings.iosAppId, paths: [`${RETURN_PATH}/*`] }],
      },
    });
  });

  return router;
}
