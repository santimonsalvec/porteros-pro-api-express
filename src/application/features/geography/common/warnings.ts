/**
 * Warnings a write can raise in the admin (spec 003, research §4): the write is held back with
 * `409 warnings_unacknowledged` until it is sent again with `acknowledgeWarnings: true`.
 */

export interface WarningData {
  overlaps_zone: { zoneId: string; zoneName: string; overlapSquareMeters: number; winsZoneId: string; winsZoneName: string };
  far_from_city_zones: { maxDistanceKm: number };
  country_code_changes_secrets: { from: string; to: string };
  document_type_not_invoiceable: { code: string };
  time_zone_has_future_bookings: Record<string, never>;
  // Booking rules (admin spec 004, FR-010, FR-011).
  travel_buffer_exceeds_free_cancellation: { levels: string[] };
  required_setting_removed: { field: string; operatingCities: number };
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

const integer = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

const MESSAGES: { [C in WarningCode]: (data: WarningData[C]) => string } = {
  overlaps_zone: (d) =>
    `Se solapa con ${d.zoneName} (${integer.format(d.overlapSquareMeters)} m²); en el área común gana ${d.winsZoneName}`,
  far_from_city_zones: (d) => `Queda a ${oneDecimal.format(d.maxDistanceKm)} km de las demás zonas de la ciudad`,
  country_code_changes_secrets: (d) =>
    `Los secretos de la pasarela y de la facturación se buscan por el código del país: pasarán de ${d.from} a ${d.to}`,
  document_type_not_invoiceable: () => 'Las facturas de porteros con este tipo serán rechazadas',
  time_zone_has_future_bookings: () => 'Hay partidos futuros en esta ciudad: conservan su hora real y solo cambia cómo se muestran',
  travel_buffer_exceeds_free_cancellation: (d) =>
    `El margen de traslado supera el plazo de cancelación gratuita en ${d.levels.join(', ')}; conviene que no lo supere`,
  required_setting_removed: (d) => `${d.operatingCities} ciudades en operación dejarán de cotizar sin ${REQUIRED_NAMES[d.field] ?? d.field}`,
};

export function warning<C extends WarningCode>(code: C, data: WarningData[C]): Warning<C> {
  return { code, message: MESSAGES[code](data), data };
}

/** Whether a write must stop and ask for confirmation. */
export function needsAcknowledgement(warnings: readonly Warning[], acknowledged: boolean | undefined): boolean {
  return warnings.length > 0 && acknowledged !== true;
}
