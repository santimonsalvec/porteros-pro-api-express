import type { PushMessage } from '../devices/deviceRules.js';

/** Inbox and push types of a goalkeeper's validation and verification (admin spec 030). */
export const VETTING_VALIDATED_TYPE = 'vetting.validated';
export const VETTING_VALIDATION_REJECTED_TYPE = 'vetting.validation_rejected';
export const VETTING_VERIFIED_TYPE = 'vetting.verified';

export function validatedMessage(): PushMessage {
  return {
    title: 'Ya puedes recibir solicitudes',
    body: 'Terminamos de validarte. Activa tu disponibilidad para empezar a ver partidos.',
    data: { type: VETTING_VALIDATED_TYPE },
  };
}

/** The reason is at most 300 characters, so the body stays within the push limit. */
export function validationRejectedMessage(reason: string): PushMessage {
  return {
    title: 'Revisa tus documentos',
    body: `Tu validación fue rechazada: ${reason}. Corrige y vuelve a cargar tus documentos.`,
    data: { type: VETTING_VALIDATION_REJECTED_TYPE },
  };
}

export function verifiedMessage(): PushMessage {
  return {
    title: 'Ya tienes el sello de verificado',
    body: 'Recibirás solicitudes de forma prioritaria y cobrarás la tarifa completa.',
    data: { type: VETTING_VERIFIED_TYPE },
  };
}
