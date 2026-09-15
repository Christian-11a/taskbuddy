import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type Stripe from 'stripe';
import { HireFundingService } from './hire-funding.service';
import { InsufficientBalanceError } from '../escrow/escrow-errors';
import type { SupabaseService } from '../supabase/supabase.service';
import type { StripeService } from './stripe.service';
import type { StripeCustomersService } from './stripe-customers.service';
import type { ApplicationsService } from '../applications/applications.service';
import type { EscrowService } from '../escrow/escrow.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

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
    for (const method of ['select', 'insert', 'update', 'eq']) {
      builder[method] = chain(method);
    }
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return { supabase: { admin: { from } } as unknown as SupabaseService, calls };
}

const ok = (data: unknown): QueryResult => ({ data, error: null });

const job = {
  id: 'j1',
  title: 'Fix kitchen faucet',
  status: 'open',
  client_id: 'c1',
  budget: 1500,
};
const application = (overrides: Record<string, unknown> = {}) => ({
  id: 'app1',
  job_id: 'j1',
  provider_id: 'p1',
  status: 'pending',
  jobs: job,
  ...overrides,
});

const client = { id: 'c1', role: 'client', full_name: 'Ana' } as Profile;

function intent(overrides: Partial<Stripe.PaymentIntent> = {}) {
  return {
    id: 'pi_1',
    amount_received: 150000,
    currency: 'php',
    latest_charge: 'ch_1',
    metadata: {
      purpose: 'hire_funding',
      profile_id: 'c1',
      application_id: 'app1',
      job_id: 'j1',
      provider_id: 'p1',
    },
    ...overrides,
  } as unknown as Stripe.PaymentIntent;
}

function build(
  tables: Record<string, QueryResult[]>,
  overrides: {
    hold?: jest.Mock;
    acceptFunded?: jest.Mock;
    statusOf?: jest.Mock;
    findByJob?: jest.Mock;
    assertHireable?: jest.Mock;
  } = {},
) {
  const { supabase, calls } = createSupabaseMock(tables);
  const create = jest.fn((_params: Stripe.Checkout.SessionCreateParams) =>
    Promise.resolve({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }),
  );
  const stripe = {
    stripe: { checkout: { sessions: { create } } },
  } as unknown as StripeService;
  const customers = {
    customerFor: jest.fn(() => Promise.resolve('cus_1')),
  } as unknown as StripeCustomersService;
  const escrowMock = {
    hold:
      overrides.hold ??
      jest.fn(() => Promise.resolve({ escrow: { id: 'e1' }, placed: true })),
    findByJob: overrides.findByJob ?? jest.fn(() => Promise.resolve(null)),
    releaseHoldForFailedHire: jest.fn(() => Promise.resolve()),
  };
  const applicationsMock = {
    assertHireable:
      overrides.assertHireable ?? jest.fn(() => Promise.resolve()),
    acceptFunded:
      overrides.acceptFunded ?? jest.fn(() => Promise.resolve({ id: 'app1' })),
    statusOf: overrides.statusOf ?? jest.fn(() => Promise.resolve('pending')),
  };
  const service = new HireFundingService(
    supabase,
    stripe,
    customers,
    applicationsMock as unknown as ApplicationsService,
    escrowMock as unknown as EscrowService,
  );
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
  jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
  jest.spyOn(service['logger'], 'log').mockImplementation(() => {});
  return {
    service,
    calls,
    create,
    escrow: escrowMock,
    applications: applicationsMock,
  };
}

const writes = (
  calls: { table: string; method: string; args: unknown[] }[],
  table: string,
) =>
  calls
    .filter((c) => c.table === table && c.method === 'insert')
    .map((c) => c.args[0] as Record<string, unknown>);

const APP = 'taskbuddy://hire';
const BASE = 'https://api.taskbuddy.test';

