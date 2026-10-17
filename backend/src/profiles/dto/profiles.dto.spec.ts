import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpsertProviderProfileDto } from './profiles.dto';

const base = {
  category_id: 1,
  bio: 'Licensed plumber with ten years of work.',
};

async function radiusErrors(service_radius_km: number) {
  const dto = plainToInstance(UpsertProviderProfileDto, {
    ...base,
    service_radius_km,
  });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'service_radius_km');
}

describe('UpsertProviderProfileDto service radius', () => {
  it.each([1, 15, 50])('accepts %s km', async (km) => {
    expect(await radiusErrors(km)).toHaveLength(0);
  });

  it.each([0.5, 51, 1000])('rejects %s km', async (km) => {
    expect(await radiusErrors(km)).toHaveLength(1);
  });
});
