const mockSet = jest.fn();
const mockEnableCors = jest.fn();
const mockUseGlobalPipes = jest.fn();
const mockListen = jest.fn().mockResolvedValue(undefined);
const mockLog = jest.fn();

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue({
      set: mockSet,
      enableCors: mockEnableCors,
      useGlobalPipes: mockUseGlobalPipes,
      listen: mockListen,
    }),
  },
}));

jest.mock('@nestjs/common', () => ({
  Logger: jest.fn().mockImplementation(() => ({ log: mockLog })),
  ValidationPipe: jest.fn(),
}));

jest.mock('./app.module', () => ({ AppModule: class AppModule {} }));

import { bootstrap } from './main';

async function bootstrapWithOrigins(origins?: string) {
  jest.clearAllMocks();

  if (origins === undefined) {
    delete process.env.WEB_CORS_ORIGINS;
  } else {
    process.env.WEB_CORS_ORIGINS = origins;
  }

  await bootstrap();
}

describe('bootstrap proxy configuration', () => {
  const originalHops = process.env.TRUST_PROXY_HOPS;

  afterEach(() => {
    if (originalHops === undefined) {
      delete process.env.TRUST_PROXY_HOPS;
    } else {
      process.env.TRUST_PROXY_HOPS = originalHops;
    }
  });

  it('trusts one proxy hop by default, so the rate limiter sees client IPs', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    await bootstrapWithOrigins();

    // Without this every request behind Render's proxy shares one address and
    // a single abusive caller would rate-limit the whole platform.
    expect(mockSet).toHaveBeenCalledWith('trust proxy', 1);
  });

  it('accepts a different hop count for deployments with another proxy', async () => {
    process.env.TRUST_PROXY_HOPS = '2';
    await bootstrapWithOrigins();

    expect(mockSet).toHaveBeenCalledWith('trust proxy', 2);
  });
});

describe('bootstrap CORS configuration', () => {
  const originalOrigins = process.env.WEB_CORS_ORIGINS;

  afterAll(() => {
    if (originalOrigins === undefined) {
      delete process.env.WEB_CORS_ORIGINS;
    } else {
      process.env.WEB_CORS_ORIGINS = originalOrigins;
    }
  });

  it('allows local and deployed web apps by default with credentials', async () => {
    await bootstrapWithOrigins();

    expect(mockEnableCors).toHaveBeenCalledWith({
      origin: [
        'http://localhost:3000',
        'https://taskbuddy-nine-zeta.vercel.app',
      ],
      credentials: true,
    });
  });

  it('accepts comma-separated production web origins', async () => {
    await bootstrapWithOrigins(
      'https://taskbuddy-nine-zeta.vercel.app, https://taskbuddy.example',
    );

    expect(mockEnableCors).toHaveBeenCalledWith({
      origin: [
        'https://taskbuddy-nine-zeta.vercel.app',
        'https://taskbuddy.example',
      ],
      credentials: true,
    });
  });
});
