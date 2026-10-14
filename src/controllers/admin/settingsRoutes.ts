import type { ISender } from '../../application/common/mediator/types.js';
import { SetInvoicingSettingsCommand } from '../../application/features/invoicing/commands/setInvoicingSettings/setInvoicingSettingsCommand.js';
import { GetInvoicingSettingsQuery } from '../../application/features/invoicing/queries/getInvoicingSettings/getInvoicingSettingsQuery.js';
import { SetGatewaySettingsCommand } from '../../application/features/payments/commands/setGatewaySettings/setGatewaySettingsCommand.js';
import { GetGatewaySettingsQuery } from '../../application/features/payments/queries/getGatewaySettings/getGatewaySettingsQuery.js';
import { ApiError } from '../apiError.js';
import { invoicingSettingsRequestSchema } from '../requests/invoicing/invoicingRequests.js';
import { gatewaySettingsRequestSchema } from '../requests/payments/gatewaySettingsRequest.js';
import { settingsBefore } from './adminRoute.js';
import { GetAccessSettingsQuery } from '../../application/features/auth/queries/getAccessSettings/getAccessSettingsQuery.js';
import { SetAccessSettingsCommand } from '../../application/features/auth/commands/setAccessSettings/setAccessSettingsCommand.js';
import { accessSettingsRequestSchema } from '../requests/auth/accessSettingsRequest.js';
import { parse, stale, type Route } from './geographyRoutes.js';

const settingsNotFound = (message: string) => new ApiError(404, 'settings_not_found', message);
const countryNotFound = () => new ApiError(404, 'country_not_found', 'No country exists with this id.');
const invalid = (fieldErrors: Record<string, string>) => new ApiError(400, 'validation_failed', 'One or more fields are missing or invalid.', fieldErrors);

/**
 * Each country's payment gateway and invoicing provider (features 022 and 023, moved here by admin
 * spec 007). Secrets never pass through: they live in Secret Manager. Every save names the revision
 * it read (FR-025), so two people never overwrite each other.
 */
export function registerSettingsRoutes(route: Route, mediator: ISender): void {
  // The sign-in code's expiry, one for the app and the admin web (admin spec 009, US4).
  route('get', '/access-settings', 'access.settings.manage', async (_req, res) => {
    res.status(200).json(await mediator.send(new GetAccessSettingsQuery()));
  });

  route(
    'put',
    '/access-settings',
    {
      permission: 'access.settings.manage',
      audit: {
        action: 'accessSettings.update',
        resourceType: 'accessSettings',
        resourceId: () => 'global',
        before: () => mediator.send(new GetAccessSettingsQuery()),
      },
    },
    async (req, res) => {
      const { revision, loginCodeExpiryMinutes } = parse(accessSettingsRequestSchema, req.body);
      const result = await mediator.send(new SetAccessSettingsCommand(req.adminAccess!.userId, loginCodeExpiryMinutes, revision));
      switch (result.outcome) {
        case 'saved':
          res.status(200).json(result.settings);
          return;
        case 'invalid':
          throw invalid(result.fieldErrors);
        case 'stale':
          throw stale();
      }
    },
  );

  route('get', '/payment-gateways/:countryId', 'payments.settings.manage', async (req, res) => {
    const result = await mediator.send(new GetGatewaySettingsQuery(req.params.countryId));
    if (result.outcome === 'not_found') throw settingsNotFound('No payment gateway is configured for this country.');
    res.status(200).json(result.settings);
  });

  route(
    'put',
    '/payment-gateways/:countryId',
    {
      permission: 'payments.settings.manage',
      audit: {
        action: 'paymentGatewaySettings.update',
        resourceType: 'paymentGatewaySettings',
        resourceId: (req) => String(req.params.countryId),
        before: (req) => settingsBefore(mediator.send(new GetGatewaySettingsQuery(String(req.params.countryId)))),
      },
    },
    async (req, res) => {
      const { revision, gateway, publicConfig, costs, amounts } = parse(gatewaySettingsRequestSchema, req.body);
      const result = await mediator.send(new SetGatewaySettingsCommand(req.adminAccess!.userId, req.params.countryId, gateway, publicConfig, costs, amounts, revision));
      switch (result.outcome) {
        case 'saved':
          res.status(200).json(result.settings);
          return;
        case 'country_not_found':
          throw countryNotFound();
        case 'invalid':
          throw invalid(result.fieldErrors);
        case 'stale':
          throw stale();
      }
    },
  );

  route('get', '/invoicing/settings/:countryId', 'invoicing.settings.manage', async (req, res) => {
    const result = await mediator.send(new GetInvoicingSettingsQuery(req.params.countryId));
    if (result.outcome === 'not_found') throw settingsNotFound('No invoicing provider is configured for this country.');
    res.status(200).json(result.settings);
  });

  route(
    'put',
    '/invoicing/settings/:countryId',
    {
      permission: 'invoicing.settings.manage',
      audit: {
        action: 'invoicingSettings.update',
        resourceType: 'invoicingSettings',
        resourceId: (req) => String(req.params.countryId),
        before: (req) => settingsBefore(mediator.send(new GetInvoicingSettingsQuery(String(req.params.countryId)))),
      },
    },
    async (req, res) => {
      const { revision, provider, config } = parse(invoicingSettingsRequestSchema, req.body);
      const result = await mediator.send(new SetInvoicingSettingsCommand(req.adminAccess!.userId, req.params.countryId, provider, config, revision));
      switch (result.outcome) {
        case 'saved':
          res.status(200).json(result.settings);
          return;
        case 'country_not_found':
          throw countryNotFound();
        case 'invalid':
          throw invalid(result.fieldErrors);
        case 'stale':
          throw stale();
      }
    },
  );
}
