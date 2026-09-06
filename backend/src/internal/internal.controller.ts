import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from './cron-secret.guard';
import { PushScheduler } from '../push/push.scheduler';
import { RecommendationsScheduler } from '../recommendations/recommendations.scheduler';

/**
 * The scheduler ticks, exposed over HTTP so Postgres can drive them.
 *
 * Nothing here reimplements a sweep — each handler calls the same tick() the
 * `@Cron` decorator calls, so the two drivers cannot drift. See
 * `common/cron-driver.ts` for which one is live, and migration 0025 for the
 * pg_cron/pg_net side.
 *
 * Not under /admin, deliberately: an admin session must not be able to fire
 * these from a browser, and pg_net has no session to present.
 */
@Controller('internal/tick')
@UseGuards(CronSecretGuard)
export class InternalController {
  constructor(
    private readonly push: PushScheduler,
    private readonly recommendations: RecommendationsScheduler,
  ) {}

  /**
   * 200 means the tick ran to completion, not that every notification was
   * delivered — tick() logs and swallows its own failures exactly as it does
   * on the in-process path, so one bad Expo response cannot stop the sweep.
   */
  @Post('push')
  @HttpCode(200)
  async pushTick() {
    await this.push.tick();
    return { ok: true };
  }

  @Post('recommendations')
  @HttpCode(200)
  async recommendationsTick() {
    await this.recommendations.tick();
    return { ok: true };
  }
}
