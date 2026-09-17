import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';

function configWith(key: string | undefined) {
  return {
    get: jest.fn((name: string) =>
      name === 'GEOAPIFY_API_KEY' ? key : undefined,
    ),
  } as unknown as ConfigService;
}

function geoapifyResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function result(
  resultType: string,
  rank: Record<string, unknown> = {
    confidence: 1,
    confidence_street_level: 1,
    match_type: 'full_match',
  },
) {
  return {
    lat: 14.676,
    lon: 121.0437,
    formatted: '12 Mabini Street, Quezon City, Metro Manila, Philippines',
    result_type: resultType,
    rank,
  };
}

const found = (...results: unknown[]) => geoapifyResponse({ results });

describe('GeocodingService (Geoapify)', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const service = (key = 'test-key') => {
    const s = new GeocodingService(configWith(key));
    jest.spyOn(s['logger'], 'warn').mockImplementation(() => {});
    return s;
  };

  it('answers 503 without calling Geoapify when no key is configured', async () => {
    await expect(
      // An empty value is how an unset Render variable arrives.
      service('').geocode('12 Mabini St, Quezon City'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a blank address with a 400 instead of calling Geoapify', async () => {
    await expect(service().geocode('       ')).rejects.toThrow(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('restricts the lookup to the Philippines, asks for one result, and trims the address', async () => {
    fetchMock.mockResolvedValue(found(result('building')));

    await service().geocode('  12 Mabini St, Quezon City  ');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe(
      'https://api.geoapify.com/v1/geocode/search',
    );
    expect(url.searchParams.get('filter')).toBe('countrycode:ph');
    expect(url.searchParams.get('text')).toBe('12 Mabini St, Quezon City');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('apiKey')).toBe('test-key');
  });

  it.each(['building', 'amenity', 'street'])(
    'returns coordinates for a %s result',
    async (resultType) => {
      fetchMock.mockResolvedValue(found(result(resultType)));

      await expect(
        service().geocode('12 Mabini St, Quezon City'),
      ).resolves.toEqual({
        latitude: 14.676,
        longitude: 121.0437,
        formatted_address:
          '12 Mabini Street, Quezon City, Metro Manila, Philippines',
      });
    },
  );

  it('accepts a street match with no house number (street level is enough)', async () => {
    fetchMock.mockResolvedValue(
      found(
        result('street', {
          confidence: 0.5,
          confidence_street_level: 1,
          match_type: 'match_by_street',
        }),
      ),
    );

    await expect(
      service().geocode('Mabini St, Quezon City'),
    ).resolves.toMatchObject({ latitude: 14.676 });
  });

  it.each([
    'suburb',
    'district',
    'postcode',
    'city',
    'county',
    'state',
    'country',
    'unknown',
  ])('rejects a %s result as too general', async (resultType) => {
    fetchMock.mockResolvedValue(found(result(resultType)));

    await expect(service().geocode('Quezon City')).rejects.toThrow(
      'too general to locate',
    );
  });

  it('rejects a street result Geoapify doubts is the street that was typed', async () => {
    fetchMock.mockResolvedValue(
      found(
        result('street', {
          confidence: 0.1,
          confidence_street_level: 0.1,
          match_type: 'match_by_street',
        }),
      ),
    );

    await expect(service().geocode('12 Mabni St, Quezon City')).rejects.toThrow(
      "We couldn't match that address exactly",
    );
  });

  it('falls back to the overall confidence when a place has no street score', async () => {
    fetchMock.mockResolvedValueOnce(
      found(result('amenity', { confidence: 0.9, match_type: 'full_match' })),
    );
    await expect(
      service().geocode('SM North EDSA, Quezon City'),
    ).resolves.toMatchObject({ latitude: 14.676 });

    fetchMock.mockResolvedValueOnce(
      found(result('amenity', { confidence: 0.05, match_type: 'full_match' })),
    );
    await expect(service().geocode('Some Mall, Quezon City')).rejects.toThrow(
      "We couldn't match that address exactly",
    );
  });

  it('treats a result with no confidence at all as unconfirmed', async () => {
    fetchMock.mockResolvedValue(found(result('street', {})));

    await expect(service().geocode('Mabini St, Quezon City')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an address Geoapify cannot find with a 400', async () => {
    fetchMock.mockResolvedValue(found());

    await expect(service().geocode('nowhere at all')).rejects.toThrow(
      "We couldn't find that address",
    );
  });

  it.each([
    [401, 'invalid key'],
    [429, 'daily credits used up'],
    [500, 'server error'],
  ])('answers 503 and hides the details on HTTP %s (%s)', async (status) => {
    fetchMock.mockResolvedValue(
      geoapifyResponse(
        { statusCode: status, message: 'Invalid apiKey test-key' },
        false,
        status,
      ),
    );

    const error = await service()
      .geocode('12 Mabini St, Quezon City')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).not.toContain('apiKey');
  });

  it('answers 503 when the request itself fails or times out', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted'));

    await expect(
      service().geocode('12 Mabini St, Quezon City'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
