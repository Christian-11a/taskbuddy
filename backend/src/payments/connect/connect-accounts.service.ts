import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Stripe from 'stripe';
import { SupabaseService } from '../../supabase/supabase.service';
import { StripeService } from '../stripe.service';
import { StripeEventsService } from '../stripe-events.service';
import { isAllowedAppRedirect } from '../../auth/google-redirect';
import type { Profile } from '../../common/types';

/**
 * Where a provider stands with Stripe, in the four states the app draws:
 *
 * - `not_started` — no Connect account yet.
 * - `onboarding`  — an account exists but the provider has not finished
 *                   Stripe's form (`details_submitted` is false).
 * - `restricted`  — they finished it, but Stripe still wants something or has
 *                   paused them (`requirements_due` / `disabled_reason` say
 *                   what); no transfer can reach them yet.
 * - `active`      — transfers and payouts both enabled. Card-funded payouts
 *                   are sent to their Stripe account from now on.
 */
export type ConnectState =
  'not_started' | 'onboarding' | 'restricted' | 'active';

export interface PayoutAccountRow {
  profile_id: string;
  stripe_account_id: string;
  country: string;
  details_submitted: boolean;
  payouts_enabled: boolean;
  transfers_active: boolean;
  requirements_due: string[];
  disabled_reason: string | null;
  stripe_synced_at: string | null;
}

/**
 * What the app is shown. The Stripe account id is deliberately absent: the
 * provider never needs it, and the less of it that travels the less there is
 * to leak into a screenshot or a log.
 */
export interface ConnectStatus {
  state: ConnectState;
  country: string | null;
  details_submitted: boolean;
  payouts_enabled: boolean;
  transfers_active: boolean;
  requirements_due: string[];
  disabled_reason: string | null;
}

const NOT_STARTED: ConnectStatus = {
  state: 'not_started',
  country: null,
  details_submitted: false,
  payouts_enabled: false,
  transfers_active: false,
  requirements_due: [],
  disabled_reason: null,
};

/** Whether a payout account can receive a transfer right now. */
export function isPayable(
  row: Pick<PayoutAccountRow, 'transfers_active' | 'payouts_enabled'> | null,
): boolean {
  return !!row && row.transfers_active && row.payouts_enabled;
}

export function toConnectStatus(row: PayoutAccountRow | null): ConnectStatus {
  if (!row) return NOT_STARTED;
  const state: ConnectState = isPayable(row)
    ? 'active'
    : row.details_submitted
      ? 'restricted'
      : 'onboarding';
  return {
    state,
    country: row.country,
    details_submitted: row.details_submitted,
    payouts_enabled: row.payouts_enabled,
    transfers_active: row.transfers_active,
    requirements_due: row.requirements_due ?? [],
    disabled_reason: row.disabled_reason,
  };
}

type PayoutFields = Pick<
  PayoutAccountRow,
  | 'details_submitted'
  | 'payouts_enabled'
  | 'transfers_active'
  | 'requirements_due'
  | 'disabled_reason'
  | 'stripe_synced_at'
>;

/** The columns an account's Stripe state maps to (BACKEND_SCHEMA.md §29.1). */
export function payoutFieldsFrom(account: Stripe.Account): PayoutFields {
  const due = new Set([
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ]);
  return {
    details_submitted: account.details_submitted === true,
    payouts_enabled: account.payouts_enabled === true,
    transfers_active: account.capabilities?.transfers === 'active',
    requirements_due: [...due],
    disabled_reason: account.requirements?.disabled_reason ?? null,
    stripe_synced_at: new Date().toISOString(),
  };
}

/**
 * Stripe Connect Express accounts for providers — the payout rail
 * (BACKEND_SCHEMA.md §29). Onboarding happens on Stripe's hosted pages; this
 * service creates the account, hands out the links, and keeps
 * `provider_payout_accounts` in step with what Stripe reports.
 *
 * Nothing here moves money. Whether a card-funded payout is sent to the
 * account is ConnectPayoutsService's question, and it asks `isPayable`.
 */
