import type { Request } from 'express';

/**
 * This API's public origin, for building the URLs Stripe sends a browser back
 * to (Checkout's success/cancel, Connect onboarding's return/refresh).
 *
 * Derived from the request so local development works with no configuration,
 * but `PUBLIC_API_URL` wins where it is set. On Render the request host is
 * right and the protocol is not — TLS terminates at the proxy, so the app sees
 * plain http and would hand Stripe an http:// URL that redirects users out of
 * TLS. `x-forwarded-proto` is what the proxy left behind to say so.
 */
export function publicOrigin(req: Request): string {
  const configured = process.env.PUBLIC_API_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const forwarded = req.headers['x-forwarded-proto'];
  const protocol =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0] ??
    req.protocol;
  return `${protocol}://${req.get('host')}`;
}
