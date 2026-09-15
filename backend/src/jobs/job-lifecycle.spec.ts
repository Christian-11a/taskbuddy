import { JobsService } from './jobs.service';
import { ApplicationsService } from '../applications/applications.service';
import { EscrowService } from '../escrow/escrow.service';
import { WalletService } from '../wallet/wallet.service';
import { ReviewsService } from '../reviews/reviews.service';
import { DisputesService } from '../escrow/disputes.service';
import { HireFundingService } from '../payments/hire-funding.service';
import { ConnectAccountsService } from '../payments/connect/connect-accounts.service';
import { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';
import { StripeEventsService } from '../payments/stripe-events.service';
import type { StripeService } from '../payments/stripe.service';
import type { StripeCustomersService } from '../payments/stripe-customers.service';
import type Stripe from 'stripe';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { AdminActionsService } from '../admin/admin-actions.service';
import type { Profile } from '../common/types';

/**
 * The end-to-end job lifecycle: post → apply → accept → escrow hold → start →
 * complete → payout → review, plus the two ways it can end badly (cancellation
 * and a dispute).
 *
 * The unit specs each mock `from()` per call, which is right for testing one
 * service's decisions but structurally cannot catch the failure this file is
 * for: a job's status, its escrow row and both parties' ledgers disagreeing
 * with each other across five services and two database triggers. The only way
 * to assert they agree is to give them a shared store to disagree in, which is
 * what `FakeDb` below is.
 *
 * It is a fake, not Postgres. It implements the query surface these services
 * reach for, and the triggers are *transcribed* from
 * `0002_functions_and_triggers.sql` and `0007_job_pricing_schedule_photos.sql`
 * rather than executed — so a change to those files will not fail this test.
 * That is the honest limit of what it proves; the verification queries in
 * `docs/backend-handoff-booking-tasks-verification.md` §4 are where real schema
 * behaviour gets checked.
 */

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;
interface PgError {
  message: string;
  code?: string;
}

/**
 * Column defaults the DDL supplies and an insert therefore omits. Without
 * these a freshly posted job has no status at all, which is not a state the
 * real schema can produce.
 */
const DEFAULTS: Record<string, () => Row> = {
  jobs: () => ({
    status: 'open',
    urgency: 'normal',
    assigned_provider_id: null,
    assigned_at: null,
    scheduled_at: null,
    budget: null,
    photo_urls: [],
    posted_at: new Date().toISOString(),
  }),
  job_applications: () => ({
    status: 'pending',
    decided_at: null,
    applied_at: new Date().toISOString(),
  }),
  job_tasks: () => ({ is_done: false, completed_at: null }),
  escrow_transactions: () => ({
    status: 'held',
    held_at: new Date().toISOString(),
    released_at: null,
    refunded_at: null,
    commission_amount: 0,
    // 0028
    funding_method: 'wallet',
    funding_payment_intent_id: null,
    funding_charge_id: null,
    transfer_status: 'none',
    transfer_attempts: 0,
    transfer_attempted_at: null,
    transfer_last_error: null,
    stripe_transfer_id: null,
  }),
  wallet_transactions: () => ({
    status: 'completed',
    job_id: null,
    withdrawal_destination: null,
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
  }),
  disputes: () => ({
    status: 'open',
    resolution: null,
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
  }),
  notifications: () => ({ is_read: false, data: null }),
};

/** Composite uniqueness, as the migrations declare it. */
const UNIQUE_KEYS: Record<string, string[][]> = {
  escrow_transactions: [['job_id']],
  // Partial: `where stripe_payment_intent_id is not null` (0013). The
  // collision is how a redelivered payment is recognised.
  wallet_transactions: [['stripe_payment_intent_id']],
  reviews: [['job_id']],
  job_applications: [['job_id', 'provider_id']],
  bookings: [['job_id']],
};

class FakeDb {
  readonly tables: Record<string, Row[]> = {
    profiles: [],
    provider_profiles: [],
    service_categories: [],
    jobs: [],
    job_tasks: [],
    job_applications: [],
    escrow_transactions: [],
    wallet_transactions: [],
    reviews: [],
    notifications: [],
    bookings: [],
    disputes: [],
    platform_settings: [],
    recommendation_candidates: [],
    provider_payout_accounts: [],
    stripe_events: [],
  };

  private seq = 0;

  /** Deterministic ids, so a failing assertion names a row you can find. */
  id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? (this.tables[table] = []);
  }

  /** The ledger balance, computed the way WalletService computes it. */
  balance(profileId: string): number {
    return this.rows('wallet_transactions')
      .filter((t) => t.profile_id === profileId && t.status === 'completed')
      .reduce(
        (sum, t) =>
          t.direction === 'credit'
            ? sum + Number(t.amount)
            : sum - Number(t.amount),
        0,
      );
  }

  ledgerFor(profileId: string) {
    return this.rows('wallet_transactions')
      .filter((t) => t.profile_id === profileId)
      .map((t) => ({
        direction: t.direction,
        kind: t.kind,
        amount: Number(t.amount),
      }));
  }

  /**
   * The embeds the callers' `select()` strings ask for. Only `jobs` has any:
   * JobsService reads its review, checklist, category and assigned provider on
   * every query.
   */
  private embed(table: string, row: Row): Row {
    if (table === 'job_applications') {
      return {
        ...row,
        jobs: this.rows('jobs').find((j) => j.id === row.job_id) ?? null,
        provider:
          this.rows('profiles').find((p) => p.id === row.provider_id) ?? null,
      };
    }
    if (table !== 'jobs') return { ...row };
    return {
      ...row,
      service_categories:
        this.rows('service_categories').find((c) => c.id === row.category_id) ??
        null,
      assigned_provider:
        this.rows('profiles').find((p) => p.id === row.assigned_provider_id) ??
        null,
      job_tasks: this.rows('job_tasks').filter((t) => t.job_id === row.id),
      // reviews.job_id is UNIQUE, so PostgREST returns this as an object.
      reviews: this.rows('reviews').find((r) => r.job_id === row.id) ?? null,
    };
  }

  private uniqueViolation(table: string, row: Row): PgError | null {
    for (const key of UNIQUE_KEYS[table] ?? []) {
      // A null in a unique column never collides — which is also what makes
      // the partial indexes above behave like their SQL.
      if (key.some((col) => row[col] == null)) continue;
      const clash = this.rows(table).some((existing) =>
        key.every((col) => existing[col] === row[col]),
      );
      if (clash) {
        return {
          message: `duplicate key value violates unique constraint on ${table}`,
          code: '23505',
        };
      }
    }
    return null;
  }

  /** The `after` triggers this lifecycle depends on. */
  private fireTriggers(table: string, next: Row, previous?: Row) {
    // trg_application_accepted → handle_application_accepted()
    if (
      table === 'job_applications' &&
      next.status === 'accepted' &&
      previous?.status !== 'accepted'
    ) {
      const job = this.rows('jobs').find((j) => j.id === next.job_id);
      if (job) {
        job.assigned_provider_id = next.provider_id;
        job.assigned_at = new Date().toISOString();
        job.status = 'assigned';
        if (job.scheduled_at) {
          this.rows('bookings').push({
            id: this.id('booking'),
            job_id: job.id,
            provider_id: next.provider_id,
            client_id: job.client_id,
            scheduled_at: job.scheduled_at,
          });
        }
      }
      for (const sibling of this.rows('job_applications')) {
        if (
          sibling.job_id === next.job_id &&
          sibling.id !== next.id &&
          sibling.status === 'pending'
        ) {
          sibling.status = 'rejected';
          sibling.decided_at = new Date().toISOString();
        }
      }
    }

    // trg_reviews_refresh_rating → refresh_provider_rating()
    if (table === 'reviews') {
      const theirs = this.rows('reviews').filter(
        (r) => r.provider_id === next.provider_id,
      );
      const profile = this.rows('provider_profiles').find(
        (p) => p.profile_id === next.provider_id,
      );
      if (profile) {
        profile.cached_ratings_count = theirs.length;
        profile.cached_avg_rating =
          Math.round(
            (theirs.reduce((sum, r) => sum + r.rating, 0) / theirs.length) *
              100,
          ) / 100;
      }
    }

    // trg_job_completed → refresh_provider_completed_jobs()
    if (
      table === 'jobs' &&
      next.status === 'completed' &&
      previous?.status !== 'completed'
    ) {
      const profile = this.rows('provider_profiles').find(
        (p) => p.profile_id === next.assigned_provider_id,
      );
      if (profile) {
        profile.cached_completed_jobs =
          (profile.cached_completed_jobs ?? 0) + 1;
      }
    }
  }

  get service(): SupabaseService {
    return {
      admin: {
        from: (table: string) => this.builder(table),
        rpc: (fn: string, args: Row) => Promise.resolve(this.rpc(fn, args)),
      },
    } as unknown as SupabaseService;
  }

  /** What `wallet_available_balance` computes: settled minus every pending debit. */
  available(profileId: string): number {
    const pending = this.rows('wallet_transactions')
      .filter(
        (t) =>
          t.profile_id === profileId &&
          t.status === 'pending' &&
          t.direction === 'debit',
      )
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return this.balance(profileId) - pending;
  }

  /**
   * The money functions from migration 0028, transcribed like the triggers
   * above — same honest limit: `npm run test:sql` is what executes the real
   * ones. Each runs to completion before anything else can interleave, which
   * is what the real ones' single transaction and advisory lock guarantee.
   */
  private rpc(
    fn: string,
    args: Row,
  ): { data: unknown; error: (PgError & { details?: string }) | null } {
    const refuse = (code: string, message: string, details?: string) => ({
      data: null,
      error: { code, message, details },
    });
    const ledger = (entry: Row) => {
      const row = {
        id: this.id('wallet_transactions'),
        created_at: new Date().toISOString(),
        ...DEFAULTS.wallet_transactions(),
        ...entry,
      };
      this.rows('wallet_transactions').push(row);
      return row;
    };

    if (fn === 'escrow_place_hold') {
      const job = this.rows('jobs').find((j) => j.id === args.p_job_id);
      if (!job) return refuse('TB404', 'Job not found');
      if (job.budget == null) {
        return { data: { escrow: null, placed: false }, error: null };
      }
      const existing = this.rows('escrow_transactions').find(
        (e) => e.job_id === job.id,
      );
      if (existing && existing.provider_id !== args.p_provider_id) {
        return refuse(
          'TB409',
          'This job already has an escrow hold for another provider.',
        );
      }
      if (existing?.status === 'held') {
        return {
          data: { escrow: { ...existing }, placed: false },
          error: null,
        };
      }
      if (existing && existing.status !== 'cancelled') {
        return refuse(
          'TB409',
          `This job's escrow is already '${existing.status}'`,
        );
      }
      const amount = Number(existing?.amount ?? job.budget);
      const available = this.available(job.client_id);
      if (available < amount) {
        return refuse(
          'TB402',
          'Insufficient wallet balance',
          JSON.stringify({ needed: amount, available }),
        );
      }
      const funding = {
        funding_method: args.p_funding_method ?? 'wallet',
        funding_payment_intent_id: args.p_payment_intent_id ?? null,
        funding_charge_id: args.p_charge_id ?? null,
      };
      let escrow: Row;
      if (existing) {
        Object.assign(existing, { status: 'held', ...funding });
        escrow = existing;
      } else {
        escrow = {
          id: this.id('escrow_transactions'),
          ...DEFAULTS.escrow_transactions(),
          job_id: job.id,
          client_id: job.client_id,
          provider_id: args.p_provider_id,
          amount,
          ...funding,
        };
        this.rows('escrow_transactions').push(escrow);
      }
      ledger({
        profile_id: job.client_id,
        direction: 'debit',
        kind: 'escrow_hold',
        amount,
        title: `Escrow hold — ${job.title}`,
        job_id: job.id,
      });
      return { data: { escrow: { ...escrow }, placed: true }, error: null };
    }

    if (fn === 'escrow_settle') {
      const escrow = this.rows('escrow_transactions').find(
        (e) => e.id === args.p_escrow_id,
      );
      if (!escrow || escrow.status !== args.p_expected) {
        return { data: null, error: null };
      }
      const next = args.p_next as string;
      const commission = Number(args.p_commission ?? 0);
      escrow.status = next;
      if (next === 'released') {
        escrow.released_at = new Date().toISOString();
        escrow.commission_amount = commission;
        if (escrow.funding_method === 'card')
          escrow.transfer_status = 'pending';
        ledger({
          profile_id: escrow.provider_id,
          direction: 'credit',
          kind: 'payout',
          amount: Number(escrow.amount) - commission,
          title: args.p_title ?? 'Payout',
          job_id: escrow.job_id,
        });
      } else if (next === 'refunded' || next === 'cancelled') {
        if (next === 'refunded') escrow.refunded_at = new Date().toISOString();
        ledger({
          profile_id: escrow.client_id,
          direction: 'credit',
          kind: 'refund',
          amount: Number(escrow.amount),
          title: args.p_title ?? 'Refund',
          job_id: escrow.job_id,
        });
      }
      return { data: { ...escrow }, error: null };
    }

    if (fn === 'wallet_reserve_connect_transfer') {
      const escrow = this.rows('escrow_transactions').find(
        (e) => e.id === args.p_escrow_id,
      );
      if (!escrow) return refuse('TB404', 'Escrow not found');
      if (escrow.status !== 'released' || escrow.funding_method !== 'card') {
        return refuse(
          'TB409',
          'Only a released, card-funded escrow can be sent to Stripe',
        );
      }
      const live = this.rows('wallet_transactions').find(
        (t) =>
          t.job_id === escrow.job_id &&
          t.kind === 'connect_transfer' &&
          ['pending', 'completed'].includes(t.status),
      );
      if (live) return { data: { ...live }, error: null };
      const amount = Number(args.p_amount);
      const available = this.available(escrow.provider_id);
      if (available < amount) {
        return refuse(
          'TB402',
          'Insufficient wallet balance',
          JSON.stringify({ needed: amount, available }),
        );
      }
      const row = ledger({
        profile_id: escrow.provider_id,
        direction: 'debit',
        kind: 'connect_transfer',
        status: 'pending',
        amount,
        title: args.p_title ?? 'Sent to your Stripe account',
        job_id: escrow.job_id,
      });
      return { data: { ...row }, error: null };
    }

    return refuse('42883', `function ${fn} is not transcribed in FakeDb`);
  }

  private builder(table: string) {
    const filters: Filter[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let pending: Row[] = [];
    let patch: Row = {};
    let sort: { column: string; ascending: boolean } | null = null;
    let cap: number | null = null;

    const resolve = (): { data: unknown; error: PgError | null } => {
      if (mode === 'insert') {
        const inserted: Row[] = [];
        for (const row of pending) {
          const clash = this.uniqueViolation(table, row);
          if (clash) return { data: null, error: clash };
          const stored: Row = {
            id: this.id(table),
            created_at: new Date().toISOString(),
            ...(DEFAULTS[table]?.() ?? {}),
            ...row,
          };
          this.rows(table).push(stored);
          this.fireTriggers(table, stored);
          inserted.push(stored);
        }
        return { data: inserted.map((r) => this.embed(table, r)), error: null };
      }

      let matched = this.rows(table).filter((row) =>
        filters.every((f) => f(row)),
      );

      if (mode === 'update') {
        const updated = matched.map((row) => {
          const previous = { ...row };
          Object.assign(row, patch);
          this.fireTriggers(table, row, previous);
          return row;
        });
        return { data: updated.map((r) => this.embed(table, r)), error: null };
      }

      if (sort) {
        const { column, ascending } = sort;
        matched = [...matched].sort((a, b) => {
          const av = a[column] ?? '';
          const bv = b[column] ?? '';
          if (av === bv) return 0;
          return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      if (cap !== null) matched = matched.slice(0, cap);
      return { data: matched.map((r) => this.embed(table, r)), error: null };
    };

    const one = (allowEmpty: boolean) => {
      const { data, error } = resolve();
      if (error) return Promise.resolve({ data: null, error });
      const rows = data as Row[];
      if (rows.length === 0) {
        return Promise.resolve(
          allowEmpty
            ? { data: null, error: null }
            : {
                data: null,
                error: {
                  message: `no rows returned from ${table}`,
                  code: 'PGRST116',
                },
              },
        );
      }
      return Promise.resolve({ data: rows[0], error: null });
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (rows: Row | Row[]) => {
        mode = 'insert';
        pending = Array.isArray(rows) ? rows : [rows];
        return chain;
      },
      update: (values: Row) => {
        mode = 'update';
        patch = values;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return chain;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return chain;
      },
      lt: (column: string, value: unknown) => {
        filters.push((row) => row[column] < (value as never));
        return chain;
      },
      gte: (column: string, value: unknown) => {
        filters.push((row) => row[column] >= (value as never));
        return chain;
      },
      lte: (column: string, value: unknown) => {
        filters.push((row) => row[column] <= (value as never));
        return chain;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        sort = { column, ascending: opts?.ascending !== false };
        return chain;
      },
      limit: (n: number) => {
        cap = n;
        return chain;
      },
      range: () => chain,
      single: () => one(false),
      maybeSingle: () => one(true),
      then: (
        onResolve: (value: unknown) => unknown,
        onReject?: (reason: unknown) => unknown,
      ) => Promise.resolve(resolve()).then(onResolve, onReject),
    };
    return chain;
  }
}

const BUDGET = 1500;

const client = { id: 'c1', role: 'client', full_name: 'Ana Cruz' } as Profile;
const provider = {
  id: 'p1',
  role: 'provider',
  full_name: 'Boy Plumber',
} as Profile;
const rival = {
  id: 'p2',
  role: 'provider',
  full_name: 'Rival Plumber',
} as Profile;
const admin = { id: 'a1', role: 'admin', full_name: 'Ops' } as Profile;

/** Every service the lifecycle touches, wired to one shared store. */
/**
 * Stripe, as far as a payout transfer touches it. The ₱1,500 charge settled
 * into a US platform as $27.00 — the FX reason card-funded payouts are
 * sourced from their own charge (§29.5).
 */
function createFakeStripe() {
  const transfers: Record<string, any>[] = [];
  let refuseTransfers: string | null = null;
  const stripe = {
    charges: {
      retrieve: jest.fn((id: string) =>
        Promise.resolve({
          id,
          amount: BUDGET * 100,
          balance_transaction: { amount: 2700, currency: 'usd' },
        }),
      ),
    },
    transfers: {
      list: jest.fn(() => Promise.resolve({ data: transfers })),
      create: jest.fn((params: Record<string, any>) => {
        if (refuseTransfers) {
          return Promise.reject(
            Object.assign(new Error(refuseTransfers), {
              type: 'StripeInvalidRequestError',
            }),
          );
        }
        const transfer = { id: `tr_${transfers.length + 1}`, ...params };
        transfers.push(transfer);
        return Promise.resolve(transfer);
      }),
    },
  };
  return {
    service: { stripe } as unknown as StripeService,
    stripe,
    transfers,
    refuse: (message: string | null) => {
      refuseTransfers = message;
    },
  };
}

/** Lets a started-not-awaited transfer (EscrowService.payOut) run to its end. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

function buildWorld(
  options: {
    topUp?: number;
    commissionRate?: number;
    /** Give provider p1 an active Stripe Connect payout account. */
    payable?: boolean;
  } = {},
) {
  const db = new FakeDb();
  const supabase = db.service;

  db.rows('service_categories').push({
    id: 1,
    name: 'Plumbing',
    is_active: true,
  });
  db.rows('profiles').push(
    { id: 'c1', full_name: 'Ana Cruz', role: 'client', deleted_at: null },
    { id: 'p1', full_name: 'Boy Plumber', role: 'provider', deleted_at: null },
    {
      id: 'p2',
      full_name: 'Rival Plumber',
      role: 'provider',
      deleted_at: null,
    },
  );
  db.rows('provider_profiles').push(
    {
      profile_id: 'p1',
      is_verified: true,
      cached_avg_rating: null,
      cached_ratings_count: 0,
      cached_completed_jobs: 0,
    },
    {
      profile_id: 'p2',
      is_verified: true,
      cached_avg_rating: null,
      cached_ratings_count: 0,
      cached_completed_jobs: 0,
    },
  );
  db.rows('platform_settings').push({
    id: true,
    commission_rate: options.commissionRate ?? 0,
  });

  // The only way money enters: a settled Stripe charge, written as the webhook
  // writes it.
  if (options.topUp) {
    db.rows('wallet_transactions').push({
      id: db.id('topup'),
      profile_id: 'c1',
      direction: 'credit',
      kind: 'topup',
      status: 'completed',
      amount: options.topUp,
      title: 'Wallet top-up',
      created_at: new Date().toISOString(),
    });
  }

  const adminActions = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdminActionsService;
  const uploads = {
    assertOwnedPaths: jest.fn(),
  } as unknown as UploadsService;

  if (options.payable) {
    db.rows('provider_payout_accounts').push({
      profile_id: 'p1',
      stripe_account_id: 'acct_p1',
      country: 'US',
      details_submitted: true,
      payouts_enabled: true,
      transfers_active: true,
      requirements_due: [],
      disabled_reason: null,
    });
  }

  const fakeStripe = createFakeStripe();
  const accounts = new ConnectAccountsService(
    supabase,
    fakeStripe.service,
    new StripeEventsService(supabase),
  );
  const payouts = new ConnectPayoutsService(
    supabase,
    fakeStripe.service,
    accounts,
    adminActions,
  );
  const wallet = new WalletService(supabase, adminActions);
  const escrow = new EscrowService(supabase, payouts);
  const jobs = new JobsService(supabase, uploads, escrow);
  const applications = new ApplicationsService(supabase, escrow);
  const reviews = new ReviewsService(supabase);
  const disputes = new DisputesService(supabase, escrow, adminActions);
  // Only the webhook half runs here; opening Checkout needs Stripe itself.
  const hireFunding = new HireFundingService(
    supabase,
    {} as StripeService,
    {} as StripeCustomersService,
    applications,
    escrow,
  );

  return {
    db,
    wallet,
    escrow,
    jobs,
    applications,
    reviews,
    disputes,
    hireFunding,
    payouts,
    fakeStripe,
  };
}

async function postJob(
  world: ReturnType<typeof buildWorld>,
  budget: number | null = BUDGET,
) {
  return world.jobs.create(client, {
    category_id: 1,
    title: 'Fix kitchen faucet',
    description: 'Tumutulo yung gripo sa kusina, need ayusin agad po.',
    address: 'Quezon City',
    latitude: 14.676,
    longitude: 121.0437,
    budget: budget ?? undefined,
    tasks: ['Check the seal', 'Replace the cartridge'],
  });
}

describe('job lifecycle, end to end', () => {
  it('carries a job from posting to payout and review', async () => {
    const world = buildWorld({ topUp: 5000 });
    const { db, jobs, applications, escrow, wallet, reviews } = world;

    // 1. The client posts a job with a budget and a checklist.
    const posted = (await postJob(world)) as Record<string, any>;
    expect(posted.status).toBe('open');
    expect(posted.job_tasks).toHaveLength(2);
    expect(posted.has_review).toBe(false);

    // 2. Two providers apply; the client may hire exactly one.
    const application = (await applications.apply(provider, posted.id, {
      cover_message: 'Kaya ko po ito',
    })) as Record<string, any>;
    await applications.apply(rival, posted.id, {});

    // 3. Accepting hires the provider and holds the budget in one step.
    await applications.accept(client, application.id);

    const held = await escrow.findByJob(posted.id);
    expect(held).toMatchObject({
      status: 'held',
      provider_id: 'p1',
      amount: BUDGET,
    });
    // The rival is out, and the money has left the client's spendable balance.
    expect(
      db.rows('job_applications').find((a) => a.provider_id === 'p2')?.status,
    ).toBe('rejected');
    expect(await wallet.balanceFor('c1')).toBe(5000 - BUDGET);

    // 4. The provider confirms, starts, and ticks the checklist off.
    await jobs.accept(provider, posted.id);
    expect(db.rows('jobs')[0].status).toBe('confirmed');

    await jobs.start(provider, posted.id);
    const taskId = db.rows('job_tasks')[0].id;
    const midway = (await jobs.updateTask(provider, posted.id, taskId, {
      is_done: true,
    })) as Record<string, any>;
    expect(midway.job_tasks.find((t: Row) => t.id === taskId).is_done).toBe(
      true,
    );

    // 5. The client confirms completion; escrow pays the provider.
    await jobs.complete(client, posted.id);

    expect(await escrow.findByJob(posted.id)).toMatchObject({
      status: 'released',
      commission_amount: 0,
    });
    expect(await wallet.balanceFor('p1')).toBe(BUDGET);
    expect(db.ledgerFor('p1')).toEqual([
      { direction: 'credit', kind: 'payout', amount: BUDGET },
    ]);
    // The trigger's cached counter, which the ML feature set reads.
    expect(
      db.rows('provider_profiles').find((p) => p.profile_id === 'p1')
        ?.cached_completed_jobs,
    ).toBe(1);

    // 6. The client reviews, and the cached rating follows.
    await reviews.create(client, posted.id, {
      rating: 5,
      comment: 'Ang bilis!',
    });
    expect(
      db.rows('provider_profiles').find((p) => p.profile_id === 'p1'),
    ).toMatchObject({ cached_avg_rating: 5, cached_ratings_count: 1 });

    // 7. And the job now says so, which is what hides "Leave Review".
    const reviewed = (await jobs.getById(client, posted.id)) as Record<
      string,
      any
    >;
    expect(reviewed.has_review).toBe(true);

    // Nothing may be reviewed or completed twice.
    await expect(
      reviews.create(client, posted.id, { rating: 1 }),
    ).rejects.toThrow('This job already has a review');
    await expect(jobs.complete(client, posted.id)).rejects.toThrow(
      /Cannot complete a job in status 'completed'/,
    );
  });

  it('withholds the configured commission at release, and nowhere else', async () => {
    const world = buildWorld({ topUp: 5000, commissionRate: 0.15 });
    const { db, jobs, applications, escrow, wallet } = world;

    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await applications.accept(client, application.id);
    await jobs.start(provider, posted.id);
    await jobs.complete(client, posted.id);

    // The client paid the full budget; the provider received it less the cut.
    expect(await wallet.balanceFor('c1')).toBe(5000 - BUDGET);
    expect(await wallet.balanceFor('p1')).toBe(1275);
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      commission_amount: 225,
    });
    // The commission has no ledger row of its own — the platform is not a
    // profile — so the ledger deliberately does not net to zero here.
    expect(
      db.rows('wallet_transactions').filter((t) => t.job_id === posted.id),
    ).toHaveLength(2);
  });

  it('refuses the hire and leaves the job open when the wallet is short', async () => {
    const world = buildWorld({ topUp: 100 });
    const { db, applications } = world;

    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;

    await expect(applications.accept(client, application.id)).rejects.toThrow(
      /Insufficient wallet balance/,
    );

    // The whole point: no hire, no assignment, no rejected rivals, no debit.
    expect(db.rows('jobs')[0].status).toBe('open');
    expect(db.rows('jobs')[0].assigned_provider_id).toBeNull();
    expect(db.rows('job_applications')[0].status).toBe('pending');
    expect(db.rows('escrow_transactions')).toEqual([]);
    expect(db.ledgerFor('c1')).toEqual([
      { direction: 'credit', kind: 'topup', amount: 100 },
    ]);
  });

  it('returns the money to the client when the job is cancelled', async () => {
    const world = buildWorld({ topUp: 5000 });
    const { db, jobs, applications, escrow, wallet } = world;

    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await applications.accept(client, application.id);
    await jobs.cancel(client, posted.id);

    expect(db.rows('jobs')[0].status).toBe('cancelled');
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      status: 'cancelled',
    });
    expect(await wallet.balanceFor('c1')).toBe(5000);
    expect(await wallet.balanceFor('p1')).toBe(0);
    // Tagged `refund`, not `payout` — counting it as revenue would inflate the
    // dashboard by the value of every cancelled job.
    expect(db.ledgerFor('c1')).toEqual([
      { direction: 'credit', kind: 'topup', amount: 5000 },
      { direction: 'debit', kind: 'escrow_hold', amount: BUDGET },
      { direction: 'credit', kind: 'refund', amount: BUDGET },
    ]);
  });

  it('freezes the money on a dispute and pays whoever the admin decides', async () => {
    const world = buildWorld({ topUp: 5000 });
    const { db, jobs, applications, escrow, wallet, disputes } = world;

    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await applications.accept(client, application.id);
    await jobs.start(provider, posted.id);

    await disputes.raise(client, posted.id, { reason: 'Hindi natapos' });
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      status: 'disputed',
    });

    // Completing now must not quietly pay the provider out from under the
    // dispute — that decision belongs to an admin.
    await jobs.complete(client, posted.id);
    expect(await wallet.balanceFor('p1')).toBe(0);
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      status: 'disputed',
    });

    const dispute = db.rows('disputes')[0];
    await disputes.resolve(admin, dispute.id, {
      resolution: 'refunded_to_client',
    });

    expect(await escrow.findByJob(posted.id)).toMatchObject({
      status: 'refunded',
    });
    expect(await wallet.balanceFor('c1')).toBe(5000);
    expect(await wallet.balanceFor('p1')).toBe(0);
  });

  it('runs the whole lifecycle for a job posted without a budget', async () => {
    // Every job created before migration 0007 has none. Escrow no-ops for
    // them and nothing else in the lifecycle may notice.
    const world = buildWorld();
    const { db, jobs, applications, escrow, wallet, reviews } = world;

    const posted = (await postJob(world, null)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await applications.accept(client, application.id);
    await jobs.start(provider, posted.id);
    await jobs.complete(client, posted.id);
    await reviews.create(client, posted.id, { rating: 4 });

    expect(db.rows('jobs')[0].status).toBe('completed');
    expect(await escrow.findByJob(posted.id)).toBeNull();
    expect(await wallet.balanceFor('p1')).toBe(0);
    expect(db.rows('wallet_transactions')).toEqual([]);
  });

  it('refunds the client when the assigned provider backs out', async () => {
    const world = buildWorld({ topUp: 5000 });
    const { db, jobs, applications, wallet } = world;

    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await applications.accept(client, application.id);
    await jobs.decline(provider, posted.id, { reason: 'May emergency po' });

    expect(db.rows('jobs')[0].status).toBe('cancelled');
    expect(await wallet.balanceFor('c1')).toBe(5000);
  });
});

