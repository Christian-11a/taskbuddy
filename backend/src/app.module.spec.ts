import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

/**
 * The whole dependency graph resolves: every provider can be constructed and
 * no module imports form a cycle. Unit specs build services by hand, so
 * without this a missing export or a circular import is first discovered
 * when the deployed API fails to boot.
 */
describe('AppModule', () => {
  const saved = { ...process.env };
  afterAll(() => {
    process.env = saved;
  });

  it('compiles with every provider resolvable', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
