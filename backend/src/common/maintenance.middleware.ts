import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

const DEFAULT_MESSAGE =
  'TaskBuddy is undergoing scheduled maintenance. Please try again shortly.';

/**
 * Blocks every request with 503 while `platform_settings.maintenance_mode`
 * is on (migration 0015) — registered globally in AppModule, excluding
 * `/admin/*`, `/auth/*`, and `/health` so an admin can always sign in and
 * always reach the endpoint that turns this back off, and everyone can still
 * authenticate (the block is on *using* the app, not on signing in).
 *
 * Reads the flag on every request rather than caching it: this table changes
 * rarely and a stale cache would mean "turn off maintenance mode" doesn't
 * actually let anyone back in until some TTL expires, which defeats the
 * point of an emergency switch.
 */
@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly supabase: SupabaseService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const { data, error } = await this.supabase.admin
      .from('platform_settings')
      .select('maintenance_mode, maintenance_message')
      .eq('id', true)
      .maybeSingle();

    // Fails open: a broken read here should not take the whole platform down
    // on top of whatever already broke.
    if (error || !data?.maintenance_mode) return next();

    res.status(503).json({
      statusCode: 503,
      message: data.maintenance_message || DEFAULT_MESSAGE,
    });
  }
}
