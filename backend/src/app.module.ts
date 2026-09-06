import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MaintenanceMiddleware } from './common/maintenance.middleware';
import { SupabaseModule } from './supabase/supabase.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ProfilesModule } from './profiles/profiles.module';
import { CategoriesModule } from './categories/categories.module';
import { JobsModule } from './jobs/jobs.module';
import { ApplicationsModule } from './applications/applications.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ProvidersModule } from './providers/providers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { AdminModule } from './admin/admin.module';
import { WalletModule } from './wallet/wallet.module';
import { ChatModule } from './chat/chat.module';
import { CalendarModule } from './calendar/calendar.module';
import { UploadsModule } from './uploads/uploads.module';
import { VerificationsModule } from './verifications/verifications.module';
import { EscrowModule } from './escrow/escrow.module';
import { SettingsModule } from './settings/settings.module';
import { PushModule } from './push/push.module';
import { PaymentsModule } from './payments/payments.module';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    /**
     * Per-IP rate limiting (`docs/backend-handoff-stripe-connect-escrow.md`).
     *
     * One throttler, not several. Every named throttler in this list applies
     * to every route, so a tight `payments` entry here would also be the
     * ceiling on reading a job list; the tighter limits belong on the routes
     * that need them, which is what `common/throttle.ts` does by overriding
     * `default` per handler.
     *
     * 240/minute is a burst ceiling rather than a quota, and it is **per
     * endpoint per IP** — the throttler keys on
     * `sha256(Class-handler-name-ip)`, so there is no aggregate cap across the
     * API. A mobile screen that loads jobs, wallet and an unread count on
     * focus legitimately fires several requests at once, and a person
     * switching tabs does it again a second later; the number has to leave
     * that alone and still refuse a script pointed at one route. Damping the
     * routes that cost something is what the per-route limits in
     * `common/throttle.ts` are for.
     *
     * Storage is in-memory, so the limit is per process. One Render instance
     * makes that the whole platform; a second would double every ceiling.
     * Shared storage is the fix if it comes to that — see BACKEND_SCHEMA.md
     * §28.
     */
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', limit: 240, ttl: 60_000 }],
    }),
    SupabaseModule,
    HealthModule,
    AuthModule,
    ProfilesModule,
    CategoriesModule,
    JobsModule,
    ApplicationsModule,
    ReviewsModule,
    ProvidersModule,
    NotificationsModule,
    RecommendationsModule,
    AdminModule,
    WalletModule,
    ChatModule,
    CalendarModule,
    UploadsModule,
    VerificationsModule,
    EscrowModule,
    SettingsModule,
    PushModule,
    PaymentsModule,
    InternalModule,
  ],
  providers: [
    // Applies the global ceiling everywhere, and whatever a route's own
    // `@Throttle()` narrows it to. `@SkipThrottle()` opts a route out —
    // POST /payments/webhook does, since that caller is Stripe, authenticated
    // by signature, and retrying on failure.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MaintenanceMiddleware)
      .exclude(
        { path: 'admin/(.*)', method: RequestMethod.ALL },
        { path: 'auth/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
        { path: 'internal/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
