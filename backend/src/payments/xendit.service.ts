import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

const API = 'https://api.xendit.co';

/** Methods offered at checkout: e-wallets, card and online banking. */
export const XENDIT_PAYMENT_METHODS = [
  'GCASH',
  'PAYMAYA',
  'GRABPAY',
  'CREDIT_CARD',
  'DD_BPI',
  'DD_UBP',
] as const;

/** Prefixes of the invoice `external_id`, which says what a payment is for. */
export const HIRE_PREFIX = 'hire';
export const PRICE_CHANGE_PREFIX = 'pchg';

export interface XenditCheckout {
  id: string;
  url: string;
}

/** The parts of a paid-invoice callback the hire and price-change flows need. */
export interface XenditPaidInvoice {
  invoiceId: string;
  externalId: string;
  /** What the payment is for, from the external id: `hire` or `pchg`. */
  purpose: string;
  /** The application id (hire) or change request id (price change). */
  subjectId: string;
  amountCentavos: number;
  currency: string;
  /** The channel the payer used, e.g. GCASH, PAYMAYA, CREDIT_CARD, DD_BPI. */
  channel: string;
}

export interface XenditPayoutResult {
  id: string;
  status: string;
}

/** A payout's state, from a payout callback or a lookup by reference. */
export interface XenditPayoutUpdate {
  payoutId: string;
  /** Our ledger row id, sent as `reference_id`. */
  referenceId: string;
  /** ACCEPTED, REQUESTED, SUCCEEDED, FAILED, CANCELLED, REVERSED or EXPIRED. */
  status: string;
  failureCode: string | null;
}

/** Final payout statuses: anything else is still on its way. */
export const PAYOUT_SUCCEEDED = new Set(['SUCCEEDED']);
export const PAYOUT_FAILED = new Set([
  'FAILED',
  'CANCELLED',
  'REVERSED',
  'EXPIRED',
  'COMPLIANCE_REJECTED',
]);

/**
 * A Xendit API error with its HTTP status, so a caller can tell a definite
 * refusal from an outcome it cannot know (timeout, 5xx, rate limit).
 */
export class XenditRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Xendit's `error_code`, e.g. DUPLICATE_ERROR, when the body had one. */
    readonly code: string | null = null,
  ) {
    super(message);
  }

  /**
   * Xendit says it already has a request with this reference or key: the
   * first attempt may have been accepted, so the outcome is unknown.
   */
  get duplicate(): boolean {
    return (
      /DUPLICATE/i.test(this.code ?? '') || /duplicate/i.test(this.message)
    );
  }

  /** Xendit looked at the request and refused it: retrying cannot succeed. */
  get definite(): boolean {
    return (
      !this.duplicate &&
      this.status >= 400 &&
      this.status < 500 &&
      this.status !== 408 &&
      this.status !== 409 &&
      this.status !== 429
    );
  }
}

/**
 * Xendit, in **test mode** (keys starting `xnd_development_`): this prototype
 * takes GCash, Maya, GrabPay, card and online-banking payments through
 * Xendit's hosted invoice page, and sends provider payouts to GCash, Maya or
 * a bank through Xendit's sandbox Payouts API. No real money moves.
 *
 * Configured by XENDIT_SECRET_KEY and XENDIT_CALLBACK_TOKEN (the webhook
 * verification token from the Xendit dashboard).
 */
@Injectable()
export class XenditService {
  private readonly logger = new Logger(XenditService.name);
  private readonly secretKey = process.env.XENDIT_SECRET_KEY ?? '';
  private readonly callbackToken = process.env.XENDIT_CALLBACK_TOKEN ?? '';

  get configured(): boolean {
    return this.secretKey.length > 0;
  }

  private assertTestMode() {
    if (!this.configured)
      throw new ServiceUnavailableException('Payments are not configured');
    // A prototype must never take or send real money.
    if (!this.secretKey.startsWith('xnd_development_'))
      throw new ServiceUnavailableException(
        'Only Xendit test (development) keys are allowed',
      );
  }

  private async post<T>(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ ok: boolean; status: number; data: T & { message?: string } }> {
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as T & {
      message?: string;
    };
    return { ok: response.ok, status: response.status, data };
  }

  /** A hosted invoice for one payment; `externalId` says what it is for. */
  async createCheckout(input: {
    externalId: string;
    amount: number;
    description: string;
    successUrl: string;
    failureUrl: string;
  }): Promise<XenditCheckout> {
    this.assertTestMode();
    const { ok, status, data } = await this.post<{
      id: string;
      invoice_url: string;
    }>('/v2/invoices', {
      external_id: input.externalId,
      amount: input.amount,
      currency: 'PHP',
      description: input.description.slice(0, 255),
      payment_methods: XENDIT_PAYMENT_METHODS,
      invoice_duration: 30 * 60,
      success_redirect_url: input.successUrl,
      failure_redirect_url: input.failureUrl,
    });
    if (!ok || !data.invoice_url) {
      this.logger.error(
        `Xendit invoice failed (${status}): ${data.message ?? 'no detail'}`,
      );
      throw new ServiceUnavailableException(
        'Payments are unavailable right now',
      );
    }
    return { id: data.id, url: data.invoice_url };
  }

