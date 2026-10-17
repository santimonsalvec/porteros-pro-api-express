import type { Modality } from '../../bookings/matchFormat.js';
import type { MessageCatalog } from './catalog.js';

const MODALITY: Record<Modality, string> = {
  micro_futsal: 'Micro / Futsal',
  futbol_medio: 'Fútbol medio',
  futbol_11: 'Fútbol 11',
  any: 'Abierto',
};

/** The Spanish sentences: the texts every notice carried before feature 032, verbatim. */
export const es: MessageCatalog = {
  modality: (modality) => MODALITY[modality],
  yourZone: 'tu zona',
  where: (place, when) => `en ${place} · ${when}`,

  singleOffer: ({ modality, place, when, durationMinutes, surfaceName }) => ({
    title: modality ? `Partido disponible · ${modality}` : 'Partido disponible',
    body: `${place} · ${when} · ${durationMinutes} min${surfaceName ? ` · ${surfaceName}` : ''}`,
  }),
  groupedOffer: (count) => ({ title: 'Partidos disponibles', body: `Hay ${count} partidos disponibles en tus zonas` }),

  requestExpired: (where) => ({ title: 'Sin portero para tu partido', body: `No logramos hallar un portero para tu partido ${where}` }),
  requestPartiallyExpired: (where, assigned, total) => ({
    title: 'Portero confirmado parcialmente',
    body: `Conseguimos ${assigned} de ${total} porteros para tu partido ${where}`,
  }),
  requestCancelled: (where) => ({
    title: 'Solicitud cancelada',
    body: `Cancelamos tu solicitud ${where}: no se confirmaron todos los porteros a tiempo.`,
  }),
  // The time already ends in "a. m." / "p. m.", so no extra period after it.
  bookingCancelled: (where, by, refund) => ({
    title: 'Partido cancelado',
    body: `${by === 'client' ? 'El cliente canceló tu partido' : by === 'admin' ? 'PorterosPRO canceló tu partido' : 'Se canceló tu partido'} ${where}${refund ? ` Te devolvimos ${refund}.` : ''}`,
  }),
  adminCancelled: (where, whole) => ({
    title: whole ? 'Partido cancelado' : 'Portero cancelado',
    body: whole ? `PorterosPRO canceló tu partido ${where}` : `PorterosPRO canceló uno de los porteros de tu partido ${where}`,
  }),

  yourGoalkeeper: 'tu portero',
  theClient: 'el cliente',
  list: (items) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`),
  goalkeeperAssigned: (where, replacement, contact) => ({
    title: replacement ? 'Encontramos otro portero' : 'Portero confirmado',
    body: `${replacement ? `Encontramos otro portero para tu partido ${where}` : `Un portero tomó tu partido ${where}`}${contact ? ` Es ${contact}.` : ''} Seguimos buscando el otro.`,
  }),
  requestComplete: (where, goalkeeperCount, contacts) => ({
    title: 'Solicitud completa',
    body: `${goalkeeperCount > 1 ? `¡Listo! Tus ${goalkeeperCount} porteros están confirmados` : '¡Listo! Tu portero está confirmado'} para el partido ${where}${
      contacts && contacts.length > 0 ? ` ${goalkeeperCount > 1 ? 'Son' : 'Es'} ${es.list(contacts)}.` : ' Verás sus datos 1 hora antes.'
    }`,
  }),
  contactsVisible: (where, contacts) => ({
    title: contacts.length > 1 ? 'Tus porteros' : 'Tu portero',
    body: `${contacts.length > 1 ? 'Tus porteros' : 'Tu portero'} para el partido ${where}: ${es.list(contacts)}.`,
  }),
  clientContactVisible: (where, contact) => ({ title: 'Tu cliente', body: `Tu cliente para el partido ${where}: ${contact}.` }),

  goalkeeperArrived: (where) => ({ title: 'Tu portero llegó', body: `Tu portero llegó al partido ${where}` }),
  checkInMissed: (where, name, whatsApp) => ({
    title: 'Tu portero no ha confirmado su llegada',
    body: `${name ? `Tu portero ${name}` : 'Tu portero'} no ha confirmado su llegada al partido ${where}${whatsApp ? ` Escríbele: WhatsApp ${whatsApp}.` : ''}`,
  }),
  checkInOpen: (where) => ({ title: 'Confirma tu llegada', body: `Ya puedes confirmar tu llegada al partido ${where} Tómate una foto en la cancha.` }),
  checkInLastCall: (where) => ({ title: 'Te quedan 10 minutos', body: `Te quedan 10 minutos para confirmar tu llegada al partido ${where}` }),
  noShow: (where, suspendedUntil) => ({
    title: 'Inasistencia registrada',
    body: `No confirmaste tu llegada al partido ${where} y quedó registrado como inasistencia.${suspendedUntil ? ` Quedaste suspendido hasta el ${suspendedUntil}` : ''}`,
  }),

  goalkeeperWithdrew: (where, replaced) => ({
    title: 'Tu portero se retiró',
    body: `Tu portero se retiró del partido ${where} ${replaced ? 'Ya estamos buscando otro portero.' : 'No alcanzamos a buscar otro portero.'}`,
  }),
  goalkeeperSuspended: (until) => ({
    title: 'Quedaste suspendido',
    body: `Quedaste suspendido hasta el ${until} por retirarte de un partido. Mientras tanto no verás partidos ni recibirás ofertas.`,
  }),

  validated: () => ({ title: 'Ya puedes recibir solicitudes', body: 'Terminamos de validarte. Activa tu disponibilidad para empezar a ver partidos.' }),
  validationRejected: (reason) => ({ title: 'Revisa tus documentos', body: `Tu validación fue rechazada: ${reason}. Corrige y vuelve a cargar tus documentos.` }),
  verified: () => ({ title: 'Ya tienes el sello de verificado', body: 'Recibirás solicitudes de forma prioritaria y cobrarás la tarifa completa.' }),

  depositApproved: (net, balance) => ({ title: 'Depósito aprobado', body: `Depósito aprobado: +${net}. Tu saldo operativo es ${balance}.` }),
  depositFailed: (amount) => ({ title: 'Depósito no completado', body: `Tu depósito de ${amount} no se completó. Puedes intentar con otro medio de pago.` }),
  operatingBalanceAdjusted: (signedAmount, reason, balance) => ({
    title: 'Tu saldo operativo cambió',
    body: `${signedAmount} (${reason}). Tu saldo operativo es ${balance}.`,
  }),

  closureRequested: () => ({ title: 'Recibimos tu solicitud de cierre', body: 'Tu cuenta queda inactiva mientras la revisamos.' }),
  closureDebtDeposit: (debt) => ({ title: 'Cubre tu deuda para cerrar la cuenta', body: `Deposita ${debt} para cubrir tu saldo operativo negativo.` }),
  closureRefund: (amount) => ({
    title: 'Registramos tu devolución',
    body: amount ? `Te devolvimos ${amount} de tu saldo operativo.` : 'No había saldo para devolver.',
  }),
  closureClosed: () => ({ title: 'Tu cuenta está cerrada', body: 'Si vuelves a ingresar, la reactivamos.' }),
  closureRejected: (reason) => ({ title: 'Tu cuenta sigue activa', body: reason }),

  testPush: () => ({ title: 'PorterosPRO', body: 'Notificación de prueba: tus avisos están funcionando.' }),

  depositNotFoundPage: () => ({ title: 'No encontramos este depósito', detail: 'Revisa el estado de tus depósitos en la aplicación.' }),
  depositApprovedPage: (net) => ({ title: 'Depósito aprobado', detail: `Sumamos ${net} a tu saldo operativo.` }),
  depositPendingPage: () => ({ title: 'Depósito pendiente', detail: 'Estamos esperando la confirmación del pago. Te avisaremos cuando se acredite.' }),
  depositFailedPage: () => ({ title: 'Depósito no completado', detail: 'El pago no se completó. Puedes intentar con otro medio de pago.' }),
  amountsLine: (amount, net) => `Monto: ${amount} · Recibes: ${net}`,
  backToApp: 'Volver a PorterosPRO',
  backToAppNoButton: 'Ya puedes volver a la aplicación de PorterosPRO.',
};
