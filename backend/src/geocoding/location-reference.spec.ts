import { ValidationPipe } from '@nestjs/common';
import { UpdateProfileDto } from '../profiles/dto/profiles.dto';
import { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';
import { GeocodingController } from './geocoding.controller';
import type { Profile } from '../common/types';
const location = {
  latitude: 13.941712,
  longitude: 121.163128,
  formatted_address: 'HSSi Building, Lipa, Batangas, Philippines',
  city: 'Lipa',
};
const service = (key = 'unit-location-secret') =>
  new GeocodingService(new ConfigService({ SUPABASE_SERVICE_ROLE_KEY: key }));
afterEach(() => {
  jest.restoreAllMocks();
});
it('binds the exact point and UTF-8 label to the requesting account across API instances', () => {
  const geo = service();
  const signed = geo.issueLocationReference('u1', {
    ...location,
    formatted_address: 'São José, Lipa',
  });
  expect(
    service().resolveLocationReference(
      'u1',
      signed.location_reference!,
      'São José, Lipa',
    ),
  ).toEqual({ ...location, formatted_address: 'São José, Lipa' });
  expect(() =>
    geo.resolveLocationReference(
      'u2',
      signed.location_reference!,
      'São José, Lipa',
    ),
  ).toThrow('does not match');
  expect(() =>
    geo.resolveLocationReference(
      'u1',
      signed.location_reference!,
      'Different label',
    ),
  ).toThrow('does not match');
});
it('rejects edited coordinates, malformed references and signatures from another signing key', () => {
  const geo = service();
  const signed = geo.issueLocationReference('u1', location).location_reference!;
  const [payload, signature] = signed.split('.');
  const edited = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    location: { latitude: number };
  };
  edited.location.latitude = 0;
  const forged = `${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${signature}`;
  for (const value of [forged, 'bad', signed + '.extra', `${payload}.short`])
    expect(() =>
      geo.resolveLocationReference('u1', value, location.formatted_address),
    ).toThrow('Invalid location');
  expect(() =>
    service('different-unit-key').resolveLocationReference(
      'u1',
      signed,
      location.formatted_address,
    ),
  ).toThrow('Invalid location');
});
it('expires exactly at fifteen minutes and never silently forward-geocodes an expired label', () => {
  let now = 1000000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const geo = service();
  const signed = geo.issueLocationReference('u1', location).location_reference!;
  now += 900000 - 1;
  expect(
    geo.resolveLocationReference('u1', signed, location.formatted_address),
  ).toEqual(location);
  now += 1;
  expect(() =>
    geo.resolveLocationReference('u1', signed, location.formatted_address),
  ).toThrow('expired');
});
it('issues references only for precise suggestions and preserves GPS coordinates', async () => {
  const geo = service();
  const user = { id: 'u1' } as Profile;
  jest.spyOn(geo, 'autocomplete').mockResolvedValue([
    { ...location, precise: true },
    { ...location, formatted_address: 'Lipa', precise: false },
  ]);
  jest.spyOn(geo, 'reverse').mockResolvedValue(location);
  const controller = new GeocodingController(geo);
  const rows = await controller.autocomplete(user, { q: 'HSSi Lipa' });
  expect(rows[0].location_reference).toEqual(expect.any(String));
  expect(rows[1]).not.toHaveProperty('location_reference');
  const gps = await controller.reverse(user, {
    lat: location.latitude,
    lon: location.longitude,
  });
  expect(
    geo.resolveLocationReference(
      user.id,
      gps.location_reference!,
      gps.formatted_address,
    ),
  ).toEqual(location);
});

describe('profile location HTTP validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: UpdateProfileDto };
  it.each([
    { latitude: 13.94, longitude: 121.16 },
    { location_reference: null },
    { location_reference: 123 },
    { location_reference: 'x'.repeat(4097) },
  ])(
    'rejects unchecked coordinates and invalid reference fields: %j',
    async (body) => {
      await expect(pipe.transform(body, metadata)).rejects.toThrow();
    },
  );
  it('accepts only the supported address, city and server reference fields', async () => {
    const body = {
      address: location.formatted_address,
      city: location.city,
      location_reference: service().issueLocationReference('u1', location)
        .location_reference,
    };
    await expect(pipe.transform(body, metadata)).resolves.toEqual(body);
  });
});
