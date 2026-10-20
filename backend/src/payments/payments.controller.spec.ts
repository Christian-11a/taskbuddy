import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsController } from './payments.controller';
import { XenditService } from './xendit.service';
import type { PaymentsService } from './payments.service';
import type { StripeService } from './stripe.service';
import type { HireFundingService } from './hire-funding.service';
import type { EscrowService } from '../escrow/escrow.service';
import type { Profile } from '../common/types';

describe('PaymentsController xenditPayoutWebhook', () => {
  const body = {
    event: 'payout.succeeded',
    data: { id: 'po_1', reference_id: 'w1', status: 'SUCCEEDED' },
  };

  function build(tokenOk: boolean) {
    const xendit = new XenditService();
    jest.spyOn(xendit, 'verifyCallback').mockReturnValue(tokenOk);
    const escrow = { applyPayoutResult: jest.fn() };
    const controller = new PaymentsController(
      {} as PaymentsService,
      {} as StripeService,
      {} as HireFundingService,
      xendit,
      escrow as unknown as EscrowService,
    );
    return { controller, escrow };
  }

  it('applies a verified payout result', async () => {
    const { controller, escrow } = build(true);
    await expect(
      controller.xenditPayoutWebhook({ body } as Request, 'token'),
    ).resolves.toEqual({ received: true });
    expect(escrow.applyPayoutResult).toHaveBeenCalledWith({
      payoutId: 'po_1',
      referenceId: 'w1',
      status: 'SUCCEEDED',
      failureCode: null,
    });
  });

  it('refuses a callback without the right token', async () => {
    const { controller, escrow } = build(false);
    await expect(
      controller.xenditPayoutWebhook({ body } as Request, 'wrong'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(escrow.applyPayoutResult).not.toHaveBeenCalled();
  });
});

describe('PaymentsController xenditWebhook (invoice)', () => {
  const body = {
    id: 'inv_1',
    external_id: 'hire_app1_abcd1234',
    status: 'PAID',
    paid_amount: 1500,
    currency: 'PHP',
    payment_channel: 'GCASH',
  };

  function build() {
    const xendit = new XenditService();
    jest.spyOn(xendit, 'verifyCallback').mockReturnValue(true);
    const hireFunding = { handleXenditPaidInvoice: jest.fn() };
    const controller = new PaymentsController(
      {} as PaymentsService,
      {} as StripeService,
      hireFunding as unknown as HireFundingService,
      xendit,
      {} as EscrowService,
    );
    return { controller, hireFunding };
  }

  it('passes a paid invoice to the durable reconciliation handler', async () => {
    const { controller, hireFunding } = build();
    await controller.xenditWebhook({ body } as Request, 'token');
    expect(hireFunding.handleXenditPaidInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv_1', amountCentavos: 150000 }),
    );
  });

  it('does not acknowledge an invoice that the reconciliation handler cannot process', async () => {
    const { controller, hireFunding } = build();
    hireFunding.handleXenditPaidInvoice.mockRejectedValue(
      new Error('Invoice could not be verified'),
    );
    await expect(
      controller.xenditWebhook({ body } as Request, 'token'),
    ).rejects.toThrow('Invoice could not be verified');
  });
});

describe('PaymentsController hirePaymentStatus', () => {
  it('delegates the authenticated client and invoice id to reconciliation', async () => {
    const user = { id: 'client-1', role: 'client' };
    const hireFunding = { hirePaymentStatus: jest.fn() };
    const controller = new PaymentsController(
      {} as PaymentsService,
      {} as StripeService,
      hireFunding as unknown as HireFundingService,
      new XenditService(),
      {} as EscrowService,
    );

    await controller.hirePaymentStatus(user as Profile, {
      application_id: 'application-1',
      invoice_id: 'invoice-1',
    });

    expect(hireFunding.hirePaymentStatus).toHaveBeenCalledWith(
      user,
      'application-1',
      'invoice-1',
    );
  });
});

describe('XenditService.confirmPaidInvoice', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.XENDIT_SECRET_KEY;
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.XENDIT_SECRET_KEY;
    else process.env.XENDIT_SECRET_KEY = originalKey;
  });
  const paid = {
    invoiceId: 'inv_1',
    externalId: 'hire_app1_abcd1234',
    purpose: 'hire',
    subjectId: 'app1',
    amountCentavos: 150000,
    currency: 'php',
    channel: 'GCASH',
  };
  const respond = (status: number, invoice: unknown) => {
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: () => Promise.resolve(invoice),
    });
    return new XenditService();
  };

  it.each([
    [
      'matching and paid',
      200,
      { external_id: 'hire_app1_abcd1234', status: 'PAID', paid_amount: 1500 },
      true,
    ],
    [
      'settled',
      200,
      { external_id: 'hire_app1_abcd1234', status: 'SETTLED', amount: 1500 },
      true,
    ],
    [
      'still pending',
      200,
      { external_id: 'hire_app1_abcd1234', status: 'PENDING', amount: 1500 },
      false,
    ],
    [
      'a different amount',
      200,
      { external_id: 'hire_app1_abcd1234', status: 'PAID', paid_amount: 1 },
      false,
    ],
    [
      'another external id',
      200,
      { external_id: 'hire_other_x', status: 'PAID', paid_amount: 1500 },
      false,
    ],
    ['unknown to Xendit', 404, {}, false],
  ])('%s', async (_n, status, invoice, expected) => {
    await expect(
      respond(status, invoice).confirmPaidInvoice(paid),
    ).resolves.toBe(expected);
  });

  it('throws when Xendit cannot be asked, so the callback is retried', async () => {
    await expect(respond(503, {}).confirmPaidInvoice(paid)).rejects.toThrow();
  });

  it('returns a normalized pending invoice status for manual reconciliation', async () => {
    const xendit = respond(200, {
      id: 'inv_1',
      external_id: 'hire_app1_abcd1234',
      status: 'PENDING',
      amount: 1500,
      currency: 'PHP',
      payment_channel: 'GCASH',
    });

    await expect(xendit.invoiceStatus('inv_1')).resolves.toMatchObject({
      invoiceId: 'inv_1',
      externalId: 'hire_app1_abcd1234',
      status: 'PENDING',
      amountCentavos: 150000,
      currency: 'php',
      channel: 'GCASH',
    });
  });
});
