import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type Stripe from 'stripe';
import {
  ConnectAccountsService,
  payoutFieldsFrom,
  toConnectStatus,
  type PayoutAccountRow,
} from './connect-accounts.service';
import { ConnectController } from './connect.controller';
import { StripeEventsService } from '../stripe-events.service';
import { StripeService } from '../stripe.service';
import type { SupabaseService } from '../../supabase/supabase.service';
import type { Profile } from '../../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

/** Same chainable stand-in as the other specs — results consumed per `.from()`. */
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
  const auth = {
    admin: {
      getUserById: jest.fn(() =>
        Promise.resolve({ data: { user: { email: 'boy@taskbuddy.io' } } }),
      ),
    },
  };
  return {
    supabase: { admin: { from, auth } } as unknown as SupabaseService,
    calls,
  };
}

function account(overrides: Partial<Stripe.Account> = {}): Stripe.Account {
  return {
    id: 'acct_1',
    object: 'account',
    country: 'US',
    details_submitted: false,
    payouts_enabled: false,
    capabilities: { transfers: 'inactive' },
    requirements: {
      currently_due: ['individual.dob.day'],
      past_due: ['external_account'],
      disabled_reason: 'requirements.past_due',
    },
    ...overrides,
  } as unknown as Stripe.Account;
}

function createStripeMock(options: { agreement?: 'full' | 'recipient' } = {}) {
  const stripe = {
    accounts: {
      create: jest.fn((_params: Stripe.AccountCreateParams, _opts?: unknown) =>
        Promise.resolve(account()),
      ),
      retrieve: jest.fn((_id: string) => Promise.resolve(account())),
      del: jest.fn(() => Promise.resolve({ id: 'acct_new', deleted: true })),
      createLoginLink: jest.fn(() =>
        Promise.resolve({ url: 'https://connect.stripe.com/express/x' }),
      ),
    },
    accountLinks: {
      create: jest.fn((_params: Stripe.AccountLinkCreateParams) =>
        Promise.resolve({
          url: 'https://connect.stripe.com/setup/e/acct_1/abc',
          expires_at: 1_900_000_000,
        }),
      ),
    },
    webhooks: { constructEvent: jest.fn() },
  };
  return {
    service: {
      stripe,
      connectCountry: 'US',
      connectServiceAgreement: options.agreement ?? 'full',
      get connectWebhookSecret() {
        return 'whsec_connect';
      },
    } as unknown as StripeService,
    stripe,
  };
}

const provider = {
  id: 'p1',
  role: 'provider',
  full_name: 'Boy Plumber',
} as Profile;

const row = (overrides: Partial<PayoutAccountRow> = {}): PayoutAccountRow => ({
  profile_id: 'p1',
  stripe_account_id: 'acct_1',
  country: 'US',
  details_submitted: false,
  payouts_enabled: false,
  transfers_active: false,
  requirements_due: [],
  disabled_reason: null,
  stripe_synced_at: null,
  ...overrides,
});

function build(
  results: Record<string, QueryResult[]>,
  stripeOptions: { agreement?: 'full' | 'recipient' } = {},
) {
  const { supabase, calls } = createSupabaseMock(results);
  const { service: stripeService, stripe } = createStripeMock(stripeOptions);
  const service = new ConnectAccountsService(
    supabase,
    stripeService,
    new StripeEventsService(supabase),
  );
  return { service, stripe, calls, stripeService };
}

const APP = 'taskbuddy://payouts';
const BASE = 'https://api.taskbuddy.test';

describe('toConnectStatus', () => {
  it.each([
    [null, 'not_started'],
    [row(), 'onboarding'],
    [row({ details_submitted: true }), 'restricted'],
    [row({ details_submitted: true, transfers_active: true }), 'restricted'],
    [
      row({
        details_submitted: true,
        transfers_active: true,
        payouts_enabled: true,
      }),
      'active',
    ],
  ])('%j → %s', (input, state) => {
    expect(toConnectStatus(input).state).toBe(state);
  });

  it('never exposes the Stripe account id to the app', () => {
    expect(toConnectStatus(row())).not.toHaveProperty('stripe_account_id');
  });
});

