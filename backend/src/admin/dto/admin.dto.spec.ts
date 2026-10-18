import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListActivityQueryDto, ListBookingsQueryDto } from './admin.dto';
import { ListTransactionsQueryDto } from '../../escrow/dto/escrow.dto';

describe('admin list search query DTOs', () => {
  it.each([
    ['bookings', ListBookingsQueryDto],
    ['activity', ListActivityQueryDto],
    ['transactions', ListTransactionsQueryDto],
  ])('keeps an optional string search for %s', async (_name, Dto) => {
    const dto = plainToInstance(Dto, { search: 'Ramos' });

    await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
    expect(dto).toMatchObject({ search: 'Ramos' });
  });

  it.each(['disputed', 'in_progress'])(
    'accepts the booking status filter %s',
    async (status) => {
      const dto = plainToInstance(ListBookingsQueryDto, { status });

      await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
      expect(dto).toMatchObject({ status });
    },
  );

  it('rejects an unknown booking status filter', async () => {
    const dto = plainToInstance(ListBookingsQueryDto, { status: 'bogus' });

    const errors = await validate(dto, { whitelist: true });
    expect(errors.map((error) => error.property)).toEqual(['status']);
  });
});
