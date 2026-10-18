import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ThrottlePayments } from '../common/throttle';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { publicOrigin } from './public-origin';
import {
  CreateHireCheckoutDto,
  CreatePriceChangeCheckoutDto,
} from './dto/payments.dto';
import { HireFundingService } from './hire-funding.service';
import { EscrowService } from '../escrow/escrow.service';
import { XenditService } from './xendit.service';
import { Roles } from '../auth/roles.decorator';
import {
  appendRedirectParams,
  isAllowedAppRedirect,
  isAppSchemeRedirect,
  renderAppRedirectPage,
} from '../auth/google-redirect';
import type { Profile } from '../common/types';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
    private readonly hireFunding: HireFundingService,
    private readonly xendit: XenditService,
    private readonly escrow: EscrowService,
  ) {}

  /** Publishable key, so the app doesn't have to ship a build per environment. */
  @Post('config')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  config() {
    return { publishable_key: this.stripe.publishableKey };
  }

  /**
   * Pay-at-hire: opens a checkout for the job's full price, to hire the
   * provider behind `application_id` — Xendit test mode (GCash, Maya, card,
   * online banking) when configured, Stripe card Checkout otherwise. Nothing
   * is hired here: the webhook holds the payment in escrow and accepts the
   * application once the payment is confirmed. The app polls the application
   * after the browser closes. Wallet top-ups were retired in migration 0056.
   */
  @Post('hire-checkout-session')
  @HttpCode(200)
  @ThrottlePayments()
  @UseGuards(JwtAuthGuard)
  @Roles('client')
  hireCheckoutSession(
    @CurrentUser() user: Profile,
    @Body() dto: CreateHireCheckoutDto,
    @Req() req: Request,
  ) {
    return this.hireFunding.createCheckout(user, dto, publicOrigin(req));
  }

  /**
   * Pays the difference on an agreed price increase (migration 0057): a
   * Xendit test-mode checkout. The webhook applies the new price.
   */
  @Post('price-change-checkout-session')
  @HttpCode(200)
  @ThrottlePayments()
  @UseGuards(JwtAuthGuard)
  @Roles('client')
  priceChangeCheckoutSession(
    @CurrentUser() user: Profile,
    @Body() dto: CreatePriceChangeCheckoutDto,
    @Req() req: Request,
  ) {
    return this.hireFunding.createPriceChangeCheckout(
      user,
      dto.change_request_id,
      dto.app_redirect,
      publicOrigin(req),
    );
  }

  /**
   * Where Stripe sends the browser when Checkout finishes, and the only reason
   * this endpoint exists: `success_url` must be http(s), so the app's
   * `taskbuddy://` deep link cannot be given to Stripe directly. This bounces
   * to it.
   *
   * Unauthenticated because it is a plain browser navigation carrying no
   * session — and it needs none. It reveals nothing and changes nothing; the
   * wallet is credited by the webhook regardless of whether this is ever hit.
   */
  @Get('return')
  paymentReturn(
    @Query('app_redirect') appRedirect: string,
    @Query('status') status: string,
    @Query('flow') flow: string | undefined,
    @Res() res: Response,
  ) {
    // Same allowlist the session creation checked. Re-checked here because this
    // endpoint is reachable directly: without it, /payments/return is an open
    // redirect that lends this domain's reputation to a phishing link.
    if (!isAllowedAppRedirect(appRedirect)) {
      throw new BadRequestException('app_redirect is not an allowed URI');
    }

    // `flow` names the query parameter the app listens for: `topup=` for the
    // wallet's Add Money (the default, so existing links keep working) and
    // `hire=` for card-at-hire. It decides which screen the user lands on,
    // nothing more — the webhook decides whether money arrived.
    const params = new URLSearchParams({
      [flow === 'hire' ? 'hire' : 'topup']:
        status === 'success' ? 'success' : 'cancelled',
    });
    const deepLink = appendRedirectParams(appRedirect, params);

    // Chrome drops a 302 into `taskbuddy://`, leaving the tab spinning while
    // the app waits for a return that never lands — the same failure Google
    // sign-in had. App schemes get a page that asks for the link instead.
    if (!isAppSchemeRedirect(deepLink)) return res.redirect(deepLink);
    return res.type('html').send(renderAppRedirectPage(deepLink));
  }

  /**
   * Xendit's invoice callback (test mode). Authenticated by the
   * `x-callback-token` header, which must equal the dashboard's verification
   * token. Only a PAID/SETTLED invoice acts; anything else is acknowledged.
   */
  @Post('xendit/webhook')
  @HttpCode(200)
  @SkipThrottle()
  async xenditWebhook(
    @Req() req: Request,
    @Headers('x-callback-token') token: string | undefined,
  ) {
    if (!this.xendit.verifyCallback(token)) {
      throw new BadRequestException('Invalid Xendit callback token');
    }
    const paid = this.xendit.paidInvoice(req.body);
    if (paid) await this.hireFunding.completeFromXendit(paid);
    return { received: true };
  }

  /**
   * Xendit's payout callback (test mode): the final result of a provider
   * payout. Same token check as the invoice callback. Configure it in the
   * Xendit dashboard as the Payouts callback URL.
   */
  @Post('xendit/payout-webhook')
  @HttpCode(200)
  @SkipThrottle()
  async xenditPayoutWebhook(
    @Req() req: Request,
    @Headers('x-callback-token') token: string | undefined,
  ) {
    if (!this.xendit.verifyCallback(token)) {
      throw new BadRequestException('Invalid Xendit callback token');
    }
    const update = this.xendit.payoutUpdate(req.body);
    if (update) await this.escrow.applyPayoutResult(update);
    return { received: true };
  }

  /**
   * Stripe's webhook. Deliberately unauthenticated in the JWT sense — Stripe
   * has no session — and authenticated instead by the signature over the raw
   * request body, which is why `rawBody: true` is set in main.ts. A parsed and
   * re-serialised body will not match the signature.
   *
   * Returns 200 on anything already handled or safely ignorable, and a non-2xx
   * only when a retry could still help: Stripe backs off and re-delivers for up
   * to three days, and every retry of an event we cannot process is noise.
   */
  @Post('webhook')
  @HttpCode(200)
  // Exempt from the rate limit. The caller is Stripe, already authenticated by
  // the signature below, and it retries for three days — throttling it would
  // only delay the credit the payer is waiting for. It also arrives from
  // Stripe's own address range, so a burst of legitimate events (a batch
  // redelivery after an outage) would otherwise all count against one IP.
  @SkipThrottle()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) throw new BadRequestException('Missing stripe-signature');
    if (!req.rawBody) {
      // Would mean the raw-body option regressed; without the exact bytes the
      // signature cannot be verified and the event must not be trusted.
      throw new BadRequestException('Raw body unavailable');
    }

    const event = this.payments.constructEvent(req.rawBody, signature);
    await this.payments.handleEvent(event);
    this.logger.log(`Handled Stripe event ${event.type} (${event.id})`);
    return { received: true };
  }
}
