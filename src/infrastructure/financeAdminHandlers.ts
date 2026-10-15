import type { IClock } from '../application/common/clock.js';
import type { HandlerRegistration } from '../application/common/mediator/mediator.js';
import type { IInvoicingDocumentAdminReader } from '../application/features/invoicing/common/adminPorts.js';
import type { IInvoicingDocumentRepository } from '../application/features/invoicing/common/ports.js';
import { ExportDocumentsQuery } from '../application/features/invoicing/queries/exportDocuments/exportDocumentsQuery.js';
import { ExportDocumentsQueryHandler } from '../application/features/invoicing/queries/exportDocuments/exportDocumentsQueryHandler.js';
import { GetDocumentAdminQuery } from '../application/features/invoicing/queries/getDocumentAdmin/getDocumentAdminQuery.js';
import { GetDocumentAdminQueryHandler } from '../application/features/invoicing/queries/getDocumentAdmin/getDocumentAdminQueryHandler.js';
import { ListDocumentsForAdminQuery } from '../application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQuery.js';
import { ListDocumentsForAdminQueryHandler } from '../application/features/invoicing/queries/listDocumentsForAdmin/listDocumentsForAdminQueryHandler.js';
import type { IUserRepository } from '../application/features/auth/common/ports.js';
import type { ICountryLookup } from '../application/features/goalkeeperRequests/common/ports.js';
import type { ICityRepository, IRegionRepository } from '../application/features/locations/common/ports.js';
import type { IOperatingBalanceAdminReader } from '../application/features/operatingBalance/common/adminPorts.js';
import { ListOperatingBalancesAdminQuery } from '../application/features/operatingBalance/queries/listOperatingBalancesAdmin/listOperatingBalancesAdminQuery.js';
import { ListOperatingBalancesAdminQueryHandler } from '../application/features/operatingBalance/queries/listOperatingBalancesAdmin/listOperatingBalancesAdminQueryHandler.js';
import type { IDepositAdminReader } from '../application/features/payments/common/adminPorts.js';
import { ExportDepositsQuery } from '../application/features/deposits/queries/exportDeposits/exportDepositsQuery.js';
import { ExportDepositsQueryHandler } from '../application/features/deposits/queries/exportDeposits/exportDepositsQueryHandler.js';
import { GetDepositAdminQuery } from '../application/features/deposits/queries/getDepositAdmin/getDepositAdminQuery.js';
import { GetDepositAdminQueryHandler } from '../application/features/deposits/queries/getDepositAdmin/getDepositAdminQueryHandler.js';
import { ListDepositsAdminQuery } from '../application/features/deposits/queries/listDepositsAdmin/listDepositsAdminQuery.js';
import { ListDepositsAdminQueryHandler } from '../application/features/deposits/queries/listDepositsAdmin/listDepositsAdminQueryHandler.js';

/** What the admin's finance reads need (porteros-pro-admin spec 007). */
export interface FinanceHandlerDependencies {
  depositReader: IDepositAdminReader;
  operatingBalanceReader: IOperatingBalanceAdminReader;
  cities: Pick<ICityRepository, 'getByIds'>;
  regions: Pick<IRegionRepository, 'getByIds'>;
  documentReader: IInvoicingDocumentAdminReader;
  documents: Pick<IInvoicingDocumentRepository, 'getById'>;
  users: Pick<IUserRepository, 'getByIds'>;
  countries: ICountryLookup;
  clock: IClock;
  /** `INVOICING_ENABLED` (feature 023). */
  issuingEnabled: boolean;
}

export function financeHandlerRegistrations(deps: FinanceHandlerDependencies): HandlerRegistration[] {
  const deposits = { reader: deps.depositReader, users: deps.users, countries: deps.countries };
  const documents = { ...deps, reader: deps.documentReader };
  return [
    {
      requestType: ListOperatingBalancesAdminQuery,
      handler: new ListOperatingBalancesAdminQueryHandler({ reader: deps.operatingBalanceReader, users: deps.users, cities: deps.cities, regions: deps.regions, countries: deps.countries }),
    },
    // The list existed (feature 023); spec 007 adds filters and reads through the admin reader.
    { requestType: ListDocumentsForAdminQuery, handler: new ListDocumentsForAdminQueryHandler(documents) },
    { requestType: GetDocumentAdminQuery, handler: new GetDocumentAdminQueryHandler(documents) },
    { requestType: ExportDocumentsQuery, handler: new ExportDocumentsQueryHandler(documents) },
    { requestType: ListDepositsAdminQuery, handler: new ListDepositsAdminQueryHandler(deposits) },
    { requestType: GetDepositAdminQuery, handler: new GetDepositAdminQueryHandler(deposits) },
    { requestType: ExportDepositsQuery, handler: new ExportDepositsQueryHandler(deposits) },
  ];
}
