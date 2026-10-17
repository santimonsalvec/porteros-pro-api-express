/**
 * The pure part of migration 033 (commission rules): a document written before the feature holds
 * one `amount`; afterwards it holds `fixedAmount` + `percentBps`. Idempotent: a migrated document
 * comes back equal. Never changes a value — the legacy amount becomes the fixed component as is.
 */
import type { Document } from 'mongodb';

export function planRuleRewrite(doc: Document): Document {
  const { amount, ...rest } = doc;
  const fixedAmount = (rest.fixedAmount as number | undefined) ?? (amount as number | undefined) ?? 0;
  const percentBps = (rest.percentBps as number | undefined) ?? 0;
  return { ...rest, fixedAmount, percentBps };
}

/** Problems left after the rewrite, as "<id>: <what>" lines; empty when the collection is clean. */
export function verifyRules(docs: readonly Document[]): string[] {
  const problems: string[] = [];
  for (const doc of docs) {
    const id = String(doc._id);
    if ('amount' in doc) problems.push(`${id}: still carries amount`);
    if (typeof doc.fixedAmount !== 'number') problems.push(`${id}: fixedAmount missing`);
    if (typeof doc.percentBps !== 'number') problems.push(`${id}: percentBps missing`);
    if ((doc.fixedAmount ?? 0) === 0 && (doc.percentBps ?? 0) === 0) problems.push(`${id}: both components are zero`);
  }
  return problems;
}