describe('payoutFieldsFrom', () => {
  it('maps what Stripe reports, merging currently and past due', () => {
    expect(
      payoutFieldsFrom(
        account({
          details_submitted: true,
          payouts_enabled: true,
          capabilities: { transfers: 'active' },
        }),
      ),
    ).toMatchObject({
      details_submitted: true,
      payouts_enabled: true,
      transfers_active: true,
      requirements_due: ['individual.dob.day', 'external_account'],
      disabled_reason: 'requirements.past_due',
    });
  });
});

describe('ConnectAccountsService.onboardingLink', () => {
  it('creates a transfers-only Express account once, then links to onboarding', async () => {
    const { service, stripe, calls } = build({
      provider_payout_accounts: [
        { data: null, error: null }, // none yet
        { data: row(), error: null }, // insert
      ],
      provider_profiles: [{ data: { profile_id: 'p1' }, error: null }],
    });

    const link = await service.onboardingLink(provider, APP, BASE);

    const [params, opts] = stripe.accounts.create.mock.calls[0];
    expect(params).toMatchObject({
      type: 'express',
      country: 'US',
      email: 'boy@taskbuddy.io',
      business_type: 'individual',
      capabilities: { transfers: { requested: true } },
      metadata: { profile_id: 'p1' },
    });
    expect(params).not.toHaveProperty('tos_acceptance');
    // Two taps inside 24h get the same account back from Stripe.
    expect(opts).toEqual({ idempotencyKey: 'connect-account:p1' });
    expect(
      calls.find(
        (c) => c.table === 'provider_payout_accounts' && c.method === 'insert',
      )?.args[0],
    ).toMatchObject({
      profile_id: 'p1',
      stripe_account_id: 'acct_1',
      country: 'US',
    });

    const linkParams = stripe.accountLinks.create.mock.calls[0][0];
    expect(linkParams).toMatchObject({
      account: 'acct_1',
      type: 'account_onboarding',
      return_url: `${BASE}/payments/connect/return?app_redirect=${encodeURIComponent(APP)}`,
      refresh_url: `${BASE}/payments/connect/refresh?app_redirect=${encodeURIComponent(APP)}`,
    });
    expect(link).toEqual({
      url: 'https://connect.stripe.com/setup/e/acct_1/abc',
      expires_at: 1_900_000_000,
    });
  });

  it('asks for a recipient agreement when the deployment is cross-border', async () => {
    const { service, stripe } = build(
      {
        provider_payout_accounts: [
          { data: null, error: null },
          { data: row(), error: null },
        ],
        provider_profiles: [{ data: { profile_id: 'p1' }, error: null }],
      },
      { agreement: 'recipient' },
    );

    await service.onboardingLink(provider, APP, BASE);

    expect(stripe.accounts.create.mock.calls[0][0]).toMatchObject({
      tos_acceptance: { service_agreement: 'recipient' },
    });
  });

  it('reuses an existing account instead of creating another', async () => {
    const { service, stripe } = build({
      provider_payout_accounts: [{ data: row(), error: null }],
    });

    await service.onboardingLink(provider, APP, BASE);

    expect(stripe.accounts.create).not.toHaveBeenCalled();
    expect(stripe.accountLinks.create).toHaveBeenCalled();
  });

  it('keeps the winner and deletes its own account when it loses the race', async () => {
    const { service, stripe } = build({
      provider_payout_accounts: [
        { data: null, error: null },
        { data: null, error: { message: 'duplicate', code: '23505' } },
        { data: row({ stripe_account_id: 'acct_winner' }), error: null },
      ],
      provider_profiles: [{ data: { profile_id: 'p1' }, error: null }],
    });
    stripe.accounts.create.mockResolvedValueOnce(account({ id: 'acct_new' }));

    await service.onboardingLink(provider, APP, BASE);

    expect(stripe.accounts.del).toHaveBeenCalledWith('acct_new');
    expect(stripe.accountLinks.create.mock.calls[0][0]).toMatchObject({
      account: 'acct_winner',
    });
  });

  it('refuses an app_redirect outside the allowlist before touching Stripe', async () => {
    const { service, stripe } = build({});

    await expect(
      service.onboardingLink(provider, 'https://evil.example/steal', BASE),
    ).rejects.toThrow(BadRequestException);
    expect(stripe.accounts.create).not.toHaveBeenCalled();
  });

  it('requires a provider profile first', async () => {
    const { service, stripe } = build({
      provider_payout_accounts: [{ data: null, error: null }],
      provider_profiles: [{ data: null, error: null }],
    });

    await expect(service.onboardingLink(provider, APP, BASE)).rejects.toThrow(
      /provider profile/,
    );
    expect(stripe.accounts.create).not.toHaveBeenCalled();
  });
});