/** A card payment for the job's budget, as Stripe reports it to the webhook. */
function hirePayment(
  application: Record<string, any>,
  budget = BUDGET,
): Stripe.PaymentIntent {
  return {
    id: 'pi_hire',
    amount_received: Math.round(budget * 100),
    currency: 'php',
    latest_charge: 'ch_hire',
    metadata: {
      purpose: 'hire_funding',
      profile_id: 'c1',
      application_id: application.id,
      job_id: application.job_id,
      provider_id: application.provider_id,
    },
  } as unknown as Stripe.PaymentIntent;
}

describe('job lifecycle, paid by card at hire (§29.4)', () => {
  it('holds the card payment on the webhook and pays the provider on completion', async () => {
    // No top-up: the client's wallet is empty until Stripe says the card paid.
    const world = buildWorld();
    const { db, jobs, applications, escrow, wallet, hireFunding } = world;
    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;

    await hireFunding.completeFromIntent(hirePayment(application));

    // HELD immediately after the webhook, recording the payment behind it.
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      status: 'held',
      funding_method: 'card',
      funding_payment_intent_id: 'pi_hire',
      funding_charge_id: 'ch_hire',
    });
    expect(db.rows('job_applications')[0].status).toBe('accepted');
    expect(db.rows('jobs')[0].status).toBe('assigned');
    // One ledger: the card payment in, the hold out.
    expect(db.ledgerFor('c1')).toEqual([
      { direction: 'credit', kind: 'topup', amount: BUDGET },
      { direction: 'debit', kind: 'escrow_hold', amount: BUDGET },
    ]);

    await jobs.start(provider, posted.id);
    await jobs.complete(client, posted.id);

    await flush();
    expect(await wallet.balanceFor('p1')).toBe(BUDGET);
    // Marked for the onward Stripe transfer in the same move as the release;
    // this provider has no payout account, so it stays in their wallet.
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      status: 'released',
      transfer_status: 'not_eligible',
    });
  });

  it('turns a redelivered payment into exactly one credit, one hold and one hire', async () => {
    const world = buildWorld();
    const { db, applications, hireFunding } = world;
    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;

    await hireFunding.completeFromIntent(hirePayment(application));
    await hireFunding.completeFromIntent(hirePayment(application));

    expect(db.ledgerFor('c1')).toEqual([
      { direction: 'credit', kind: 'topup', amount: BUDGET },
      { direction: 'debit', kind: 'escrow_hold', amount: BUDGET },
    ]);
    expect(db.rows('escrow_transactions')).toHaveLength(1);
  });

  it('refunds a cancelled card-funded job to the wallet', async () => {
    const world = buildWorld();
    const { jobs, applications, wallet, hireFunding } = world;
    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await hireFunding.completeFromIntent(hirePayment(application));

    await jobs.cancel(client, posted.id);

    // Back in the wallet — spendable on another hire, or withdrawable.
    expect(await wallet.balanceFor('c1')).toBe(BUDGET);
  });

  it('keeps the money in the wallet when a wallet accept won the race', async () => {
    const world = buildWorld({ topUp: 5000 });
    const { db, applications, wallet, hireFunding } = world;
    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;

    await applications.accept(client, application.id); // from the wallet
    await hireFunding.completeFromIntent(hirePayment(application));

    expect(db.rows('escrow_transactions')).toHaveLength(1);
    expect(db.rows('escrow_transactions')[0].funding_method).toBe('wallet');
    // 5000 − 1500 held + 1500 card payment, nothing lost and nothing doubled.
    expect(await wallet.balanceFor('c1')).toBe(5000);
  });
});

