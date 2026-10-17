/**
 * Bounds for how far a provider will travel for a job. Migration 0062 holds
 * the same bounds as a check constraint; clients should mirror them.
 */
export const SERVICE_RADIUS_MIN_KM = 1;
export const SERVICE_RADIUS_MAX_KM = 50;
export const SERVICE_RADIUS_DEFAULT_KM = 15;
