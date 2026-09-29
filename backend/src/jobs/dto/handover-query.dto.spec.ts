import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BrowseJobsQueryDto } from './jobs.dto';
import { ListSkillRequestsQueryDto } from '../../skill-requests/dto/skill-requests.dto';

it('accepts only known urgency values', async () => {
  for (const urgency of ['urgent', 'normal', 'flexible']) {
    expect(
      await validate(plainToInstance(BrowseJobsQueryDto, { urgency })),
    ).toEqual([]);
  }
  expect(
    await validate(plainToInstance(BrowseJobsQueryDto, { urgency: 'later' })),
  ).not.toEqual([]);
});

it('transforms pagination query strings and rejects invalid ranges', async () => {
  const query = plainToInstance(ListSkillRequestsQueryDto, {
    limit: '20',
    offset: '100',
  });
  expect(query).toMatchObject({ limit: 20, offset: 100 });
  expect(await validate(query)).toEqual([]);
  for (const invalid of [
    { limit: 0 },
    { limit: 101 },
    { offset: -1 },
    { offset: 1.5 },
  ]) {
    expect(
      await validate(plainToInstance(ListSkillRequestsQueryDto, invalid)),
    ).not.toEqual([]);
  }
});
