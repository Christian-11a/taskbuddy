import { allowedWebOrigins, isAllowedWebOrigin } from './web-origins';

describe('web origins', () => {
  const originalOrigins = process.env.WEB_CORS_ORIGINS;

  afterEach(() => {
    if (originalOrigins === undefined) {
      delete process.env.WEB_CORS_ORIGINS;
    } else {
      process.env.WEB_CORS_ORIGINS = originalOrigins;
    }
  });

  it('allows the default local and deployed web origins', () => {
    delete process.env.WEB_CORS_ORIGINS;

    expect(allowedWebOrigins()).toEqual([
      'http://localhost:3000',
      'https://taskbuddy-nine-zeta.vercel.app',
    ]);
    expect(isAllowedWebOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedWebOrigin('https://taskbuddy-nine-zeta.vercel.app')).toBe(
      true,
    );
  });

  it('rejects missing and untrusted origins', () => {
    expect(isAllowedWebOrigin()).toBe(false);
    expect(isAllowedWebOrigin('https://evil.example')).toBe(false);
  });
});
