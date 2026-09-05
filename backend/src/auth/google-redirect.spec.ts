import { appendRedirectParams, isAllowedAppRedirect } from './google-redirect';

describe('isAllowedAppRedirect', () => {
  it.each([
    ['taskbuddy://'],
    ['taskbuddy:///--/auth'],
    ['exp+taskbuddy://expo-development-client'],
    ['exp://192.168.1.42:8081/--/'],
    ['exp://10.0.0.5:8081'],
    ['exp://172.16.4.4:8081'],
    ['exp://127.0.0.1:8081'],
    ['exp://abc-123.exp.direct/--/'],
    ['http://localhost:19006'],
    ['http://127.0.0.1:3000/callback'],
    ['https://taskbuddy-nine-zeta.vercel.app/account'],
  ])('allows %s', (uri) => {
    expect(isAllowedAppRedirect(uri)).toBe(true);
  });

  it.each([
    ['https://evil.example'],
    ['http://evil.example'],
    // Hostile host smuggled onto an allowed scheme.
    ['exp://evil.example/--/'],
    // 172.32 is outside the private 172.16–172.31 range.
    ['exp://172.32.0.1:8081'],
    // localhost as a subdomain of an attacker domain.
    ['http://localhost.evil.example'],
    // Plain http on the prod host isn't allowed, only https.
    ['http://taskbuddy-nine-zeta.vercel.app'],
    // Prod host as a subdomain of an attacker domain.
    ['https://taskbuddy-nine-zeta.vercel.app.evil.example'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>'],
    ['file:///etc/passwd'],
    ['not a url'],
    [''],
  ])('rejects %s', (uri) => {
    expect(isAllowedAppRedirect(uri)).toBe(false);
  });

  it('rejects an allowed scheme carrying a fragment', () => {
    // A `#` would swallow the appended tokens into the fragment, where the
    // app's query-string parser never looks.
    expect(isAllowedAppRedirect('taskbuddy://#frag')).toBe(false);
  });
});

describe('appendRedirectParams', () => {
  it('uses ? when the redirect has no query string', () => {
    const params = new URLSearchParams({ access_token: 'abc' });
    expect(appendRedirectParams('taskbuddy://', params)).toBe(
      'taskbuddy://?access_token=abc',
    );
  });

  it('uses & when the redirect already carries a query string', () => {
    const params = new URLSearchParams({ access_token: 'abc' });
    expect(appendRedirectParams('exp://127.0.0.1:8081/--/?a=1', params)).toBe(
      'exp://127.0.0.1:8081/--/?a=1&access_token=abc',
    );
  });
});