@Injectable()
export class ConnectAccountsService {
  private readonly logger = new Logger(ConnectAccountsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly stripeService: StripeService,
    private readonly events: StripeEventsService,
  ) {}

  async statusFor(user: Profile): Promise<ConnectStatus> {
    return toConnectStatus(await this.findByProfile(user.id));
  }

  async findByProfile(profileId: string): Promise<PayoutAccountRow | null> {
    const { data, error } = await this.supabase.admin
      .from('provider_payout_accounts')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return (data as PayoutAccountRow | null) ?? null;
  }

  /**
   * A link to Stripe's hosted onboarding for this provider, creating their
   * Express account first if they have none.
   *
   * Both URLs Stripe is given point back at this API, because Stripe only
   * accepts http(s) and the app lives behind a `taskbuddy://` deep link —
   * the same bounce `/payments/return` does for Checkout. Reaching `return`
   * does NOT mean onboarding finished (Stripe sends people there on "save
   * for later" too), which is why the app syncs on arrival rather than
   * trusting the redirect.
   */
  async onboardingLink(user: Profile, appRedirect: string, returnBase: string) {
    // A security decision, not formatting: /payments/connect/return will send
    // a browser to whatever this is, so an unvetted value is an open redirect.
    if (!isAllowedAppRedirect(appRedirect)) {
      throw new BadRequestException('app_redirect is not an allowed URI');
    }
    const account = await this.ensureAccount(user);
    const bounce = (leg: 'return' | 'refresh') =>
      `${returnBase}/payments/connect/${leg}` +
      `?app_redirect=${encodeURIComponent(appRedirect)}`;

    const link = await this.stripeService.stripe.accountLinks.create({
      account: account.stripe_account_id,
      type: 'account_onboarding',
      collection_options: { fields: 'currently_due' },
      return_url: bounce('return'),
      refresh_url: bounce('refresh'),
    });
    return { url: link.url, expires_at: link.expires_at };
  }

  /**
   * A one-time link into the provider's own Stripe Express dashboard, where
   * they manage their bank account and see their payouts. Express accounts
   * cannot be sent an `account_update` link — the dashboard is the Stripe-
   * sanctioned place for changes after onboarding.
   */
  async dashboardLink(user: Profile) {
    const row = await this.findByProfile(user.id);
    if (!row) throw new NotFoundException('Set up payouts first');
    if (!row.details_submitted) {
      throw new BadRequestException(
        'Finish setting up payouts before opening the Stripe dashboard',
      );
    }
    const link = await this.stripeService.stripe.accounts.createLoginLink(
      row.stripe_account_id,
    );
    return { url: link.url };
  }

  /** Re-reads the provider's account from Stripe — what the app calls on return. */
  async sync(user: Profile): Promise<ConnectStatus> {
    const row = await this.findByProfile(user.id);
    if (!row) return NOT_STARTED;
    const account = await this.stripeService.stripe.accounts.retrieve(
      row.stripe_account_id,
    );
    return toConnectStatus(await this.apply(account));
  }

