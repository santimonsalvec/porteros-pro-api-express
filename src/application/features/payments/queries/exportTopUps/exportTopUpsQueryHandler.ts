import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { toCsv } from '../../../../../domain/common/csv.js';
import type { TopUpStatus } from '../../../../../domain/payments/topUp.js';
import { EXPORT_LIMIT, EXPORT_TIME_ZONE, exportDateTime } from '../../../../common/exportFormat.js';
import { topUpNames, type TopUpAdminDependencies } from '../../common/topUpAdminViews.js';
import { ExportTopUpsQuery, type ExportTopUpsResult } from './exportTopUpsQuery.js';

const COLUMNS = [
  'fecha_creacion', 'zona_horaria', 'referencia', 'portero', 'portero_id', 'pais', 'pasarela', 'entorno', 'estado',
  'monto', 'costo', 'neto', 'moneda', 'fecha_cierre', 'transaccion_pasarela',
] as const;

const STATUS: Record<TopUpStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  declined: 'Rechazada',
  voided: 'Anulada',
  error: 'Con error',
  expired: 'Vencida',
};
const GATEWAY: Record<string, string> = { wompi: 'Wompi' };
const ENVIRONMENT: Record<string, string> = { sandbox: 'Pruebas', production: 'Producción' };

export class ExportTopUpsQueryHandler implements IQueryHandler<ExportTopUpsQuery, ExportTopUpsResult> {
  constructor(private readonly deps: TopUpAdminDependencies) {}

  async handle({ filter }: ExportTopUpsQuery): Promise<ExportTopUpsResult> {
    const count = await this.deps.reader.count(filter);
    if (count > EXPORT_LIMIT) return { outcome: 'too_large', count, limit: EXPORT_LIMIT };
    const topUps = await this.deps.reader.all(filter, EXPORT_LIMIT);
    const names = await topUpNames(this.deps, topUps);
    const rows = topUps.map((topUp) => ({
      fecha_creacion: exportDateTime(topUp.createdAt),
      zona_horaria: EXPORT_TIME_ZONE,
      referencia: topUp.reference,
      portero: names.people(topUp.goalkeeperId).name,
      portero_id: topUp.goalkeeperId,
      pais: names.country(topUp.countryId),
      pasarela: GATEWAY[topUp.gateway] ?? topUp.gateway,
      entorno: ENVIRONMENT[topUp.environment] ?? topUp.environment,
      estado: STATUS[topUp.status],
      monto: topUp.amount,
      costo: topUp.cost,
      neto: topUp.net,
      moneda: topUp.currency,
      fecha_cierre: topUp.finalizedAt ? exportDateTime(topUp.finalizedAt) : null,
      transaccion_pasarela: topUp.gatewayTransactionId,
    }));
    return { outcome: 'ok', csv: toCsv(COLUMNS, rows), rows: rows.length };
  }
}
