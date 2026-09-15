import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StripeService } from './stripe.service';
import type { Profile } from '../common/types';

/**
 * The user's Stripe Customer, created on first payment and remembered on
 * `profiles.stripe_customer_id`. Shared by wallet top-ups and card-at-hire, so
 * a homeowner has one Customer whichever way they pay — which is what lets
 * PaymentSheet offer a saved card the second time instead of asking again.
 */
@Injectable()
export class StripeCustomersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly stripeService: StripeService,
  ) {}

  async customerFor(user: Profile): Promise<string> {
    const { data: profile } = await this.supabase.admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.stripe_customer_id)
      return profile.stripe_customer_id as string;

    const { data: authData } = await this.supabase.admin.auth.admin.getUserById(
      user.id,
    );

    const customer = await this.stripeService.stripe.customers.create({
      email: authData?.user?.email ?? undefined,
      name: user.full_name,
      metadata: { profile_id: user.id },
    });

    const { error } = await this.supabase.admin
      .from('profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', user.id);
    if (error) throw new BadRequestException(error.message);

    return customer.id;
  }
}
