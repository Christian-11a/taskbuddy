import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsController } from './payments.controller';
import { XenditService } from './xendit.service';
import type { PaymentsService } from './payments.service';
import type { StripeService } from './stripe.service';
import type { HireFundingService } from './hire-funding.service';
import type { EscrowService } from '../escrow/escrow.service';

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

  function build(confirmed: boolean) {
    const xendit = new XenditService();
    jest.spyOn(xendit, 'verifyCallback').mockReturnValue(true);
    jest.spyOn(xendit, 'confirmPaidInvoice').mockResolvedValue(confirmed);
    const hireFunding = { completeFromXendit: jest.fn() };
    const controller = new PaymentsController(
      {} as PaymentsService,
      {} as StripeService,
      hireFunding as unknown as HireFundingService,
      xendit,
      {} as EscrowService,
    );
    return { controller, hireFunding };
  }

  it('acts on a paid invoice Xendit confirms', async () => {
    const { controller, hireFunding } = build(true);
    await controller.xenditWebhook({ body } as Request, 'token');
    expect(hireFunding.completeFromXendit).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv_1', amountCentavos: 150000 }),
    );
  });

  it('ignores a callback Xendit does not confirm', async () => {
    const { controller, hireFunding } = build(false);
    await expect(
      controller.xenditWebhook({ body } as Request, 'token'),
    ).resolves.toEqual({ received: true });
    expect(hireFunding.completeFromXendit).not.toHaveBeenCalled();
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
});
