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
