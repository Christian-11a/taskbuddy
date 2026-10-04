import type { ProviderProfile } from './api';

/** Both profile views display only the services the API exposes as approved. */
export function approvedServiceNames(
  provider: Pick<
    ProviderProfile,
    'service_categories' | 'approved_secondary_services'
  >,
) {
  return [
    ...new Set([
      ...(provider.service_categories
        ? [provider.service_categories.name]
        : []),
      ...(provider.approved_secondary_services ?? []).map(
        (service) => service.service_categories.name,
      ),
    ]),
  ];
}