  /**
   * The Connect webhook. `account.updated` and `capability.updated` both mean
   * "something about this account changed" — and Connect events can arrive
   * out of order, so rather than trusting the snapshot in whichever event came
   * last, every one of them re-reads the account and stores what Stripe says
   * *now*. That makes the handler an assignment: redelivered or reordered, it
   * converges on the same row.
   */
  async handleConnectEvent(event: Stripe.Event): Promise<void> {
    if (await this.events.alreadyProcessed(event.id)) return;

    const accountId = accountIdOf(event);
    if (accountId) {
      const account =
        await this.stripeService.stripe.accounts.retrieve(accountId);
      const applied = await this.apply(account);
      if (!applied) {
        // An account this platform does not track — created in the Dashboard,
        // or a row lost to a failed insert. Nothing to update; logged so the
        // second case is visible.
        this.logger.warn(
          `Connect event ${event.type} for untracked account ${accountId}`,
        );
      }
    } else {
      this.logger.debug(`Ignoring Connect event type ${event.type}`);
    }

    await this.events.recordProcessed(event);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * The provider's payout account, created on first use.
   *
   * Two taps on "Set up payouts" can both get here before either has stored
   * an account. The idempotency key makes Stripe return the *same* account to
   * both within 24 hours; past that, the insert's primary key is the backstop
   * — the loser deletes the account it just made (nothing can have been paid
   * into a minutes-old account) and uses the winner's.
   */
  private async ensureAccount(user: Profile): Promise<PayoutAccountRow> {
    const existing = await this.findByProfile(user.id);
    if (existing) return existing;

    const { data: providerProfile, error: profileError } =
      await this.supabase.admin
        .from('provider_profiles')
        .select('profile_id')
        .eq('profile_id', user.id)
        .maybeSingle();
    if (profileError) throw new BadRequestException(profileError.message);
    if (!providerProfile) {
      throw new BadRequestException(
        'Set up your provider profile before setting up payouts',
      );
    }

    const { data: authData } = await this.supabase.admin.auth.admin.getUserById(
      user.id,
    );
    const country = this.stripeService.connectCountry;
    const account = await this.stripeService.stripe.accounts.create(
      {
        type: 'express',
        country,
        email: authData?.user?.email ?? undefined,
        business_type: 'individual',
        // Transfers only: TaskBuddy charges the homeowner on its own account
        // and sends the provider their share ("separate charges and
        // transfers"). The provider never takes a card payment themselves.
        capabilities: { transfers: { requested: true } },
        business_profile: {
          product_description: 'Home services booked through TaskBuddy',
        },
        ...(this.stripeService.connectServiceAgreement === 'recipient'
          ? { tos_acceptance: { service_agreement: 'recipient' as const } }
          : {}),
        metadata: { profile_id: user.id },
      },
      { idempotencyKey: `connect-account:${user.id}` },
    );

    const { data, error } = await this.supabase.admin
      .from('provider_payout_accounts')
      .insert({
        profile_id: user.id,
        stripe_account_id: account.id,
        country: (account.country ?? country).toUpperCase(),
        ...payoutFieldsFrom(account),
      })
      .select('*')
      .single();

    if (error?.code === '23505') {
      const winner = await this.findByProfile(user.id);
      if (winner && winner.stripe_account_id !== account.id) {
        await this.stripeService.stripe.accounts
          .del(account.id)
          .catch((err: Error) =>
            this.logger.error(
              `Could not delete duplicate Connect account ${account.id}: ${err.message}`,
            ),
          );
      }
      if (winner) return winner;
    }
    if (error) throw new BadRequestException(error.message);
    return data as PayoutAccountRow;
  }

  /** Stores what Stripe says about an account. Null if we do not track it. */
  private async apply(
    account: Stripe.Account,
  ): Promise<PayoutAccountRow | null> {
    const { data, error } = await this.supabase.admin
      .from('provider_payout_accounts')
      .update(payoutFieldsFrom(account))
      .eq('stripe_account_id', account.id)
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return (data as PayoutAccountRow | null) ?? null;
  }
}

/**
 * The connected account an event is about. For events delivered to a Connect
 * endpoint Stripe sets `event.account`; `account.updated` also carries the
 * account itself as its object, which covers a platform-endpoint delivery.
 */
function accountIdOf(event: Stripe.Event): string | null {
  if (event.type !== 'account.updated' && event.type !== 'capability.updated') {
    return null;
  }
  if (event.account) return event.account;
  const object = event.data.object as { object?: string; id?: string };
  return object.object === 'account' && object.id ? object.id : null;
}
