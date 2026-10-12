import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { IClock } from '../application/common/clock.js';
import type { IIdGenerator } from '../application/features/auth/common/ports.js';
import type { PricingGeographyDependencies } from '../application/features/pricing/common/pricingGeography.js';
import type { IBookingSettingsAdmin, ICommissionAdmin, IRentalRateAdmin } from '../application/features/pricing/common/ports.js';
import type { ITaxSettingsRepository } from '../application/features/wallet/common/ports.js';
import { ListPricingAreasQuery } from '../application/features/pricing/queries/listPricingAreas/listPricingAreasQuery.js';
import { ListPricingAreasQueryHandler } from '../application/features/pricing/queries/listPricingAreas/listPricingAreasQueryHandler.js';
import { GetPricingPreviewQuery } from '../application/features/pricing/queries/getPricingPreview/getPricingPreviewQuery.js';
import { GetPricingPreviewQueryHandler, type PricingPreviewDependencies } from '../application/features/pricing/queries/getPricingPreview/getPricingPreviewQueryHandler.js';
import { CreateRentalRateCommand } from '../application/features/pricing/commands/createRentalRate/createRentalRateCommand.js';
import { CreateRentalRateCommandHandler } from '../application/features/pricing/commands/createRentalRate/createRentalRateCommandHandler.js';
import { UpdateRentalRateCommand } from '../application/features/pricing/commands/updateRentalRate/updateRentalRateCommand.js';
import { UpdateRentalRateCommandHandler } from '../application/features/pricing/commands/updateRentalRate/updateRentalRateCommandHandler.js';
import { DeleteRentalRateCommand } from '../application/features/pricing/commands/deleteRentalRate/deleteRentalRateCommand.js';
import { DeleteRentalRateCommandHandler } from '../application/features/pricing/commands/deleteRentalRate/deleteRentalRateCommandHandler.js';
import { ListRentalRatesQuery } from '../application/features/pricing/queries/listRentalRates/listRentalRatesQuery.js';
import { ListRentalRatesQueryHandler } from '../application/features/pricing/queries/listRentalRates/listRentalRatesQueryHandler.js';
import { GetRentalRateQuery } from '../application/features/pricing/queries/getRentalRate/getRentalRateQuery.js';
import { GetRentalRateQueryHandler } from '../application/features/pricing/queries/getRentalRate/getRentalRateQueryHandler.js';
import { GetRentalRateDeleteImpactQuery } from '../application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQuery.js';
import { GetRentalRateDeleteImpactQueryHandler } from '../application/features/pricing/queries/getRentalRateDeleteImpact/getRentalRateDeleteImpactQueryHandler.js';
import { CreateCommissionCommand } from '../application/features/pricing/commands/createCommission/createCommissionCommand.js';
import { CreateCommissionCommandHandler } from '../application/features/pricing/commands/createCommission/createCommissionCommandHandler.js';
import { UpdateCommissionCommand } from '../application/features/pricing/commands/updateCommission/updateCommissionCommand.js';
import { UpdateCommissionCommandHandler } from '../application/features/pricing/commands/updateCommission/updateCommissionCommandHandler.js';
import { DeleteCommissionCommand } from '../application/features/pricing/commands/deleteCommission/deleteCommissionCommand.js';
import { DeleteCommissionCommandHandler } from '../application/features/pricing/commands/deleteCommission/deleteCommissionCommandHandler.js';
import { ListCommissionsQuery } from '../application/features/pricing/queries/listCommissions/listCommissionsQuery.js';
import { ListCommissionsQueryHandler } from '../application/features/pricing/queries/listCommissions/listCommissionsQueryHandler.js';
import { GetCommissionQuery } from '../application/features/pricing/queries/getCommission/getCommissionQuery.js';
import { GetCommissionQueryHandler } from '../application/features/pricing/queries/getCommission/getCommissionQueryHandler.js';
import { GetCommissionDeleteImpactQuery } from '../application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQuery.js';
import { GetCommissionDeleteImpactQueryHandler } from '../application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQueryHandler.js';
import { GetCountryBookingSettingsQuery } from '../application/features/pricing/queries/getCountryBookingSettings/getCountryBookingSettingsQuery.js';
import { GetCountryBookingSettingsQueryHandler } from '../application/features/pricing/queries/getCountryBookingSettings/getCountryBookingSettingsQueryHandler.js';
import { GetCityBookingSettingsQuery } from '../application/features/pricing/queries/getCityBookingSettings/getCityBookingSettingsQuery.js';
import { GetCityBookingSettingsQueryHandler } from '../application/features/pricing/queries/getCityBookingSettings/getCityBookingSettingsQueryHandler.js';
import { SaveCountryBookingSettingsCommand } from '../application/features/pricing/commands/saveCountryBookingSettings/saveCountryBookingSettingsCommand.js';
import { SaveCountryBookingSettingsCommandHandler } from '../application/features/pricing/commands/saveCountryBookingSettings/saveCountryBookingSettingsCommandHandler.js';
import { SaveCityBookingSettingsCommand } from '../application/features/pricing/commands/saveCityBookingSettings/saveCityBookingSettingsCommand.js';
import { SaveCityBookingSettingsCommandHandler } from '../application/features/pricing/commands/saveCityBookingSettings/saveCityBookingSettingsCommandHandler.js';

