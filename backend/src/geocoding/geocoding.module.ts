import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';

/**
 * Server-side address → coordinates (BACKEND_SCHEMA.md §31). Shared because two
 * places need verified coordinates: a job's address (GET /jobs/geocode) and a
 * profile's address (PATCH /profiles/me), which is what makes a provider
 * eligible for recommendation matching (§32).
 */
@Module({
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
