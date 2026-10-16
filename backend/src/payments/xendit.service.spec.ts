import { XenditService } from './xendit.service';

describe('XenditService', () => {
  const env = process.env;
  afterEach(() => {
    process.env = env;
  });
  const withEnv = (vars: Record<string, string>) => {
    process.env = { ...env, ...vars };
    return new XenditService();
  };

  it('accepts only the dashboard callback token', () => {
    const xendit = withEnv({ XENDIT_CALLBACK_TOKEN: 'tok_123' });
    expect(xendit.verifyCallback('tok_123')).toBe(true);
    expect(xendit.verifyCallback('tok_124')).toBe(false);
    expect(xendit.verifyCallback(undefined)).toBe(false);
  });

  it('reads a paid invoice and what it was for', () => {
    const xendit = withEnv({});
    expect(
      xendit.paidInvoice({
        id: 'inv_1',
        external_id: 'hire_8c1d2f3a-0000-4000-8000-000000000001_ab12cd34',
        status: 'PAID',
        paid_amount: 1500,
        currency: 'PHP',
        payment_channel: 'GCASH',
      }),
    ).toEqual({
      invoiceId: 'inv_1',
      externalId: 'hire_8c1d2f3a-0000-4000-8000-000000000001_ab12cd34',
      purpose: 'hire',
      subjectId: '8c1d2f3a-0000-4000-8000-000000000001',
      amountCentavos: 150000,
      currency: 'php',
      channel: 'GCASH',
    });
  });

  it('ignores an invoice that is not paid', () => {
    const xendit = withEnv({});
    expect(
      xendit.paidInvoice({
        id: 'inv_1',
        external_id: 'hire_x_y',
        status: 'EXPIRED',
      }),
    ).toBeNull();
  });

  it('refuses a live key: the prototype never moves real money', async () => {
    const xendit = withEnv({ XENDIT_SECRET_KEY: 'xnd_production_abc' });
    await expect(
      xendit.createCheckout({
        externalId: 'hire_x_y',
        amount: 100,
        description: 'Test',
        successUrl: 'https://a',
        failureUrl: 'https://b',
      }),
    ).rejects.toThrow('Only Xendit test');
  });
});