describe('card-funded payouts sent to Stripe Connect (§29.5)', () => {
  async function completedCardJob(world: ReturnType<typeof buildWorld>) {
    const { jobs, applications, hireFunding } = world;
    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await hireFunding.completeFromIntent(hirePayment(application));
    await jobs.start(provider, posted.id);
    await jobs.complete(client, posted.id);
    await flush();
    return posted;
  }

  it('pays the provider in the ledger, then sends it on at the charge’s own rate', async () => {
    const world = buildWorld({ payable: true });
    const { db, escrow, wallet, fakeStripe } = world;

    const posted = await completedCardJob(world);

    expect(fakeStripe.transfers).toEqual([
      expect.objectContaining({
        amount: 2700, // the $27.00 the ₱1,500 charge settled for
        currency: 'usd',
        destination: 'acct_p1',
        source_transaction: 'ch_hire',
        transfer_group: `job:${posted.id}`,
      }),
    ]);
    // Credited, then sent on: the wallet nets to zero and says why.
    expect(db.ledgerFor('p1')).toEqual([
      { direction: 'credit', kind: 'payout', amount: BUDGET },
      { direction: 'debit', kind: 'connect_transfer', amount: BUDGET },
    ]);
    expect(await wallet.balanceFor('p1')).toBe(0);
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      transfer_status: 'transferred',
      stripe_transfer_id: 'tr_1',
      transfer_currency: 'usd',
    });
  });

  it('leaves the payout in the wallet when the provider has not set up payouts', async () => {
    const world = buildWorld(); // no payout account
    const { db, escrow, wallet, fakeStripe } = world;

    const posted = await completedCardJob(world);

    expect(fakeStripe.transfers).toEqual([]);
    expect(await wallet.balanceFor('p1')).toBe(BUDGET);
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      transfer_status: 'not_eligible',
    });
    expect(
      db
        .rows('notifications')
        .some(
          (n) =>
            n.recipient_id === 'p1' &&
            n.title === 'Payout added to your wallet',
        ),
    ).toBe(true);
  });

  it('keeps a refused transfer in the wallet, and a later sweep sends it', async () => {
    const world = buildWorld({ payable: true });
    const { escrow, wallet, fakeStripe, payouts } = world;
    fakeStripe.refuse('Account is restricted');

    const posted = await completedCardJob(world);

    // Refused: the reservation is released and the money is spendable again.
    expect(await wallet.availableBalanceFor('p1')).toBe(BUDGET);
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      transfer_status: 'failed',
      transfer_attempts: 1,
      transfer_last_error: 'Account is restricted',
    });

    // The provider fixes their account; the sweep runs once the backoff passes.
    fakeStripe.refuse(null);
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await payouts.sweep(later);

    expect(await escrow.findByJob(posted.id)).toMatchObject({
      transfer_status: 'transferred',
    });
    expect(await wallet.balanceFor('p1')).toBe(0);
    // A fresh idempotency key for the second attempt, so Stripe does not
    // replay the cached refusal.
    const keys = fakeStripe.stripe.transfers.create.mock.calls.map(
      (call: unknown[]) =>
        (call[1] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(new Set(keys).size).toBe(2);
  });

  it('does not send money the provider already withdrew by hand', async () => {
    const world = buildWorld({ payable: true });
    const { db, escrow, jobs, applications, hireFunding, fakeStripe } = world;
    fakeStripe.refuse('Temporarily unavailable');
    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await hireFunding.completeFromIntent(hirePayment(application));
    await jobs.start(provider, posted.id);
    await jobs.complete(client, posted.id);
    await flush();

    // Between attempts, the provider withdraws the whole payout by request.
    await world.wallet.requestWithdrawal(provider, {
      amount: BUDGET,
      destination: 'GCash 0917',
    });
    fakeStripe.refuse(null);
    await world.payouts.sweep(new Date(Date.now() + 2 * 60 * 60 * 1000));

    expect(fakeStripe.transfers).toEqual([]);
    expect(await escrow.findByJob(posted.id)).toMatchObject({
      transfer_status: 'abandoned',
    });
    expect(
      db
        .rows('wallet_transactions')
        .filter((t) => t.kind === 'connect_transfer' && t.status !== 'failed'),
    ).toEqual([]);
  });

  it('sends a dispute resolved for the provider on to Stripe as well', async () => {
    const world = buildWorld({ payable: true });
    const { db, jobs, applications, hireFunding, disputes, fakeStripe } = world;
    const posted = (await postJob(world)) as Record<string, any>;
    const application = (await applications.apply(
      provider,
      posted.id,
      {},
    )) as Record<string, any>;
    await hireFunding.completeFromIntent(hirePayment(application));
    await jobs.start(provider, posted.id);
    await disputes.raise(client, posted.id, { reason: 'Hindi natapos' });

    await disputes.resolve(admin, db.rows('disputes')[0].id, {
      resolution: 'released_to_provider',
    });
    await flush();

    expect(fakeStripe.transfers).toHaveLength(1);
  });
});