describe('HireFundingService.createCheckout', () => {
  it('opens a card-only Checkout for the full budget, carrying what the webhook needs', async () => {
    const { service, create } = build({
      job_applications: [ok(application())],
    });

    const result = await service.createCheckout(
      client,
      { application_id: 'app1', app_redirect: APP },
      BASE,
    );

    expect(result).toEqual({
      url: 'https://checkout.stripe.com/c/cs_1',
      session_id: 'cs_1',
      amount: 1500,
    });
    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: 'payment',
      customer: 'cus_1',
      payment_method_types: ['card'],
      client_reference_id: 'app1',
      line_items: [{ price_data: { currency: 'php', unit_amount: 150000 } }],
      payment_intent_data: {
        metadata: {
          purpose: 'hire_funding',
          profile_id: 'c1',
          application_id: 'app1',
          job_id: 'j1',
          provider_id: 'p1',
        },
        transfer_group: 'job:j1',
      },
      success_url: `${BASE}/payments/return?flow=hire&status=success&app_redirect=${encodeURIComponent(APP)}`,
    });
  });

  it('runs the same hireability checks as a wallet accept before asking for a card', async () => {
    const assertHireable = jest.fn(() =>
      Promise.reject(
        new ConflictException({ code: 'provider_not_verified', message: 'x' }),
      ),
    );
    const { service, create } = build(
      { job_applications: [ok(application())] },
      { assertHireable },
    );

    await expect(
      service.createCheckout(
        client,
        { application_id: 'app1', app_redirect: APP },
        BASE,
      ),
    ).rejects.toThrow(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses someone else’s job', async () => {
    const { service } = build({
      job_applications: [
        ok(application({ jobs: { ...job, client_id: 'someone-else' } })),
      ],
    });

    await expect(
      service.createCheckout(
        client,
        { application_id: 'app1', app_redirect: APP },
        BASE,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a budget outside what a card may be charged', async () => {
    const { service } = build({
      job_applications: [ok(application({ jobs: { ...job, budget: 10 } }))],
    });

    const err: unknown = await service
      .createCheckout(
        client,
        { application_id: 'app1', app_redirect: APP },
        BASE,
      )
      .catch((e: unknown) => e);

    expect((err as BadRequestException).getResponse()).toMatchObject({
      code: 'card_amount_out_of_range',
    });
  });

  it('refuses a redirect outside the allowlist before reading anything', async () => {
    const { service, calls } = build({});

    await expect(
      service.createCheckout(
        client,
        { application_id: 'app1', app_redirect: 'https://evil.example' },
        BASE,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(calls).toEqual([]);
  });
});

describe('HireFundingService.completeFromIntent', () => {
  it('credits the payment, holds it against this charge, hires, and tells the client', async () => {
    const { service, calls, escrow, applications } = build({
      job_applications: [ok(application())],
      provider_profiles: [ok({ is_verified: true })],
    });

    await service.completeFromIntent(intent());

    expect(writes(calls, 'wallet_transactions')).toEqual([
      expect.objectContaining({
        profile_id: 'c1',
        direction: 'credit',
        kind: 'topup',
        amount: 1500,
        stripe_payment_intent_id: 'pi_1',
      }),
    ]);
    expect(escrow.hold).toHaveBeenCalledWith('j1', 'p1', {
      paymentIntentId: 'pi_1',
      chargeId: 'ch_1',
    });
    expect(applications.acceptFunded).toHaveBeenCalled();
    expect(writes(calls, 'notifications')).toEqual([
      expect.objectContaining({ recipient_id: 'c1', title: 'Hire confirmed' }),
    ]);
  });

  it('finishes the hire on a redelivery after a crash between credit and hire', async () => {
    // The credit collides — an earlier delivery wrote it — and processing
    // continues, because that delivery never got as far as the hire.
    const { service, escrow, applications } = build({
      job_applications: [ok(application())],
      wallet_transactions: [
        { data: null, error: { message: 'duplicate', code: '23505' } },
      ],
      provider_profiles: [ok({ is_verified: true })],
    });

    await service.completeFromIntent(intent());

    expect(escrow.hold).toHaveBeenCalled();
    expect(applications.acceptFunded).toHaveBeenCalled();
  });

  it('does nothing when a previous delivery already finished the hire', async () => {
    const { service, escrow, applications } = build(
      {
        job_applications: [ok(application({ status: 'accepted' }))],
        wallet_transactions: [
          { data: null, error: { message: 'duplicate', code: '23505' } },
        ],
      },
      {
        findByJob: jest.fn(() =>
          Promise.resolve({ id: 'e1', funding_payment_intent_id: 'pi_1' }),
        ),
      },
    );

    await service.completeFromIntent(intent());

    expect(escrow.hold).not.toHaveBeenCalled();
    expect(applications.acceptFunded).not.toHaveBeenCalled();
  });

  it('leaves the money in the wallet, and says so once, when the proposal was already decided', async () => {
    const { service, calls, escrow } = build({
      job_applications: [ok(application({ status: 'withdrawn' }))],
    });

    await service.completeFromIntent(intent());

    expect(escrow.hold).not.toHaveBeenCalled();
    expect(writes(calls, 'wallet_transactions')).toHaveLength(1);
    expect(writes(calls, 'notifications')).toEqual([
      expect.objectContaining({
        title: 'Payment added to your wallet',
        body: expect.stringContaining('the proposal was withdrawn'),
      }),
    ]);
  });

  it('does not repeat the refusal notice on a redelivery', async () => {
    const { service, calls } = build({
      job_applications: [ok(application({ status: 'withdrawn' }))],
      wallet_transactions: [
        { data: null, error: { message: 'duplicate', code: '23505' } },
      ],
    });

    await service.completeFromIntent(intent());

    expect(writes(calls, 'notifications')).toEqual([]);
  });

  it('refuses a payment that does not match the job budget', async () => {
    const { service, escrow } = build({
      job_applications: [ok(application())],
    });

    await service.completeFromIntent(intent({ amount_received: 100000 }));

    expect(escrow.hold).not.toHaveBeenCalled();
  });

  it('refuses a provider who is no longer verified', async () => {
    const { service, escrow } = build({
      job_applications: [ok(application())],
      provider_profiles: [ok({ is_verified: false })],
    });

    await service.completeFromIntent(intent());

    expect(escrow.hold).not.toHaveBeenCalled();
  });

  it('treats a hold the wallet can no longer cover as a refusal, not a fault', async () => {
    // The client spent the credited money on another hire in the gap.
    const { service, applications } = build(
      {
        job_applications: [ok(application())],
        provider_profiles: [ok({ is_verified: true })],
      },
      {
        hold: jest.fn(() =>
          Promise.reject(new InsufficientBalanceError(1500, 0)),
        ),
      },
    );

    await expect(service.completeFromIntent(intent())).resolves.toBeUndefined();
    expect(applications.acceptFunded).not.toHaveBeenCalled();
  });

  it('throws on a fault so Stripe retries, rather than dropping a paid hire', async () => {
    const { service } = build(
      {
        job_applications: [ok(application())],
        provider_profiles: [ok({ is_verified: true })],
      },
      {
        hold: jest.fn(() =>
          Promise.reject(new BadRequestException('connection lost')),
        ),
      },
    );

    await expect(service.completeFromIntent(intent())).rejects.toThrow(
      'connection lost',
    );
  });

  it('throws when the credit itself cannot be written — money reached us', async () => {
    const { service } = build({
      job_applications: [ok(application())],
      wallet_transactions: [{ data: null, error: { message: 'disk full' } }],
    });

    await expect(service.completeFromIntent(intent())).rejects.toThrow(
      /disk full/,
    );
  });

  it('counts a hire someone else finished as done, and keeps the hold', async () => {
    const { service, escrow } = build(
      {
        job_applications: [ok(application())],
        provider_profiles: [ok({ is_verified: true })],
      },
      {
        acceptFunded: jest.fn(() =>
          Promise.reject(new BadRequestException('already decided')),
        ),
        statusOf: jest.fn(() => Promise.resolve('accepted')),
      },
    );

    await service.completeFromIntent(intent());

    expect(escrow.releaseHoldForFailedHire).not.toHaveBeenCalled();
  });

  it('lets Stripe retry when the accept failed and nothing decided it', async () => {
    const { service, escrow } = build(
      {
        job_applications: [ok(application())],
        provider_profiles: [ok({ is_verified: true })],
      },
      {
        acceptFunded: jest.fn(() =>
          Promise.reject(new Error('connection lost')),
        ),
        statusOf: jest.fn(() => Promise.resolve('pending')),
      },
    );

    await expect(service.completeFromIntent(intent())).rejects.toThrow(
      'connection lost',
    );
    expect(escrow.releaseHoldForFailedHire).not.toHaveBeenCalled();
  });

  it('undoes its own hold when the proposal was decided mid-flight', async () => {
    const findByJob = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'e1',
        status: 'held',
        funding_payment_intent_id: 'pi_1',
      });
    const { service, escrow } = build(
      {
        job_applications: [ok(application())],
        provider_profiles: [ok({ is_verified: true })],
      },
      {
        findByJob,
        acceptFunded: jest.fn(() =>
          Promise.reject(new BadRequestException('already decided')),
        ),
        statusOf: jest.fn(() => Promise.resolve('withdrawn')),
      },
    );

    await service.completeFromIntent(intent());

    expect(escrow.releaseHoldForFailedHire).toHaveBeenCalledWith('j1');
  });

  it('falls back to a wallet-funded hold when the intent carries no charge', async () => {
    const { service, escrow } = build({
      job_applications: [ok(application())],
      provider_profiles: [ok({ is_verified: true })],
    });

    await service.completeFromIntent(intent({ latest_charge: null }));

    expect(escrow.hold).toHaveBeenCalledWith('j1', 'p1', undefined);
  });

  it('writes nothing for an intent without the metadata it needs', async () => {
    const { service, calls } = build({});

    await service.completeFromIntent(
      intent({ metadata: { purpose: 'hire_funding' } }),
    );

    expect(calls).toEqual([]);
  });
});
