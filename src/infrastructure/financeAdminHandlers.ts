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
import type { IWalletAdminReader } from '../application/features/wallet/common/adminPorts.js';
import { ListWalletsAdminQuery } from '../application/features/wallet/queries/listWalletsAdmin/listWalletsAdminQuery.js';
import { ListWalletsAdminQueryHandler } from '../application/features/wallet/queries/listWalletsAdmin/listWalletsAdminQueryHandler.js';
import type { ITopUpAdminReader } from '../application/features/payments/common/adminPorts.js';
import { ExportTopUpsQuery } from '../application/features/payments/queries/exportTopUps/exportTopUpsQuery.js';
import { ExportTopUpsQueryHandler } from '../application/features/payments/queries/exportTopUps/exportTopUpsQueryHandler.js';
import { GetTopUpAdminQuery } from '../application/features/payments/queries/getTopUpAdmin/getTopUpAdminQuery.js';
import { GetTopUpAdminQueryHandler } from '../application/features/payments/queries/getTopUpAdmin/getTopUpAdminQueryHandler.js';
import { ListTopUpsAdminQuery } from '../application/features/payments/queries/listTopUpsAdmin/listTopUpsAdminQuery.js';
import { ListTopUpsAdminQueryHandler } from '../application/features/payments/queries/listTopUpsAdmin/listTopUpsAdminQueryHandler.js';

/** What the admin's finance reads need (porteros-pro-admin spec 007). */
export interface FinanceHandlerDependencies {
  topUpReader: ITopUpAdminReader;
  walletReader: IWalletAdminReader;
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
  const topUps = { reader: deps.topUpReader, users: deps.users, countries: deps.countries };
  const documents = { ...deps, reader: deps.documentReader };
  return [
    {
      requestType: ListWalletsAdminQuery,
      handler: new ListWalletsAdminQueryHandler({ reader: deps.walletReader, users: deps.users, cities: deps.cities, regions: deps.regions, countries: deps.countries }),
    },
    // The list existed (feature 023); spec 007 adds filters and reads through the admin reader.
    { requestType: ListDocumentsForAdminQuery, handler: new ListDocumentsForAdminQueryHandler(documents) },
    { requestType: GetDocumentAdminQuery, handler: new GetDocumentAdminQueryHandler(documents) },
    { requestType: ExportDocumentsQuery, handler: new ExportDocumentsQueryHandler(documents) },
    { requestType: ListTopUpsAdminQuery, handler: new ListTopUpsAdminQueryHandler(topUps) },
    { requestType: GetTopUpAdminQuery, handler: new GetTopUpAdminQueryHandler(topUps) },
    { requestType: ExportTopUpsQuery, handler: new ExportTopUpsQueryHandler(topUps) },
  ];
}
