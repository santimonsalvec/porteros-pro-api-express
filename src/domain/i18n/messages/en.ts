import type { Modality } from '../../bookings/matchFormat.js';
import type { MessageCatalog } from './catalog.js';

const MODALITY: Record<Modality, string> = {
  micro_futsal: 'Micro / Futsal',
  futbol_medio: 'Mid-size football',
  futbol_11: '11-a-side',
  any: 'Open',
};

/** The English sentences (feature 032, research §10 glossary): same members and parameters as `es`. */
export const en: MessageCatalog = {
  modality: (modality) => MODALITY[modality],
  yourZone: 'your zone',
  where: (place, when) => `in ${place} · ${when}`,

  singleOffer: ({ modality, place, when, durationMinutes, surfaceName }) => ({
    title: modality ? `Match available · ${modality}` : 'Match available',
    body: `${place} · ${when} · ${durationMinutes} min${surfaceName ? ` · ${surfaceName}` : ''}`,
  }),
  groupedOffer: (count) => ({
    title: 'Matches available',
    body: count === 1 ? 'There is 1 match available in your zones' : `There are ${count} matches available in your zones`,
  }),

  requestExpired: (where) => ({ title: 'No goalkeeper for your match', body: `We could not find a goalkeeper for your match ${where}` }),
  requestPartiallyExpired: (where, assigned, total) => ({
    title: 'Goalkeepers partly confirmed',
    body: `We found ${assigned} of ${total} goalkeepers for your match ${where}`,
  }),
  requestCancelled: (where) => ({
    title: 'Request cancelled',
    body: `We cancelled your request ${where}: not every goalkeeper was confirmed in time.`,
  }),
  bookingCancelled: (where, by, refund) => ({
    title: 'Match cancelled',
    body: `${by === 'client' ? 'The client cancelled your match' : by === 'admin' ? 'PorterosPRO cancelled your match' : 'Your match was cancelled'} ${where}${refund ? ` We refunded you ${refund}.` : ''}`,
  }),
  adminCancelled: (where, whole) => ({
    title: whole ? 'Match cancelled' : 'Goalkeeper cancelled',
    body: whole ? `PorterosPRO cancelled your match ${where}` : `PorterosPRO cancelled one of the goalkeepers of your match ${where}`,
  }),

  yourGoalkeeper: 'your goalkeeper',
  theClient: 'the client',
  list: (items) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`),
  goalkeeperAssigned: (where, replacement, contact) => ({
    title: replacement ? 'We found another goalkeeper' : 'Goalkeeper confirmed',
    body: `${replacement ? `We found another goalkeeper for your match ${where}` : `A goalkeeper took your match ${where}`}${contact ? ` It is ${contact}.` : ''} We keep looking for the other one.`,
  }),
  requestComplete: (where, goalkeeperCount, contacts) => ({
    title: 'Request complete',
    body: `${goalkeeperCount > 1 ? `Done! Your ${goalkeeperCount} goalkeepers are confirmed` : 'Done! Your goalkeeper is confirmed'} for the match ${where}${
      contacts && contacts.length > 0 ? ` ${goalkeeperCount > 1 ? 'They are' : 'It is'} ${en.list(contacts)}.` : ' You will see their details 1 hour before.'
    }`,
  }),
  contactsVisible: (where, contacts) => ({
    title: contacts.length > 1 ? 'Your goalkeepers' : 'Your goalkeeper',
    body: `${contacts.length > 1 ? 'Your goalkeepers' : 'Your goalkeeper'} for the match ${where}: ${en.list(contacts)}.`,
  }),
  clientContactVisible: (where, contact) => ({ title: 'Your client', body: `Your client for the match ${where}: ${contact}.` }),

  goalkeeperArrived: (where) => ({ title: 'Your goalkeeper arrived', body: `Your goalkeeper arrived at the match ${where}` }),
  checkInMissed: (where, name, whatsApp) => ({
    title: 'Your goalkeeper has not confirmed their arrival',
    body: `${name ? `Your goalkeeper ${name}` : 'Your goalkeeper'} has not confirmed their arrival at the match ${where}${whatsApp ? ` Write to them: WhatsApp ${whatsApp}.` : ''}`,
  }),
  checkInOpen: (where) => ({ title: 'Confirm your arrival', body: `You can now confirm your arrival at the match ${where} Take a photo at the pitch.` }),
  checkInLastCall: (where) => ({ title: '10 minutes left', body: `You have 10 minutes left to confirm your arrival at the match ${where}` }),
  noShow: (where, suspendedUntil) => ({
    title: 'No-show recorded',
    body: `You did not confirm your arrival at the match ${where} and it was recorded as a no-show.${suspendedUntil ? ` You are suspended until ${suspendedUntil}` : ''}`,
  }),

  goalkeeperWithdrew: (where, replaced) => ({
    title: 'Your goalkeeper withdrew',
    body: `Your goalkeeper withdrew from the match ${where} ${replaced ? 'We are already looking for another goalkeeper.' : 'There was no time to look for another goalkeeper.'}`,
  }),
  goalkeeperSuspended: (until) => ({
    title: 'You are suspended',
    body: `You are suspended until ${until} for withdrawing from a match. Meanwhile you will not see matches or receive offers.`,
  }),

  validated: () => ({ title: 'You can now receive requests', body: 'We finished validating you. Turn on your availability to start seeing matches.' }),
  validationRejected: (reason) => ({ title: 'Check your documents', body: `Your validation was rejected: ${reason}. Fix it and upload your documents again.` }),
  verified: () => ({ title: 'You now have the verified seal', body: 'You will receive requests first and earn the full rate.' }),

  depositApproved: (net, balance) => ({ title: 'Deposit approved', body: `Deposit approved: +${net}. Your operating balance is ${balance}.` }),
  depositFailed: (amount) => ({ title: 'Deposit not completed', body: `Your deposit of ${amount} was not completed. You can try another payment method.` }),
  operatingBalanceAdjusted: (signedAmount, reason, balance) => ({
    title: 'Your operating balance changed',
    body: `${signedAmount} (${reason}). Your operating balance is ${balance}.`,
  }),

  closureRequested: () => ({ title: 'We received your closure request', body: 'Your account stays inactive while we review it.' }),
  closureDebtDeposit: (debt) => ({ title: 'Cover your debt to close the account', body: `Deposit ${debt} to cover your negative operating balance.` }),
  closureRefund: (amount) => ({
    title: 'We recorded your refund',
    body: amount ? `We refunded you ${amount} from your operating balance.` : 'There was no balance to refund.',
  }),
  closureClosed: () => ({ title: 'Your account is closed', body: 'If you sign in again, we reactivate it.' }),
  closureRejected: (reason) => ({ title: 'Your account stays active', body: reason }),

  testPush: () => ({ title: 'PorterosPRO', body: 'Test notification: your notices are working.' }),

  depositNotFoundPage: () => ({ title: 'We could not find this deposit', detail: 'Check the status of your deposits in the app.' }),
  depositApprovedPage: (net) => ({ title: 'Deposit approved', detail: `We added ${net} to your operating balance.` }),
  depositPendingPage: () => ({ title: 'Deposit pending', detail: 'We are waiting for the payment confirmation. We will let you know when it is credited.' }),
  depositFailedPage: () => ({ title: 'Deposit not completed', detail: 'The payment was not completed. You can try another payment method.' }),
  amountsLine: (amount, net) => `Amount: ${amount} · You receive: ${net}`,
  backToApp: 'Back to PorterosPRO',
  backToAppNoButton: 'You can now go back to the PorterosPRO app.',
};