  /**
   * Sends a payout (sandbox) to a GCash, Maya or bank account. Idempotent on
   * `referenceId`: a retry with the same reference cannot pay twice.
   */
  async sendPayout(input: {
    referenceId: string;
    channelCode: string;
    accountName: string;
    accountNumber: string;
    amount: number;
    description: string;
  }): Promise<XenditPayoutResult> {
    this.assertTestMode();
    const { ok, status, data } = await this.post<
      XenditPayoutResult & { error_code?: string }
    >(
      '/v2/payouts',
      {
        reference_id: input.referenceId,
        channel_code: input.channelCode,
        channel_properties: {
          account_holder_name: input.accountName,
          account_number: input.accountNumber,
        },
        amount: input.amount,
        currency: 'PHP',
        description: input.description.slice(0, 100),
      },
      { 'idempotency-key': input.referenceId },
    );
    if (!ok || !data.id) {
      throw new XenditRequestError(
        `Xendit payout failed (${status}): ${data.message ?? 'no detail'}`,
        status,
        data.error_code ?? null,
      );
    }
    return { id: data.id, status: data.status };
  }

  /**
   * Confirms a paid-invoice callback against Xendit itself: the invoice must
   * exist, be PAID or SETTLED, and carry the same external id and amount. The
   * callback token proves the sender knows the token; this proves the money.
   * Throws when Xendit cannot be asked, so the callback is retried.
   */
  async confirmPaidInvoice(paid: XenditPaidInvoice): Promise<boolean> {
    this.assertTestMode();
    const response = await fetch(
      `${API}/v2/invoices/${encodeURIComponent(paid.invoiceId)}`,
      {
        headers: {
          authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        },
      },
    );
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new XenditRequestError(
        `Xendit invoice lookup failed (${response.status})`,
        response.status,
      );
    }
    const invoice = (await response.json()) as {
      external_id?: string;
      status?: string;
      paid_amount?: number;
      amount?: number;
    };
    const amount = Number(invoice.paid_amount ?? invoice.amount ?? NaN);
    return (
      invoice.external_id === paid.externalId &&
      (invoice.status === 'PAID' || invoice.status === 'SETTLED') &&
      Math.round(amount * 100) === paid.amountCentavos
    );
  }

  /**
   * The payout Xendit holds for one of our references, or null when it has
   * none (the request never reached it). Throws when Xendit cannot be asked.
   */
  async findPayoutByReference(
    referenceId: string,
  ): Promise<XenditPayoutUpdate | null> {
    this.assertTestMode();
    const response = await fetch(
      `${API}/v2/payouts?reference_id=${encodeURIComponent(referenceId)}`,
      {
        headers: {
          authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
        },
      },
    );
    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new XenditRequestError(
        `Xendit payout lookup failed (${response.status})`,
        response.status,
      );
    }
    // A plain array, or the `{ data: [...] }` envelope Xendit's SDK shows.
    const envelope = data as { data?: unknown } | null;
    const rows = (
      Array.isArray(data)
        ? data
        : Array.isArray(envelope?.data)
          ? envelope.data
          : []
    ) as unknown[];
    const found = rows
      .map((row) => this.payoutUpdate(row))
      .filter((row): row is XenditPayoutUpdate => row !== null);
    return found.find((row) => row.referenceId === referenceId) ?? null;
  }

  /**
   * The payout in a payout callback body (`{ event, data: {...} }`) or in a
   * lookup row, or null for anything else.
   */
  payoutUpdate(body: unknown): XenditPayoutUpdate | null {
    type PayoutBody = {
      id?: unknown;
      reference_id?: unknown;
      status?: unknown;
      failure_code?: unknown;
    };
    const outer = body as (PayoutBody & { data?: PayoutBody }) | null;
    const b: PayoutBody | null = outer?.data ?? outer;
    if (
      typeof b?.id !== 'string' ||
      typeof b.reference_id !== 'string' ||
      typeof b.status !== 'string'
    )
      return null;
    return {
      payoutId: b.id,
      referenceId: b.reference_id,
      status: b.status.toUpperCase(),
      failureCode: typeof b.failure_code === 'string' ? b.failure_code : null,
    };
  }

  /** Checks the `x-callback-token` header against the dashboard's token. */
  verifyCallback(token: string | undefined): boolean {
    if (!this.callbackToken || !token) return false;
    const a = Buffer.from(this.callbackToken);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** The paid invoice in a callback body, or null for anything else. */
  paidInvoice(body: unknown): XenditPaidInvoice | null {
    const b = body as {
      id?: string;
      external_id?: string;
      status?: string;
      paid_amount?: number;
      amount?: number;
      currency?: string;
      payment_channel?: string;
      payment_method?: string;
    };
    if (!b?.id || !b.external_id) return null;
    if (b.status !== 'PAID' && b.status !== 'SETTLED') return null;
    const [purpose, subjectId] = b.external_id.split('_');
    if (!purpose || !subjectId) return null;
    const amount = Number(b.paid_amount ?? b.amount ?? 0);
    return {
      invoiceId: b.id,
      externalId: b.external_id,
      purpose,
      subjectId,
      amountCentavos: Math.round(amount * 100),
      currency: (b.currency ?? 'PHP').toLowerCase(),
      channel: b.payment_channel ?? b.payment_method ?? 'payment',
    };
  }
}
