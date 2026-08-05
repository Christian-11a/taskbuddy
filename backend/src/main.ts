import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: keeps the unparsed request body available on req.rawBody. Stripe
  // signs the exact bytes it sent, so POST /payments/webhook cannot verify a
  // signature against a body that has been through JSON.parse and re-encoded.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(
    `TaskBuddy API running — status page: http://localhost:${port}`,
  );
}
void bootstrap();
