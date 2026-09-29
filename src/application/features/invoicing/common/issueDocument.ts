import type { InvoicingDocument } from '../../../../domain/invoicing/invoicingDocument.js';
import { nextAttemptAt } from '../../../../domain/invoicing/retrySchedule.js';
import type { ICountryLookup } from '../../goalkeeperRequests/common/ports.js';
import type { ICityRepository } from '../../locations/common/ports.js';
import {
  InvoicingProviderError,
  type IInvoicingDocumentRepository,
  type IInvoicingLogger,
  type IInvoicingProvider,
  type IInvoicingProviderRegistry,
  type IInvoicingSecrets,
  type IInvoicingSettingsRepository,
  type ProviderBuyer,
  type ProviderContext,
  type ProviderDocumentResult,
} from './ports.js';

export interface IssueDocumentDependencies {
  documents: IInvoicingDocumentRepository;
  settings: IInvoicingSettingsRepository;
  providers: IInvoicingProviderRegistry;
  secrets: IInvoicingSecrets;
  countryLookup: ICountryLookup;
  cityRepository: ICityRepository;
  logger: IInvoicingLogger;
  /** Off (local): documents wait, pending, until invoicing is turned on. */
  enabled: boolean;
}

export type IssueOutcome = 'issued' | 'awaiting' | 'rejected' | 'retry' | 'waiting' | 'disabled' | 'unchanged';

/** How long a configuration gap (no provider, no credentials) or a pending original waits before the next look. */
const CONFIGURATION_RECHECK_MS = 15 * 60_000;
const ORIGINAL_RECHECK_MS = 60_000;
/** How long before a document awaiting the authority is read again. */
const AWAITING_RECHECK_MS = 5 * 60_000;

export interface Target {
  provider: IInvoicingProvider;
  context: ProviderContext;
  config: Readonly<Record<string, unknown>>;
}

export type TargetResult = { kind: 'ok'; target: Target } | { kind: 'gap'; code: string; message: string };

/**
 * Where the document goes (research.md §10): the provider it's already bound to (with the
 * configuration it was sent with); otherwise the one the country uses now. A credit note always
 * goes to its invoice's provider. Credentials come from the country's secrets.
 */
export async function resolveTarget(deps: IssueDocumentDependencies, document: InvoicingDocument, original: InvoicingDocument | null): Promise<TargetResult> {
  const binding = document.provider ?? original?.provider ?? null;
  let name: string;
  let config: Readonly<Record<string, unknown>>;
  if (binding) {
    name = binding.name;
    config = binding.config;
  } else {
    const settings = await deps.settings.getByCountry(document.countryId);
    if (!settings) return { kind: 'gap', code: 'provider_not_configured', message: `No invoicing provider for country ${document.countryId}` };
    name = settings.provider;
    config = settings.config;
  }
  const provider = deps.providers.get(name);
  if (!provider) return { kind: 'gap', code: 'provider_not_supported', message: `Invoicing provider ${name} is not available` };
  const country = await deps.countryLookup.getById(document.countryId);
  const credentials = country ? deps.secrets.forProvider(name, country.countryCode) : null;
  if (!country || !credentials) {
    return { kind: 'gap', code: 'provider_credentials_missing', message: `No ${name} credentials for country ${document.countryId}` };
  }
  return { kind: 'ok', target: { provider, config, context: { countryCode: country.countryCode, config, credentials } } };
}

async function buyerFor(deps: IssueDocumentDependencies, document: InvoicingDocument, countryCode: string): Promise<ProviderBuyer> {
  const city = await deps.cityRepository.getById(document.buyer.cityId);
  return {
    ...document.buyer,
    cityName: city?.name ?? null,
    stateCode: city?.daneStateCode ?? null,
    cityCode: city?.daneCityCode ?? null,
    countryCode,
  };
}

/** Applies a provider's answer to the document. */
function applyResult(document: InvoicingDocument, result: ProviderDocumentResult, now: Date): { document: InvoicingDocument; outcome: IssueOutcome } {
  const ref = { id: result.id, number: result.number, cufe: result.cufe };
  switch (result.status) {
    case 'accepted':
      return { document: document.markIssued(ref, now), outcome: 'issued' };
    case 'awaiting':
      return { document: document.markAwaiting(ref, now, new Date(now.getTime() + AWAITING_RECHECK_MS)), outcome: 'awaiting' };
    case 'rejected':
      return {
        document: document.markRejected({ code: 'authority_rejected', message: (result.errors ?? []).join('; ') || 'Rejected by the tax authority' }, now, ref),
        outcome: 'rejected',
      };
  }
}

