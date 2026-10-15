import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toCsv } from '../../../../../domain/common/csv.js';
import type { DepositStatus } from '../../../../../domain/deposits/deposit.js';
import { EXPORT_LIMIT, EXPORT_TIME_ZONE, exportDateTime } from '../../../../common/exportFormat.js';
import { depositNames, type DepositAdminDependencies } from '../../common/depositAdminViews.js';
import { ExportDepositsQuery, type ExportDepositsResult } from './exportDepositsQuery.js';

const COLUMNS = [
  'fecha_creacion', 'zona_horaria', 'referencia', 'portero', 'portero_id', 'pais', 'pasarela', 'entorno', 'estado',
  'monto', 'costo', 'neto', 'moneda', 'fecha_cierre', 'transaccion_pasarela',
] as const;

const STATUS: Record<DepositStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  declined: 'Rechazada',
  voided: 'Anulada',
  error: 'Con error',
  expired: 'Vencida',
};
const GATEWAY: Record<string, string> = { wompi: 'Wompi' };
const ENVIRONMENT: Record<string, string> = { sandbox: 'Pruebas', production: 'Producción' };

export class ExportDepositsQueryHandler implements IQueryHandler<ExportDepositsQuery, ExportDepositsResult> {
  constructor(private readonly deps: DepositAdminDependencies) {}

  async handle({ filter }: ExportDepositsQuery): Promise<ExportDepositsResult> {
    const count = await this.deps.reader.count(filter);
    if (count > EXPORT_LIMIT) return { outcome: 'too_large', count, limit: EXPORT_LIMIT };
    const deposits = await this.deps.reader.all(filter, EXPORT_LIMIT);
    const names = await depositNames(this.deps, deposits);
    const rows = deposits.map((deposit) => ({
      fecha_creacion: exportDateTime(deposit.createdAt),
      zona_horaria: EXPORT_TIME_ZONE,
      referencia: deposit.reference,
      portero: names.people(deposit.goalkeeperId).name,
      portero_id: deposit.goalkeeperId,
      pais: names.country(deposit.countryId),
      pasarela: GATEWAY[deposit.gateway] ?? deposit.gateway,
      entorno: ENVIRONMENT[deposit.environment] ?? deposit.environment,
      estado: STATUS[deposit.status],
      monto: deposit.amount,
      costo: deposit.cost,
      neto: deposit.net,
      moneda: deposit.currency,
      fecha_cierre: deposit.finalizedAt ? exportDateTime(deposit.finalizedAt) : null,
      transaccion_pasarela: deposit.gatewayTransactionId,
    }));
    return { outcome: 'ok', csv: toCsv(COLUMNS, rows), rows: rows.length };
  }
}