describe('ConnectAccountsService.dashboardLink', () => {
  it('refuses until onboarding has been submitted', async () => {
    const { service, stripe } = build({
      provider_payout_accounts: [{ data: row(), error: null }],
    });

    await expect(service.dashboardLink(provider)).rejects.toThrow(
      BadRequestException,
    );
    expect(stripe.accounts.createLoginLink).not.toHaveBeenCalled();
  });

  it('returns a login link once it has', async () => {
    const { service } = build({
      provider_payout_accounts: [
        { data: row({ details_submitted: true }), error: null },
      ],
    });

    await expect(service.dashboardLink(provider)).resolves.toEqual({
      url: 'https://connect.stripe.com/express/x',
    });
  });
});

describe('ConnectAccountsService.handleConnectEvent', () => {
  const event = (overrides: Partial<Stripe.Event> = {}) =>
    ({
      id: 'evt_1',
      type: 'account.updated',
      account: 'acct_1',
      data: { object: account({ details_submitted: false }) },
      ...overrides,
    }) as unknown as Stripe.Event;

  it('re-reads the account rather than trusting a possibly stale snapshot', async () => {
    const { service, stripe, calls } = build({
      stripe_events: [
        { data: null, error: null }, // not yet processed
        { data: null, error: null }, // record
      ],
      provider_payout_accounts: [{ data: row(), error: null }],
    });
    stripe.accounts.retrieve.mockResolvedValueOnce(
      account({
        details_submitted: true,
        payouts_enabled: true,
        capabilities: { transfers: 'active' },
      }),
    );

    await service.handleConnectEvent(event());

    expect(stripe.accounts.retrieve).toHaveBeenCalledWith('acct_1');
    const update = calls.find(
      (c) => c.table === 'provider_payout_accounts' && c.method === 'update',
    );
    expect(update?.args[0]).toMatchObject({
      details_submitted: true,
      transfers_active: true,
    });
    // Recorded after the work, never before.
    const order = calls
      .filter((c) => ['update', 'upsert'].includes(c.method))
      .map((c) => c.table);
    expect(order).toEqual(['provider_payout_accounts', 'stripe_events']);
  });

  it('skips an event it has already processed', async () => {
    const { service, stripe } = build({
      stripe_events: [{ data: { id: 'evt_1' }, error: null }],
    });

    await service.handleConnectEvent(event());

    expect(stripe.accounts.retrieve).not.toHaveBeenCalled();
  });

  it('records events it does not act on, so Stripe stops redelivering them', async () => {
    const { service, stripe, calls } = build({
      stripe_events: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    await service.handleConnectEvent(event({ type: 'payout.paid' }));

    expect(stripe.accounts.retrieve).not.toHaveBeenCalled();
    expect(
      calls.some((c) => c.table === 'stripe_events' && c.method === 'upsert'),
    ).toBe(true);
  });
});

describe('StripeService.connectWebhookSecret', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is a 503 when Connect is not configured, not a crash at boot', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec';
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const stripe = new StripeService();
    jest.spyOn(stripe['logger'], 'error').mockImplementation(() => {});

    expect(() => stripe.connectWebhookSecret).toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('ConnectController', () => {
  function controller() {
    const { service, stripe } = build({});
    return {
      controller: new ConnectController(service, {
        stripe,
        connectWebhookSecret: 'whsec_connect',
      } as unknown as StripeService),
      stripe,
    };
  }

  it('bounces an allowed redirect back into the app with connect=return', () => {
    const { controller: c } = controller();
    const res = { redirect: jest.fn() };

    c.onboardingReturn(APP, res as never);

    expect(res.redirect).toHaveBeenCalledWith(`${APP}?connect=return`);
  });

  it('refuses to bounce anywhere else — it would be an open redirect', () => {
    const { controller: c } = controller();
    const res = { redirect: jest.fn() };

    expect(() =>
      c.onboardingRefresh('https://evil.example', res as never),
    ).toThrow(BadRequestException);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('rejects a Connect webhook whose signature does not verify', async () => {
    const { controller: c, stripe } = controller();
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found');
    });

    await expect(
      c.webhook({ rawBody: Buffer.from('{}') } as never, 't=1,v1=bad'),
    ).rejects.toThrow(/signature verification failed/);
  });
});
