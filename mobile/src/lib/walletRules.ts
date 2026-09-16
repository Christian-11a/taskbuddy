export const MIN_WITHDRAWAL_PHP = 1;

export function canWithdrawBalance(available: number): boolean {
  return Number.isFinite(available) && available >= MIN_WITHDRAWAL_PHP;
}

export function getWithdrawalHint(available: number): string {
  if (canWithdrawBalance(available)) {
    return `Available: ₱${available.toFixed(2)}`;
  }
  return `You need at least ₱${MIN_WITHDRAWAL_PHP.toFixed(2)} to withdraw.`;
}
