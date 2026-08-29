import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
