import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GeocodingService } from './geocoding.service';
import { AutocompleteQueryDto, ReverseQueryDto } from './dto/geocoding.dto';
import { ThrottleAutocomplete, ThrottleGeocode } from '../common/throttle';

/**
 * Address entry helpers shared by both apps (BACKEND_SCHEMA.md §31.2, §31.3).
 *
 * Deliberately not under `/jobs` like `GET /jobs/geocode`: a provider editing
 * their profile address needs the same dropdown a homeowner gets on the job
 * form, and the jobs routes are `@Roles('client')`. Any signed-in user may
 * call these; the Geoapify key stays server-side either way.
 */
@Controller('geocoding')
@UseGuards(JwtAuthGuard)
export class GeocodingController {
  constructor(private readonly geocoding: GeocodingService) {}

  /** Suggestions for a partial address. Returns `[]` rather than an error. */
  @Get('autocomplete')
  @ThrottleAutocomplete()
  autocomplete(@Query() query: AutocompleteQueryDto) {
    return this.geocoding.autocomplete(query.q);
  }

  /** The address at the phone's GPS fix, for "use my current location". */
  @Get('reverse')
  @ThrottleGeocode()
  reverse(@Query() query: ReverseQueryDto) {
    return this.geocoding.reverse(query.lat, query.lon);
  }
}
