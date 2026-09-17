import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/** Google answers in well under a second; past this the app should say so. */
const GEOCODE_TIMEOUT_MS = 5000;

/**
 * The only `location_type`s precise enough to send a provider to. `GEOMETRIC_CENTER`
 * and `APPROXIMATE` are the centre of a street, barangay or city — a job pinned
 * there would feed the recommendation engine's `distance_km` feature a guess.
 */
const PRECISE_LOCATION_TYPES = ['ROOFTOP', 'RANGE_INTERPOLATED'];

const UNAVAILABLE_MESSAGE =
  "We couldn't verify addresses right now. Try again shortly.";

interface GeocodeResponse {
  status: string;
  error_message?: string;
  results?: {
    formatted_address: string;
    partial_match?: boolean;
    geometry: {
      location: { lat: number; lng: number };
      location_type: string;
    };
  }[];
}

export interface GeocodedAddress {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

/**
 * Turns a typed job address into coordinates (BACKEND_SCHEMA.md §31).
 *
 * The Google key lives here, not in the mobile bundle, where anyone could lift
 * it and bill against it. Results are restricted to the Philippines, and only
 * a precise match is returned: the app refuses to post a job without verified
 * coordinates, so a vague answer is a 400 the homeowner can act on, never a
 * silently wrong pin.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GOOGLE_GEOCODING_API_KEY') || undefined;
  }

  async geocode(address: string): Promise<GeocodedAddress> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Address lookup is not configured');
    }

    // The DTO's length check counts whitespace; an address that is only
    // spaces would reach Google as INVALID_REQUEST and read as an outage.
    const trimmed = address.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException('Enter the full address of the job.');
    }

    const params = new URLSearchParams({
      address: trimmed,
      components: 'country:PH',
      key: this.apiKey,
    });

    let body: GeocodeResponse;
    try {
      const response = await fetch(`${GEOCODE_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Geocoding API returned HTTP ${response.status}`);
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }
      body = (await response.json()) as GeocodeResponse;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(`Geocoding request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }

    if (body.status === 'ZERO_RESULTS') {
      throw new BadRequestException(
        "We couldn't find that address. Check the street and city.",
      );
    }
    const result = body.results?.[0];
    if (body.status !== 'OK' || !result) {
      // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR: our
      // configuration or Google's problem, not the homeowner's. The raw status
      // and message stay in the log — they can name the key's restrictions.
      this.logger.warn(
        `Geocoding API status ${body.status}${body.error_message ? `: ${body.error_message}` : ''}`,
      );
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }

    // Google matched only part of what was typed — a misspelt street, or a
    // house number it could not find — and may have pinned a different, if
    // precise, address. Posting there would send a provider to the wrong door.
    if (result.partial_match) {
      throw new BadRequestException(
        "We couldn't match that address exactly. Check the house number, street and city.",
      );
    }

    if (!PRECISE_LOCATION_TYPES.includes(result.geometry.location_type)) {
      throw new BadRequestException(
        'That address is too general to pin a job to. Add a house number and street.',
      );
    }

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formatted_address: result.formatted_address,
    };
  }
}
