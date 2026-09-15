import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * "Have we already handled this Stripe event?", shared by both webhook
 * endpoints — the platform one (payments) and the Connect one (payout
 * accounts). Event ids are unique across both, so one table serves.
 *
 * Callers record an event **after** its work, never before: a crash in between
 * then means Stripe redelivers and the work is redone, which every handler is
 * written to survive. Recording first would make the opposite failure — work
 * never done, event marked handled — permanent and silent (BACKEND_SCHEMA.md
 * §21).
 */
@Injectable()
export class StripeEventsService {
  constructor(private readonly supabase: SupabaseService) {}

  async alreadyProcessed(eventId: string): Promise<boolean> {
    const { data } = await this.supabase.admin
      .from('stripe_events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle();
    return data !== null;
  }

  async recordProcessed(event: Pick<Stripe.Event, 'id' | 'type'>) {
    await this.supabase.admin
      .from('stripe_events')
      .upsert({ id: event.id, type: event.type }, { onConflict: 'id' });
  }
}
