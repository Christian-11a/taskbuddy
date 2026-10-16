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
    const { ok, status, data } = await this.post<XenditPayoutResult>(
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
      throw new Error(
        `Xendit payout failed (${status}): ${data.message ?? 'no detail'}`,
      );
    }
    return { id: data.id, status: data.status };
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
