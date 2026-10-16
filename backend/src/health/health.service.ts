import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

export interface HealthCheck {
  status: 'up' | 'down';
  latency_ms: number;
  detail?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptime_s: number;
  timestamp: string;
  /** Git commit of the running build, from Render's RENDER_GIT_COMMIT. */
  commit: string | null;
  checks: {
    database: HealthCheck;
    ml_service: HealthCheck;
  };
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();
  private readonly mlServiceUrl: string;
  private readonly commit: string | null;

  constructor(
    private readonly supabase: SupabaseService,
    config: ConfigService,
  ) {
    this.mlServiceUrl = config.get<string>(
      'ML_SERVICE_URL',
      'http://localhost:8000',
    );
    this.commit = config.get<string>('RENDER_GIT_COMMIT') || null;
  }

  async report(): Promise<HealthReport> {
    const [database, mlService] = await Promise.all([
      this.checkDatabase(),
      this.checkMlService(),
    ]);
    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      uptime_s: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      commit: this.commit,
      checks: { database, ml_service: mlService },
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const { error } = await this.supabase.admin
        .from('service_categories')
        .select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return { status: 'up', latency_ms: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        latency_ms: Date.now() - start,
        detail: (err as Error).message,
      };
    }
  }

  private async checkMlService(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.mlServiceUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { model_version?: string };
      return {
        status: 'up',
        latency_ms: Date.now() - start,
        detail: body.model_version ? `model ${body.model_version}` : undefined,
      };
    } catch (err) {
      return {
        status: 'down',
        latency_ms: Date.now() - start,
        detail:
          (err as Error).name === 'TimeoutError'
            ? 'timed out after 2s'
            : (err as Error).message,
      };
    }
  }
}
