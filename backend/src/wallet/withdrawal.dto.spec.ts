import { ValidationPipe } from '@nestjs/common';
import { SettleWithdrawalDto } from './dto/wallet.dto';
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
it.each([
  {},
  { reference: '' },
  { reference: '   ' },
  { reference: 'x'.repeat(501) },
])('requires a nonblank bounded payout reference: %j', async (body) => {
  await expect(
    pipe.transform(body, { type: 'body', metatype: SettleWithdrawalDto }),
  ).rejects.toThrow();
});
it('accepts a traceable payout reference', async () => {
  await expect(
    pipe.transform(
      { reference: 'GC-001' },
      { type: 'body', metatype: SettleWithdrawalDto },
    ),
  ).resolves.toMatchObject({ reference: 'GC-001' });
});