function applyFailure(document: InvoicingDocument, error: unknown, now: Date): { document: InvoicingDocument; outcome: IssueOutcome } {
  if (error instanceof InvoicingProviderError && error.kind === 'rejected') {
    return { document: document.markRejected({ code: error.code, message: error.message }, now), outcome: 'rejected' };
  }
  const code = error instanceof InvoicingProviderError ? error.code : 'provider_failure';
  const message = error instanceof Error ? error.message : String(error);
  return { document: document.markTransient({ code, message }, now, nextAttemptAt(document.attempts + 1, now)), outcome: 'retry' };
}

/**
 * One attempt to send a pending document to its provider (research.md §2, §5). It never throws
 * for a provider problem: the document ends issued, awaiting the authority, rejected (for its
 * data), or pending with its next attempt. The write is conditional on the status read, so a
 * concurrent attempt can't overwrite the other's result. No secret is ever logged.
 */
export async function issueDocument(
  deps: IssueDocumentDependencies,
  document: InvoicingDocument,
  now: Date,
): Promise<{ outcome: IssueOutcome; document: InvoicingDocument }> {
  if (document.status !== 'pending') return { outcome: 'unchanged', document };
  if (!deps.enabled) return { outcome: 'disabled', document };

  let original: InvoicingDocument | null = null;
  if (document.kind === 'credit_note') {
    original = await deps.documents.getById(document.originalDocumentId!);
    if (original?.status !== 'issued') {
      // A credit note goes out only after its invoice (US2 scenario 4).
      const waiting = document.markWaiting(now, new Date(now.getTime() + ORIGINAL_RECHECK_MS));
      await deps.documents.update(waiting, 'pending');
      return { outcome: 'waiting', document: waiting };
    }
  }

  const resolved = await resolveTarget(deps, document, original);
  if (resolved.kind === 'gap') {
    const gap = document.markTransient({ code: resolved.code, message: resolved.message }, now, new Date(now.getTime() + CONFIGURATION_RECHECK_MS));
    await deps.documents.update(gap, 'pending');
    deps.logger.warn({ outcome: 'invoicing_not_configured', documentId: document.id, countryId: document.countryId, code: resolved.code }, 'Invoicing document waits for configuration');
    return { outcome: 'retry', document: gap };
  }

  const { provider, context, config } = resolved.target;
  const bound = document.bindProvider(provider.name, config, now);
  let next: { document: InvoicingDocument; outcome: IssueOutcome };
  try {
    const buyer = await buyerFor(deps, bound, context.countryCode);
    const result = original
      ? await provider.createCreditNote(bound, original, buyer, context)
      : await provider.createInvoice(bound, buyer, context);
    next = applyResult(bound, result, now);
  } catch (error) {
    next = applyFailure(bound, error, now);
  }

  const written = await deps.documents.update(next.document, 'pending');
  if (!written) return { outcome: 'unchanged', document };
  deps.logger.info(
    {
      outcome: `invoicing_document_${next.outcome}`,
      documentId: document.id,
      kind: document.kind,
      provider: provider.name,
      number: next.document.provider?.number ?? null,
      attempts: next.document.attempts,
      error: next.document.lastError ? { code: next.document.lastError.code, message: next.document.lastError.message } : null,
    },
    'Invoicing document attempt',
  );
  return next;
}

/** Re-reads a document the provider created but the authority hasn't decided on yet. */
export async function refreshAwaitingDocument(
  deps: IssueDocumentDependencies,
  document: InvoicingDocument,
  now: Date,
): Promise<{ outcome: IssueOutcome; document: InvoicingDocument }> {
  if (document.status !== 'awaiting_authority' || !deps.enabled) return { outcome: 'unchanged', document };
  const resolved = await resolveTarget(deps, document, null);
  if (resolved.kind === 'gap') return { outcome: 'unchanged', document };
  let next: { document: InvoicingDocument; outcome: IssueOutcome };
  try {
    next = applyResult(document, await resolved.target.provider.getStatus(document, resolved.target.context), now);
  } catch (error) {
    // Nothing to count: the document exists at the provider; look again later.
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.warn({ outcome: 'invoicing_status_unavailable', documentId: document.id, message }, 'Invoicing status read failed');
    const { id, number, cufe } = document.provider!;
    next = { document: document.markAwaiting({ id: id!, number, cufe }, now, new Date(now.getTime() + AWAITING_RECHECK_MS)), outcome: 'awaiting' };
  }
  const written = await deps.documents.update(next.document, 'awaiting_authority');
  return written ? next : { outcome: 'unchanged', document };
}
