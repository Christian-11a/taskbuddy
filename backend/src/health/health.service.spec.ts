import type { ConfigService } from '@nestjs/config';
import type { SupabaseService } from '../supabase/supabase.service';
import { HealthService } from './health.service';

function configWith(env: Record<string, string | undefined>) {
  return {
    get: jest.fn((name: string, fallback?: string) => env[name] ?? fallback),
  } as unknown as ConfigService;
}

const supabase = {
  admin: {
    from: () => ({
      select: () => Promise.resolve({ error: null }),
    }),
  },
} as unknown as SupabaseService;

describe('HealthService', () => {
  beforeEach(() => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ model_version: 'rf-a-v1' })),
      );
  });

  afterEach(() => jest.restoreAllMocks());

  it('reports the commit Render built from', async () => {
    const service = new HealthService(
      supabase,
      configWith({ RENDER_GIT_COMMIT: 'd96a79d0123456789' }),
    );

    const report = await service.report();

    expect(report.commit).toBe('d96a79d0123456789');
    expect(report.status).toBe('ok');
  });

  it('reports a null commit outside Render', async () => {
    const service = new HealthService(supabase, configWith({}));

    expect((await service.report()).commit).toBeNull();
  });
});
