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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { ThrottlePayments } from '../../common/throttle';
import {
  appendRedirectParams,
  isAllowedAppRedirect,
} from '../../auth/google-redirect';
import { StripeService } from '../stripe.service';
import { publicOrigin } from '../public-origin';
import { ConnectAccountsService } from './connect-accounts.service';
import { ConnectOnboardingLinkDto } from './connect.dto';
import type { Profile } from '../../common/types';

/**
 * Provider payout accounts on Stripe Connect Express (BACKEND_SCHEMA.md §29).
 *
 * Authenticated routes are provider-only and declared per handler, because
 * this controller also carries three routes with no JWT at all: the two
 * browser bounces back into the app, and Stripe's Connect webhook.
 */
@Controller('payments/connect')
export class ConnectController {
  private readonly logger = new Logger(ConnectController.name);

  constructor(
    private readonly accounts: ConnectAccountsService,
    private readonly stripe: StripeService,
  ) {}

  /** Where the provider stands: not_started | onboarding | restricted | active. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @Roles('provider')
  status(@CurrentUser() user: Profile) {
    return this.accounts.statusFor(user);
  }

  /**
   * Creates the provider's Express account if needed and returns a
   * single-use Stripe onboarding URL for the app to open in a browser.
   * Rate-limited like every route that opens something on Stripe.
   */
  @Post('onboarding-link')
  @HttpCode(200)
  @ThrottlePayments()
  @UseGuards(JwtAuthGuard)
  @Roles('provider')
  onboardingLink(
    @CurrentUser() user: Profile,
    @Body() dto: ConnectOnboardingLinkDto,
    @Req() req: Request,
  ) {
    return this.accounts.onboardingLink(
      user,
      dto.app_redirect,
      publicOrigin(req),
    );
  }

  /** Re-reads the account from Stripe; the app calls this on returning from onboarding. */
  @Post('sync')
  @HttpCode(200)
  @ThrottlePayments()
  @UseGuards(JwtAuthGuard)
  @Roles('provider')
  sync(@CurrentUser() user: Profile) {
    return this.accounts.sync(user);
  }

  /** A one-time login link to the provider's Stripe Express dashboard. */
  @Post('dashboard-link')
  @HttpCode(200)
  @ThrottlePayments()
  @UseGuards(JwtAuthGuard)
  @Roles('provider')
  dashboardLink(@CurrentUser() user: Profile) {
    return this.accounts.dashboardLink(user);
  }

  /**
   * Stripe's `return_url`: the provider left onboarding, finished or not.
   * Bounces the browser into the app with `connect=return`; the app then
   * syncs, because arriving here says nothing about whether they finished.
   */
  @Get('return')
  onboardingReturn(
    @Query('app_redirect') appRedirect: string,
    @Res() res: Response,
  ) {
    return this.bounce(appRedirect, 'return', res);
  }

  /**
   * Stripe's `refresh_url`: the link expired or was already used. A new one
   * cannot be minted here — this request carries no session — so the app is
   * told `connect=refresh` and asks for a fresh link itself.
   */
  @Get('refresh')
  onboardingRefresh(
    @Query('app_redirect') appRedirect: string,
    @Res() res: Response,
  ) {
    return this.bounce(appRedirect, 'refresh', res);
  }

  /**
   * The Connect webhook — a separate Stripe endpoint from `/payments/webhook`,
   * created with "Events on Connected accounts" and holding its own signing
   * secret. Authenticated by that signature over the raw body, like the
   * platform one; exempt from the rate limit for the same reasons.
   */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) throw new BadRequestException('Missing stripe-signature');
    if (!req.rawBody) throw new BadRequestException('Raw body unavailable');

    // Read outside the try: an unconfigured secret is a 503 to surface, not
    // a signature failure to disguise as a 400.
    const secret = this.stripe.connectWebhookSecret;
    let event;
    try {
      event = this.stripe.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        secret,
      );
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
    }
    await this.accounts.handleConnectEvent(event);
    this.logger.log(`Handled Connect event ${event.type} (${event.id})`);
    return { received: true };
  }

  private bounce(
    appRedirect: string,
    leg: 'return' | 'refresh',
    res: Response,
  ) {
    // Re-checked here, not just when the link was made: this endpoint is
    // reachable directly and would otherwise be an open redirect.
    if (!isAllowedAppRedirect(appRedirect)) {
      throw new BadRequestException('app_redirect is not an allowed URI');
    }
    return res.redirect(
      appendRedirectParams(appRedirect, new URLSearchParams({ connect: leg })),
    );
  }
}
