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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutSessionDto, CreateTopupDto } from './dto/payments.dto';
import {
  appendRedirectParams,
  isAllowedAppRedirect,
} from '../auth/google-redirect';
import type { Profile } from '../common/types';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  /** Publishable key, so the app doesn't have to ship a build per environment. */
  @Post('config')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  config() {
    return { publishable_key: this.stripe.publishableKey };
  }

  /**
   * Opens a wallet top-up. Returns the PaymentSheet parameters; the wallet is
   * credited by the webhook once Stripe confirms the charge, never here.
   */
  @Post('topup')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  topup(@CurrentUser() user: Profile, @Body() dto: CreateTopupDto) {
    return this.payments.createTopupIntent(user, dto);
  }

  /**
   * Opens a wallet top-up on Stripe's hosted Checkout page and returns its URL
   * for the app to open in a browser. Use this where PaymentSheet is not
   * available — notably Expo Go, which cannot load native modules.
   */
  @Post('checkout-session')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  checkoutSession(
    @CurrentUser() user: Profile,
    @Body() dto: CreateCheckoutSessionDto,
    @Req() req: Request,
  ) {
    return this.payments.createCheckoutSession(user, dto, this.originOf(req));
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
    @Res() res: Response,
  ) {
    // Same allowlist the session creation checked. Re-checked here because this
    // endpoint is reachable directly: without it, /payments/return is an open
    // redirect that lends this domain's reputation to a phishing link.
    if (!isAllowedAppRedirect(appRedirect)) {
      throw new BadRequestException('app_redirect is not an allowed URI');
    }

    const params = new URLSearchParams({
      topup: status === 'success' ? 'success' : 'cancelled',
    });
    return res.redirect(appendRedirectParams(appRedirect, params));
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

  /**
   * This API's public origin, for building the URLs Stripe redirects back to.
   *
   * Derived from the request so local development works with no configuration,
   * but `PUBLIC_API_URL` wins where it is set. On Render the request host is
   * right and the protocol is not — TLS terminates at the proxy, so the app
   * sees plain http and would hand Stripe an http:// URL that redirects users
   * out of TLS. `x-forwarded-proto` is what the proxy left behind to say so.
   */
  private originOf(req: Request): string {
    const configured = process.env.PUBLIC_API_URL;
    if (configured) return configured.replace(/\/+$/, '');

    const forwarded = req.headers['x-forwarded-proto'];
    const protocol =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0] ??
      req.protocol;
    return `${protocol}://${req.get('host')}`;
  }
}
