/**
 * How a payout row's status reads. The server sends `completed`, `pending` or
 * `failed`; any other value is shown as its raw text in neutral colour.
 */
export function payoutStatus(status: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (status) {
    case 'completed': return { label: 'Sent', tone: 'success' };
    case 'pending': return { label: 'Pending', tone: 'warning' };
    case 'failed': return { label: 'Failed', tone: 'danger' };
    default: return { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown', tone: 'neutral' };
  }
}

/**
 * The title shown under a payout amount. Old wallet-era rows are titled
 * "Withdrawal" (or have no title); those read as "Payout". Other titles pass through.
 */
export function payoutTitle(title: string | null | undefined): string {
  const trimmed = (title ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'withdrawal') return 'Payout';
  return title as string;
}

export type PayoutFormMethod = 'gcash' | 'maya' | 'bank';

/** Shows a mobile number as the user types: "09171234567" becomes "0917 123 4567". Digits only, at most 11. */
export function formatMobileNumber(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 11);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join(' ');
}

/** Digits only, for sending to the server. */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

/** The number as the field shows it while typing: spaced for GCash/Maya, plain digits for a bank. */
export function formatPayoutNumber(method: PayoutFormMethod, text: string): string {
  return method === 'bank' ? digitsOnly(text).slice(0, 16) : formatMobileNumber(text);
}

/** Helper text under the number field. */
export function payoutNumberHelper(method: PayoutFormMethod): string {
  return method === 'bank'
    ? 'Digits only, 10 to 16 digits.'
    : 'An 11-digit mobile number starting with 09, like 0917 123 4567.';
}

export function payoutNumberLabel(method: PayoutFormMethod): string {
  return method === 'gcash' ? 'GCash mobile number' : method === 'maya' ? 'Maya mobile number' : 'Account number';
}

/** "4567" shown as "•••• 4567". */
export function maskedNumber(last4: string): string {
  return `•••• ${last4}`;
}

export interface PayoutFormErrors { bank?: string; name?: string; number?: string }

/** What is wrong with each field, by field. An empty object means the form is fine. */
export function payoutErrors(input: { method: PayoutFormMethod; bankCode: string; accountName: string; accountNumber: string }): PayoutFormErrors {
  const errors: PayoutFormErrors = {};
  if (input.method === 'bank' && !input.bankCode) errors.bank = 'Choose your bank.';
  const name = input.accountName.trim().replace(/\s+/g, ' ');
  if (name.length < 2) errors.name = 'Enter the account holder name.';
  else if (name.length > 120) errors.name = 'Use 120 characters or fewer.';
  else if (!/^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F .'-]*$/.test(name)) errors.name = "Use letters, spaces and . - ' only.";
  const digits = digitsOnly(input.accountNumber);
  if (input.method === 'bank') {
    if (digits.length < 10 || digits.length > 16) errors.number = 'Enter an account number of 10 to 16 digits.';
  } else if (!/^09\d{9}$/.test(digits)) {
    errors.number = 'Enter an 11-digit mobile number starting with 09.';
  }
  return errors;
}

/** A payout destination with any run of 6+ digits hidden but the last 4: "GCash 09171234567" becomes "GCash •••• 4567". */
export function maskDestination(text: string | null | undefined): string {
  return (text ?? '').replace(/\d{6,}/g, (run) => maskedNumber(run.slice(-4)));
}
