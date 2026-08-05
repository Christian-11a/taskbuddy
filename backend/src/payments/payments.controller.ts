import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { CreateTopupDto } from './dto/payments.dto';
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
}
