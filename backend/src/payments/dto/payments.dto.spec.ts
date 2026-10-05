import { ValidationPipe } from '@nestjs/common';
import { CreateTopupDto, CreateCheckoutSessionDto } from './payments.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

for (const metatype of [CreateTopupDto, CreateCheckoutSessionDto]) {
  describe(metatype.name, () => {
    const body = (amount: number) => ({
      amount,
      ...(metatype === CreateCheckoutSessionDto
        ? { app_redirect: 'taskbuddy://payment-return' }
        : {}),
    });

    it.each([20, 49.99, 100_000.01])(
      'rejects PHP%s before contacting Stripe',
      async (amount) => {
        await expect(
          pipe.transform(body(amount), { type: 'body', metatype }),
        ).rejects.toThrow();
      },
    );

    it.each([50, 100_000])('accepts the PHP%s boundary', async (amount) => {
      await expect(
        pipe.transform(body(amount), { type: 'body', metatype }),
      ).resolves.toMatchObject({ amount });
    });
  });
}
