/**
 * Warnings a write can raise in the admin (spec 003, research §4): the write is held back with
 * `409 warnings_unacknowledged` until it is sent again with `acknowledgeWarnings: true`.
 */

export interface WarningData {
  country_code_changes_secrets: { from: string; to: string };
  document_type_not_invoiceable: { code: string };
  // Booking rules (admin spec 004, FR-010, FR-011).
  travel_buffer_exceeds_free_cancellation: { levels: string[] };
  required_setting_removed: { field: string; operatingMarkets: number };
}

export type WarningCode = keyof WarningData;

export interface Warning<C extends WarningCode = WarningCode> {
  code: C;
  message: string;
  data: WarningData[C];
}

const REQUIRED_NAMES: Record<string, string> = {
  bookingWindowDays: 'la ventana de reserva',
  minNoticeMinutes: 'la anticipación mínima',
  leadTimeSurcharge: 'el recargo por anticipación',
};

const MESSAGES: { [C in WarningCode]: (data: WarningData[C]) => string } = {
  country_code_changes_secrets: (d) =>
    `Los secretos de la pasarela y de la facturación se buscan por el código del país: pasarán de ${d.from} a ${d.to}`,
  document_type_not_invoiceable: () => 'Las facturas de porteros con este tipo serán rechazadas',
  travel_buffer_exceeds_free_cancellation: (d) =>
    `El margen de traslado supera el plazo de cancelación gratuita en ${d.levels.join(', ')}; conviene que no lo supere`,
  required_setting_removed: (d) => `${d.operatingMarkets} sedes dejarán de cotizar sin ${REQUIRED_NAMES[d.field] ?? d.field}`,
};

export function warning<C extends WarningCode>(code: C, data: WarningData[C]): Warning<C> {
  return { code, message: MESSAGES[code](data), data };
}

/** Whether a write must stop and ask for confirmation. */
export function needsAcknowledgement(warnings: readonly Warning[], acknowledged: boolean | undefined): boolean {
  return warnings.length > 0 && acknowledged !== true;
}