/** The admin's stores plus, for the simulator, the very repositories and resolver the quote reads. */
export interface PricingHandlerDependencies extends PricingGeographyDependencies, Omit<PricingPreviewDependencies, 'taxSettings' | 'clock'> {
  rentalRates: IRentalRateAdmin;
  commissions: ICommissionAdmin;
  bookingSettings: IBookingSettingsAdmin;
  taxSettings: ITaxSettingsRepository;
  ids: IIdGenerator;
  clock: IClock;
}

/**
 * The admin web's price and booking-rule handlers (porteros-pro-admin spec 004), shared by the
 * composition root and the HTTP tests' fake-backed one so both register exactly the same set.
 */
export function pricingHandlerRegistrations(deps: PricingHandlerDependencies): HandlerRegistration[] {
  return [
    { requestType: ListRentalRatesQuery, handler: new ListRentalRatesQueryHandler(deps) },
    { requestType: GetRentalRateQuery, handler: new GetRentalRateQueryHandler(deps) },
    { requestType: GetRentalRateDeleteImpactQuery, handler: new GetRentalRateDeleteImpactQueryHandler(deps) },
    { requestType: CreateRentalRateCommand, handler: new CreateRentalRateCommandHandler(deps) },
    { requestType: UpdateRentalRateCommand, handler: new UpdateRentalRateCommandHandler(deps) },
    { requestType: DeleteRentalRateCommand, handler: new DeleteRentalRateCommandHandler(deps) },
    { requestType: ListCommissionsQuery, handler: new ListCommissionsQueryHandler(deps) },
    { requestType: GetCommissionQuery, handler: new GetCommissionQueryHandler(deps) },
    { requestType: GetCommissionDeleteImpactQuery, handler: new GetCommissionDeleteImpactQueryHandler(deps) },
    { requestType: CreateCommissionCommand, handler: new CreateCommissionCommandHandler(deps) },
    { requestType: UpdateCommissionCommand, handler: new UpdateCommissionCommandHandler(deps) },
    { requestType: DeleteCommissionCommand, handler: new DeleteCommissionCommandHandler(deps) },
    { requestType: GetCountryBookingSettingsQuery, handler: new GetCountryBookingSettingsQueryHandler(deps) },
    { requestType: GetCityBookingSettingsQuery, handler: new GetCityBookingSettingsQueryHandler(deps) },
    { requestType: SaveCountryBookingSettingsCommand, handler: new SaveCountryBookingSettingsCommandHandler(deps) },
    { requestType: SaveCityBookingSettingsCommand, handler: new SaveCityBookingSettingsCommandHandler(deps) },
    { requestType: GetPricingPreviewQuery, handler: new GetPricingPreviewQueryHandler(deps) },
    { requestType: ListPricingAreasQuery, handler: new ListPricingAreasQueryHandler(deps) },
  ];
}
