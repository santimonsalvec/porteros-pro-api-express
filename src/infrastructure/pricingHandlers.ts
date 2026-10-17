import type { IUserRepository } from '../application/features/auth/common/ports.js';
import type { OfferReminderValues } from '../application/features/notifications/common/offerReminders.js';
import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { IClock } from '../application/common/clock.js';
import type { IIdGenerator } from '../application/features/auth/common/ports.js';
import type { PricingGeographyDependencies } from '../application/features/pricing/common/pricingGeography.js';
import type { GoalkeeperTargetDependencies } from '../application/features/pricing/common/goalkeeperTarget.js';
import type { IBookingSettingsAdmin, ICommissionAdmin, IRentalRateAdmin, IUnverifiedDiscountRepository } from '../application/features/pricing/common/ports.js';
import { ListUnverifiedDiscountsQuery } from '../application/features/pricing/queries/listUnverifiedDiscounts/listUnverifiedDiscountsQuery.js';
import { ListUnverifiedDiscountsQueryHandler } from '../application/features/pricing/queries/listUnverifiedDiscounts/listUnverifiedDiscountsQueryHandler.js';
import { CreateUnverifiedDiscountCommand } from '../application/features/pricing/commands/createUnverifiedDiscount/createUnverifiedDiscountCommand.js';
import { CreateUnverifiedDiscountCommandHandler } from '../application/features/pricing/commands/createUnverifiedDiscount/createUnverifiedDiscountCommandHandler.js';
import { UpdateUnverifiedDiscountCommand } from '../application/features/pricing/commands/updateUnverifiedDiscount/updateUnverifiedDiscountCommand.js';
import { UpdateUnverifiedDiscountCommandHandler } from '../application/features/pricing/commands/updateUnverifiedDiscount/updateUnverifiedDiscountCommandHandler.js';
import { DeleteUnverifiedDiscountCommand } from '../application/features/pricing/commands/deleteUnverifiedDiscount/deleteUnverifiedDiscountCommand.js';
import { DeleteUnverifiedDiscountCommandHandler } from '../application/features/pricing/commands/deleteUnverifiedDiscount/deleteUnverifiedDiscountCommandHandler.js';
import type { ITaxSettingsRepository } from '../application/features/operatingBalance/common/ports.js';
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
import { GetGoalkeeperCommissionRulesQuery } from '../application/features/pricing/queries/getGoalkeeperCommissionRules/getGoalkeeperCommissionRulesQuery.js';
import { GetGoalkeeperCommissionRulesQueryHandler } from '../application/features/pricing/queries/getGoalkeeperCommissionRules/getGoalkeeperCommissionRulesQueryHandler.js';
import { GetCommissionDeleteImpactQueryHandler } from '../application/features/pricing/queries/getCommissionDeleteImpact/getCommissionDeleteImpactQueryHandler.js';
import { GetCountryBookingSettingsQuery } from '../application/features/pricing/queries/getCountryBookingSettings/getCountryBookingSettingsQuery.js';
import { GetCountryBookingSettingsQueryHandler } from '../application/features/pricing/queries/getCountryBookingSettings/getCountryBookingSettingsQueryHandler.js';
import { GetMarketBookingSettingsQuery } from '../application/features/pricing/queries/getMarketBookingSettings/getMarketBookingSettingsQuery.js';
import { GetMarketBookingSettingsQueryHandler } from '../application/features/pricing/queries/getMarketBookingSettings/getMarketBookingSettingsQueryHandler.js';
import { SaveCountryBookingSettingsCommand } from '../application/features/pricing/commands/saveCountryBookingSettings/saveCountryBookingSettingsCommand.js';
import { SaveCountryBookingSettingsCommandHandler } from '../application/features/pricing/commands/saveCountryBookingSettings/saveCountryBookingSettingsCommandHandler.js';
import { SaveMarketBookingSettingsCommand } from '../application/features/pricing/commands/saveMarketBookingSettings/saveMarketBookingSettingsCommand.js';
import { SaveMarketBookingSettingsCommandHandler } from '../application/features/pricing/commands/saveMarketBookingSettings/saveMarketBookingSettingsCommandHandler.js';

/** The admin's stores plus, for the simulator, the very repositories and resolver the quote reads. */
export interface PricingHandlerDependencies extends PricingGeographyDependencies, Omit<PricingPreviewDependencies, 'taxSettings' | 'clock'> {
  /** Feature 033: goalkeeper rules hang from the goalkeeper's market and country. */
  goalkeeperProfiles: GoalkeeperTargetDependencies['goalkeeperProfiles'];
  users: Pick<IUserRepository, 'getByIds' | 'getById'>;
  rentalRates: IRentalRateAdmin;
  commissions: ICommissionAdmin;
  bookingSettings: IBookingSettingsAdmin;
  /** Admin spec 030. */
  discounts: IUnverifiedDiscountRepository;
  taxSettings: ITaxSettingsRepository;
  ids: IIdGenerator;
  clock: IClock;
  /** The environment's offer reminder values, shown as the platform level (spec 031, research §6). */
  platformReminders?: OfferReminderValues;
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
    { requestType: GetGoalkeeperCommissionRulesQuery, handler: new GetGoalkeeperCommissionRulesQueryHandler(deps) },
    { requestType: CreateCommissionCommand, handler: new CreateCommissionCommandHandler(deps) },
    { requestType: UpdateCommissionCommand, handler: new UpdateCommissionCommandHandler(deps) },
    { requestType: DeleteCommissionCommand, handler: new DeleteCommissionCommandHandler(deps) },
    { requestType: GetCountryBookingSettingsQuery, handler: new GetCountryBookingSettingsQueryHandler(deps) },
    { requestType: GetMarketBookingSettingsQuery, handler: new GetMarketBookingSettingsQueryHandler(deps) },
    { requestType: SaveCountryBookingSettingsCommand, handler: new SaveCountryBookingSettingsCommandHandler(deps) },
    { requestType: SaveMarketBookingSettingsCommand, handler: new SaveMarketBookingSettingsCommandHandler(deps) },
    { requestType: GetPricingPreviewQuery, handler: new GetPricingPreviewQueryHandler(deps) },
    { requestType: ListPricingAreasQuery, handler: new ListPricingAreasQueryHandler(deps) },
    { requestType: ListUnverifiedDiscountsQuery, handler: new ListUnverifiedDiscountsQueryHandler(deps) },
    { requestType: CreateUnverifiedDiscountCommand, handler: new CreateUnverifiedDiscountCommandHandler(deps) },
    { requestType: UpdateUnverifiedDiscountCommand, handler: new UpdateUnverifiedDiscountCommandHandler(deps) },
    { requestType: DeleteUnverifiedDiscountCommand, handler: new DeleteUnverifiedDiscountCommandHandler(deps) },
  ];
}
