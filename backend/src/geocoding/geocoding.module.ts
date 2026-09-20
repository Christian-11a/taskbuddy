import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';

/**
 * Server-side address → coordinates (BACKEND_SCHEMA.md §31). Shared because two
 * places need verified coordinates: a job's address (GET /jobs/geocode) and a
 * profile's address (PATCH /profiles/me), which is what makes a provider
 * eligible for recommendation matching (§32).
 *
 * It also owns the address-entry routes both apps type into (§31.2, §31.3),
 * which is why the module has a controller of its own.
 */
@Module({
  controllers: [GeocodingController],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
