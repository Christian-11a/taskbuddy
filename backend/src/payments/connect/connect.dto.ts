import { IsString } from 'class-validator';

/**
 * Where the browser goes once the provider leaves Stripe's onboarding. Never
 * handed to Stripe — Stripe only accepts http(s) — but to the bounce routes
 * behind it, and checked against the same allowlist as Checkout and Google
 * sign-in before anyone is redirected to it.
 */
export class ConnectOnboardingLinkDto {
  @IsString()
  app_redirect!: string;
}
