import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { allowedWebOrigins } from './auth/web-origins';

export async function bootstrap() {
  // rawBody: keeps the unparsed request body available on req.rawBody. Stripe
  // signs the exact bytes it sent, so POST /payments/webhook cannot verify a
  // signature against a body that has been through JSON.parse and re-encoded.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  /**
   * Behind Render's proxy every request arrives from the same address, so
   * without this the rate limiter would see the whole platform as one client
   * and a single abusive caller would lock everybody out. `1` means "there is
   * exactly one proxy in front of me": Express then reads the address that
   * proxy appended and ignores anything the client put in `X-Forwarded-For`
   * itself, which is what stops the header from becoming a way around the
   * limit. Set `TRUST_PROXY_HOPS` if a deployment adds another hop, or `0`
   * when the API is exposed directly.
   */
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.enableCors({ origin: allowedWebOrigins(), credentials: true });
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
