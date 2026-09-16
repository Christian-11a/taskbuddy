import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';

function configWith(key: string | undefined) {
  return {
    get: jest.fn((name: string) =>
      name === 'GOOGLE_GEOCODING_API_KEY' ? key : undefined,
    ),
  } as unknown as ConfigService;
}

function googleResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

function result(locationType: string, partialMatch?: boolean) {
  return {
    formatted_address: '12 Mabini St, Quezon City, Metro Manila, Philippines',
    ...(partialMatch === undefined ? {} : { partial_match: partialMatch }),
    geometry: {
      location: { lat: 14.676, lng: 121.0437 },
      location_type: locationType,
    },
  };
}

describe('GeocodingService', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('answers 503 without calling Google when no key is configured', async () => {
    const service = new GeocodingService(configWith(undefined));

    await expect(service.geocode('12 Mabini St, Quezon City')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a blank address with a 400 instead of asking Google', async () => {
    const service = new GeocodingService(configWith('test-key'));

    await expect(service.geocode('       ')).rejects.toThrow(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restricts the lookup to the Philippines and trims the address', async () => {
    fetchMock.mockResolvedValue(
      googleResponse({ status: 'OK', results: [result('ROOFTOP')] }),
    );
    const service = new GeocodingService(configWith('test-key'));

    await service.geocode('  12 Mabini St, Quezon City  ');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('components')).toBe('country:PH');
    expect(url.searchParams.get('address')).toBe('12 Mabini St, Quezon City');
    expect(url.searchParams.get('key')).toBe('test-key');
  });

  it.each(['ROOFTOP', 'RANGE_INTERPOLATED'])(
    'returns coordinates for a %s match',
    async (locationType) => {
      fetchMock.mockResolvedValue(
        googleResponse({ status: 'OK', results: [result(locationType)] }),
      );
      const service = new GeocodingService(configWith('test-key'));

      await expect(
        service.geocode('12 Mabini St, Quezon City'),
      ).resolves.toEqual({
        latitude: 14.676,
        longitude: 121.0437,
        formatted_address:
          '12 Mabini St, Quezon City, Metro Manila, Philippines',
      });
    },
  );

  it.each(['APPROXIMATE', 'GEOMETRIC_CENTER'])(
    'rejects an imprecise %s match with a 400',
    async (locationType) => {
      fetchMock.mockResolvedValue(
        googleResponse({ status: 'OK', results: [result(locationType)] }),
      );
      const service = new GeocodingService(configWith('test-key'));

      await expect(service.geocode('Quezon City')).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it.each(['ROOFTOP', 'RANGE_INTERPOLATED'])(
    'rejects a partial %s match with a 400',
    async (locationType) => {
      fetchMock.mockResolvedValue(
        googleResponse({ status: 'OK', results: [result(locationType, true)] }),
      );
      const service = new GeocodingService(configWith('test-key'));

      await expect(service.geocode('12 Mabni St, Quezon City')).rejects.toThrow(
        "We couldn't match that address exactly",
      );
    },
  );

  it('accepts a precise match Google marks partial_match: false', async () => {
    fetchMock.mockResolvedValue(
      googleResponse({ status: 'OK', results: [result('ROOFTOP', false)] }),
    );
    const service = new GeocodingService(configWith('test-key'));

    await expect(
      service.geocode('12 Mabini St, Quezon City'),
    ).resolves.toMatchObject({ latitude: 14.676, longitude: 121.0437 });
  });

  it('rejects an address Google cannot find with a 400', async () => {
    fetchMock.mockResolvedValue(
      googleResponse({ status: 'ZERO_RESULTS', results: [] }),
    );
    const service = new GeocodingService(configWith('test-key'));

    await expect(service.geocode('nowhere at all')).rejects.toThrow(
      "We couldn't find that address",
    );
  });

  it('answers 503 and hides Google’s message when the key is denied', async () => {
    fetchMock.mockResolvedValue(
      googleResponse({
        status: 'REQUEST_DENIED',
        error_message: 'This API key is not authorized to use this service',
      }),
    );
    const service = new GeocodingService(configWith('test-key'));

    const error = await service
      .geocode('12 Mabini St, Quezon City')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).not.toContain('API key');
  });

  it('answers 503 when Google returns a non-2xx status', async () => {
    fetchMock.mockResolvedValue(googleResponse({}, false, 500));
    const service = new GeocodingService(configWith('test-key'));

    await expect(service.geocode('12 Mabini St, Quezon City')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('answers 503 when the request itself fails or times out', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted'));
    const service = new GeocodingService(configWith('test-key'));

    await expect(service.geocode('12 Mabini St, Quezon City')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
