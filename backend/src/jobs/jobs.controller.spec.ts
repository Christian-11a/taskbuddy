import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { GeocodingService } from './geocoding.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * HTTP-level checks for GET /jobs/geocode: the real controller, guard,
 * ValidationPipe (configured as in main.ts) and throttler, with Supabase and
 * Google stubbed. The unit spec for GeocodingService covers Google's answers;
 * this covers what only the wiring can get wrong — route order against
 * `:id`, the client-only role, query validation, and the 10/min limit.
 */
describe('GET /jobs/geocode (HTTP)', () => {
  let app: INestApplication<App>;
  const geocode = jest.fn();

  /** Token → role. Anything else is rejected by the stubbed auth.getUser. */
  const roles: Record<string, string> = {
    'client-token': 'client',
    'provider-token': 'provider',
  };

  const supabase = {
    admin: {
      auth: {
        getUser: jest.fn((token: string) =>
          Promise.resolve(
            roles[token]
              ? { data: { user: { id: token } }, error: null }
              : { data: { user: null }, error: { message: 'bad token' } },
          ),
        ),
      },
      from: jest.fn(() => {
        let id = '';
        const builder = {
          select: () => builder,
          eq: (_column: string, value: string) => {
            id = value;
            return builder;
          },
          single: () =>
            Promise.resolve({
              data: {
                id,
                role: roles[id],
                deleted_at: null,
                deactivated_at: null,
              },
              error: null,
            }),
        };
        return builder;
      }),
    },
  };

  beforeEach(async () => {
    geocode.mockReset();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', limit: 240, ttl: 60_000 }],
        }),
      ],
      controllers: [JobsController],
      providers: [
        JwtAuthGuard,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: SupabaseService, useValue: supabase },
        { provide: JobsService, useValue: {} },
        { provide: GeocodingService, useValue: { geocode } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (query: string, token?: string) => {
    const req = request(app.getHttpServer()).get(`/jobs/geocode${query}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('is matched before /jobs/:id and returns the coordinates', async () => {
    geocode.mockResolvedValue({
      latitude: 14.676,
      longitude: 121.0437,
      formatted_address: '12 Mabini St, Quezon City',
    });

    const res = await get(
      `?address=${encodeURIComponent('12 Mabini St, Quezon City')}`,
      'client-token',
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      latitude: 14.676,
      longitude: 121.0437,
      formatted_address: '12 Mabini St, Quezon City',
    });
    expect(geocode).toHaveBeenCalledWith('12 Mabini St, Quezon City');
  });

  it('requires a token', async () => {
    const res = await get('?address=12%20Mabini%20St');
    expect(res.status).toBe(401);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('is client-only', async () => {
    const res = await get('?address=12%20Mabini%20St', 'provider-token');
    expect(res.status).toBe(403);
    expect(geocode).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing address', ''],
    ['a too-short address', '?address=abc'],
    ['an unknown query field', '?address=12%20Mabini%20St&key=mine'],
  ])('rejects %s with a 400', async (_label, query) => {
    const res = await get(query, 'client-token');
    expect(res.status).toBe(400);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('allows 10 lookups a minute, then answers 429', async () => {
    geocode.mockResolvedValue({
      latitude: 14.676,
      longitude: 121.0437,
      formatted_address: 'x',
    });

    for (let i = 0; i < 10; i++) {
      expect(
        (await get('?address=12%20Mabini%20St', 'client-token')).status,
      ).toBe(200);
    }
    const res = await get('?address=12%20Mabini%20St', 'client-token');

    expect(res.status).toBe(429);
    expect(geocode).toHaveBeenCalledTimes(10);
  });
});
