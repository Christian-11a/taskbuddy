const DEFAULT_WEB_ORIGINS = [
  'http://localhost:3000',
  'https://taskbuddy-nine-zeta.vercel.app',
];

export function allowedWebOrigins() {
  return process.env.WEB_CORS_ORIGINS
    ? process.env.WEB_CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : DEFAULT_WEB_ORIGINS;
}

export function isAllowedWebOrigin(origin?: string) {
  return origin !== undefined && allowedWebOrigins().includes(origin);
}
