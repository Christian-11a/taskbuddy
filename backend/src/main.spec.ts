const mockEnableCors = jest.fn();
const mockUseGlobalPipes = jest.fn();
const mockListen = jest.fn().mockResolvedValue(undefined);
const mockLog = jest.fn();

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue({
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
