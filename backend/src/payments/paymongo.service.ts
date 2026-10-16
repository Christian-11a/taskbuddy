import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.paymongo.com/v1';

/** Methods offered at checkout: e-wallets, card and online banking. */
export const PAYMONGO_METHODS = ['gcash', 'paymaya', 'card', 'dob'] as const;

export interface PaymongoCheckout {
  id: string;
  url: string;
}

/** The parts of a `checkout_session.payment.paid` event the hire needs. */
export interface PaymongoPaidSession {
  sessionId: string;
  paymentId: string;
  amountCentavos: number;
  currency: string;
  method: string;
  metadata: Record<string, string>;
}

/**
 * PayMongo, in **test mode**: this prototype takes GCash, Maya, card and
 * online-banking payments through PayMongo's sandbox, so the checkout looks
 * real and no money moves. Configured by PAYMONGO_SECRET_KEY (sk_test_…)
 * and PAYMONGO_WEBHOOK_SECRET (whsk_…).
 */
@Injectable()
export class PaymongoService {
  private readonly logger = new Logger(PaymongoService.name);
  private readonly secretKey = process.env.PAYMONGO_SECRET_KEY ?? '';
  private readonly webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET ?? '';

  get configured(): boolean {
    return this.secretKey.length > 0;
  }

  async createCheckout(input: {
    amountCentavos: number;
    name: string;
    description: string;
    reference: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<PaymongoCheckout> {
    if (!this.configured)
      throw new ServiceUnavailableException('Payments are not configured');
    if (this.secretKey.startsWith('sk_live_')) {
      // A prototype must never take real money.
      throw new ServiceUnavailableException(
        'Only PayMongo test keys are allowed',
      );
    }
    const response = await fetch(`${API}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                currency: 'PHP',
                amount: input.amountCentavos,
                name: input.name,
                quantity: 1,
              },
            ],
            payment_method_types: PAYMONGO_METHODS,
            description: input.description,
            reference_number: input.reference,
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            metadata: input.metadata,
            send_email_receipt: false,
            show_line_items: true,
          },
        },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: { id: string; attributes: { checkout_url: string } };
      errors?: { detail?: string }[];
    };
    if (!response.ok || !body.data) {
      this.logger.error(
        `PayMongo checkout failed (${response.status}): ${body.errors?.[0]?.detail ?? 'no detail'}`,
      );
      throw new ServiceUnavailableException(
        'Payments are unavailable right now',
      );
    }
    return { id: body.data.id, url: body.data.attributes.checkout_url };
  }

  /**
   * Checks the `Paymongo-Signature` header (`t=…,te=…,li=…`): an HMAC-SHA256
   * of `${t}.${rawBody}` with the webhook secret, in `te` for test mode.
   */
  verifySignature(rawBody: Buffer, header: string | undefined): boolean {
    if (!this.webhookSecret || !header) return false;
    const parts = Object.fromEntries(
      header.split(',').map((p) => p.split('=') as [string, string]),
    );
    const given = parts.te || parts.li;
    if (!parts.t || !given) return false;
    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${parts.t}.${rawBody.toString('utf8')}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** The paid checkout in a webhook event, or null for any other event. */
  paidSession(event: unknown): PaymongoPaidSession | null {
    const attrs = (event as { data?: { attributes?: Record<string, any> } })
      ?.data?.attributes;
    if (attrs?.type !== 'checkout_session.payment.paid') return null;
    const session = attrs.data as {
      id: string;
      attributes: {
        metadata?: Record<string, string>;
        payments?: {
          id: string;
          attributes: {
            amount: number;
            currency: string;
            status: string;
            source?: { type?: string };
          };
        }[];
      };
    };
    const payment = session?.attributes?.payments?.find(
      (p) => p.attributes.status === 'paid',
    );
    if (!session?.id || !payment) return null;
    return {
      sessionId: session.id,
      paymentId: payment.id,
      amountCentavos: payment.attributes.amount,
      currency: payment.attributes.currency.toLowerCase(),
      method: payment.attributes.source?.type ?? 'payment',
      metadata: session.attributes.metadata ?? {},
    };
  }
}
