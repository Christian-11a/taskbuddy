import type Stripe from 'stripe';
import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { StripeService } from './stripe.service';
import type { VerificationsService } from '../verifications/verifications.service';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

/** Same chainable stand-in as wallet.service.spec.ts — results consumed per `.from()`. */
function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = resultsByTable[table]?.shift() ?? {
      data: null,
      error: null,
    };
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    for (const method of ['select', 'insert', 'update', 'upsert', 'eq']) {
      builder[method] = chain(method);
    }
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return { supabase: { admin: { from } } as unknown as SupabaseService, calls };
}

function createStripeMock(): StripeService {
  return { publishableKey: 'pk_test' } as unknown as StripeService;
}

function createVerificationsMock() {
  return {
    applyIdentityResult: jest.fn(() => Promise.resolve()),
  } as unknown as VerificationsService & {
    applyIdentityResult: jest.Mock;
  };
}

/** A minimal succeeded top-up event. */
function topupEvent(overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_1',
        amount_received: 50000, // ₱500.00 in centavos
        metadata: { profile_id: 'u1', purpose: 'wallet_topup' },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

describe('PaymentsService', () => {
  describe('handleEvent — wallet top-up', () => {
    it('credits the wallet in pesos and tags the row as a top-up', async () => {
      const { supabase, calls } = createSupabaseMock({
        stripe_events: [{ data: null, error: null }],
        wallet_transactions: [{ data: { id: 'w1' }, error: null }],
        notifications: [{ data: null, error: null }],
      });
      const service = new PaymentsService(
        supabase,
        createStripeMock(),
        createVerificationsMock(),
      );

      await service.handleEvent(topupEvent());

      const insert = calls.find(
        (c) => c.table === 'wallet_transactions' && c.method === 'insert',
      );
      expect(insert?.args[0]).toMatchObject({
        profile_id: 'u1',
        direction: 'credit',
        kind: 'topup',
        amount: 500,
        status: 'completed',
        stripe_payment_intent_id: 'pi_1',
      });
    });

    it('does not credit twice when Stripe redelivers the same intent', async () => {
      // uq_wallet_txn_stripe_pi rejects the second insert. That collision is
      // the idempotency mechanism, so it must not surface as a failure —
      // throwing would make Stripe retry this event forever.
      const { supabase } = createSupabaseMock({
        stripe_events: [{ data: null, error: null }],
        wallet_transactions: [
          { data: null, error: { message: 'duplicate key', code: '23505' } },
        ],
      });
      const service = new PaymentsService(
        supabase,
        createStripeMock(),
        createVerificationsMock(),
      );

      await expect(service.handleEvent(topupEvent())).resolves.toBeUndefined();
    });

    it('skips an event it has already processed', async () => {
      const { supabase, calls } = createSupabaseMock({
        stripe_events: [{ data: { id: 'evt_1' }, error: null }],
      });
      const service = new PaymentsService(
        supabase,
        createStripeMock(),
        createVerificationsMock(),
      );

      await service.handleEvent(topupEvent());

      expect(calls.some((c) => c.table === 'wallet_transactions')).toBe(false);
    });

    it('ignores a PaymentIntent that is not one of ours', async () => {
      // Someone else's integration on the same Stripe account, or a future
      // purpose. Crediting on a stray intent would mint wallet balance.
      const { supabase, calls } = createSupabaseMock({
        stripe_events: [{ data: null, error: null }],
      });
      const service = new PaymentsService(
        supabase,
        createStripeMock(),
        createVerificationsMock(),
      );

      await service.handleEvent(
        topupEvent({ metadata: { purpose: 'something_else' } }),
      );

      expect(calls.some((c) => c.table === 'wallet_transactions')).toBe(false);
    });

    it('surfaces a real insert failure so Stripe retries', async () => {
      const { supabase } = createSupabaseMock({
        stripe_events: [{ data: null, error: null }],
        wallet_transactions: [
          { data: null, error: { message: 'connection reset' } },
        ],
      });
      const service = new PaymentsService(
        supabase,
        createStripeMock(),
        createVerificationsMock(),
      );

      await expect(service.handleEvent(topupEvent())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('records the event only after the work succeeds', async () => {
      const { supabase, calls } = createSupabaseMock({
        stripe_events: [{ data: null, error: null }],
        wallet_transactions: [
          { data: null, error: { message: 'connection reset' } },
        ],
      });
      const service = new PaymentsService(
        supabase,
        createStripeMock(),
        createVerificationsMock(),
      );

      await expect(service.handleEvent(topupEvent())).rejects.toThrow();

      // Marked-as-processed before the credit landed would strand the payment:
      // Stripe stops retrying and the wallet is never funded.
      expect(
        calls.some((c) => c.table === 'stripe_events' && c.method === 'upsert'),
      ).toBe(false);
    });
  });

  describe('handleEvent — Stripe Identity', () => {
    it('approves the provider on a verified session', async () => {
      const { supabase } = createSupabaseMock({
        stripe_events: [{ data: null, error: null }],
      });
      const verifications = createVerificationsMock();
      const service = new PaymentsService(
        supabase,
        createStripeMock(),
        verifications,
      );

      await service.handleEvent({
        id: 'evt_2',
        type: 'identity.verification_session.verified',
        data: { object: { id: 'vs_1' } },
      } as unknown as Stripe.Event);

      expect(verifications.applyIdentityResult).toHaveBeenCalledWith(
        'vs_1',
        'verified',
      );
    });

    it('rejects with Stripe’s reason when the check needs more input', async () => {
      const { supabase } = createSupabaseMock({
        stripe_events: [{ data: null, error: null }],
      });
      const verifications = createVerificationsMock();
      const service = new PaymentsService(
        supabase,
        createStripeMock(),
        verifications,
      );

      await service.handleEvent({
        id: 'evt_3',
        type: 'identity.verification_session.requires_input',
        data: {
          object: { id: 'vs_2', last_error: { reason: 'Document expired' } },
        },
      } as unknown as Stripe.Event);

      expect(verifications.applyIdentityResult).toHaveBeenCalledWith(
        'vs_2',
        'rejected',
        'Document expired',
      );
    });
  });
});
