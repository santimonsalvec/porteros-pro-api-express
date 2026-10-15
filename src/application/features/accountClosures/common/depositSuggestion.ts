import type { DepositOption } from '../../../../domain/payments/gatewaySettings.js';

/**
 * The deposit to suggest to someone who must cover a debt: the smallest option whose net covers it,
 * or the largest one when none does alone (they can deposit again). `null` with no options.
 */
export function suggestDepositAmount(options: readonly DepositOption[], debt: number): number | null {
  if (options.length === 0) return null;
  const ascending = [...options].sort((a, b) => a.amount - b.amount);
  const covering = ascending.find((option) => option.net >= debt);
  return (covering ?? ascending[ascending.length - 1]!).amount;
}
