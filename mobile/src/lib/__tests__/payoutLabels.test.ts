import { digitsOnly, formatMobileNumber, formatPayoutNumber, maskedNumber, normalizePhMobile, payoutErrors, payoutStatus, payoutTitle } from '../payoutLabels';

describe('formatting', () => {
  it('spaces a mobile number as it is typed', () => {
    expect(formatMobileNumber('0917')).toBe('0917');
    expect(formatMobileNumber('09171')).toBe('0917 1');
    expect(formatMobileNumber('09171234567')).toBe('0917 123 4567');
    expect(formatMobileNumber('0917-123-4567 99')).toBe('0917 123 4567');
    expect(digitsOnly('0917 123 4567')).toBe('09171234567');
  });
  it('keeps bank numbers as plain digits, at most 16', () => {
    expect(formatPayoutNumber('bank', '0012 3456-78901234567')).toBe('0012345678901234');
  });
  it('masks the last four digits', () => {
    expect(maskedNumber('4567')).toBe('•••• 4567');
  });
});

describe('+63 numbers', () => {
  it('formats +63 numbers as they are typed, and lets the prefix be deleted', () => {
    expect(formatMobileNumber('+')).toBe('+');
    expect(formatMobileNumber('+6')).toBe('+6');
    expect(formatMobileNumber('+63')).toBe('+63');
    expect(formatMobileNumber('+639')).toBe('+63 9');
    expect(formatMobileNumber('+639171234567')).toBe('+63 917 123 4567');
    expect(formatMobileNumber('639171234567')).toBe('+63 917 123 4567');
    expect(formatMobileNumber('+63 917 123 4567 89')).toBe('+63 917 123 4567');
  });
  it('turns any accepted form into the 09 form the server stores', () => {
    expect(normalizePhMobile('+63 917 123 4567')).toBe('09171234567');
    expect(normalizePhMobile('639171234567')).toBe('09171234567');
    expect(normalizePhMobile('0917 123 4567')).toBe('09171234567');
    expect(normalizePhMobile('+63 917 123')).toBe('63917123');
  });
});

describe('payoutErrors', () => {
  const ok = { method: 'gcash' as const, bankCode: '', accountName: "Ana M. Reyes-O'Neil", accountNumber: '0917 123 4567' };
  it('accepts a good GCash or Maya form', () => {
    expect(payoutErrors(ok)).toEqual({});
    expect(payoutErrors({ ...ok, method: 'maya' })).toEqual({});
  });
  it('wants 11 digits starting 09 for GCash and Maya', () => {
    expect(payoutErrors({ ...ok, accountNumber: '0817 123 4567' }).number).toBeTruthy();
    expect(payoutErrors({ ...ok, method: 'maya', accountNumber: '0917 123 456' }).number).toBeTruthy();
  });
  it('accepts +63 numbers for GCash and Maya', () => {
    expect(payoutErrors({ ...ok, accountNumber: '+63 917 123 4567' })).toEqual({});
    expect(payoutErrors({ ...ok, method: 'maya', accountNumber: '639171234567' })).toEqual({});
  });
  it('refuses short, foreign or landline-shaped numbers', () => {
    expect(payoutErrors({ ...ok, accountNumber: '+63 917 123 456' }).number).toBeTruthy();
    expect(payoutErrors({ ...ok, accountNumber: '+1 917 123 4567' }).number).toBeTruthy();
    expect(payoutErrors({ ...ok, accountNumber: '+63 817 123 4567' }).number).toBeTruthy();
  });
  it('wants 10 to 16 digits and a bank for a bank account', () => {
    const bank = { ...ok, method: 'bank' as const, accountNumber: '123456789' };
    expect(payoutErrors(bank)).toEqual({ bank: 'Choose your bank.', number: expect.any(String) });
    expect(payoutErrors({ ...bank, bankCode: 'PH_BPI', accountNumber: '1234567890' })).toEqual({});
    expect(payoutErrors({ ...bank, bankCode: 'PH_BPI', accountNumber: '1'.repeat(17) }).number).toBeTruthy();
  });
  it('wants a name of 2 to 120 letters, spaces and . - only', () => {
    expect(payoutErrors({ ...ok, accountName: 'A' }).name).toBeTruthy();
    expect(payoutErrors({ ...ok, accountName: 'Ana 3' }).name).toBeTruthy();
    expect(payoutErrors({ ...ok, accountName: 'A'.repeat(121) }).name).toBeTruthy();
  });
});

describe('existing labels', () => {
  it('still export payoutStatus and payoutTitle', () => {
    expect(payoutStatus('completed').label).toBe('Sent');
    expect(payoutTitle('Withdrawal')).toBe('Payout');
  });
});
