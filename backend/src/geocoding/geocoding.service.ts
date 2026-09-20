import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search';
const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
const REVERSE_URL = 'https://api.geoapify.com/v1/geocode/reverse';
const STATIC_MAP_URL = 'https://maps.geoapify.com/v1/staticmap';

/** Geoapify answers in well under a second; past this the app should say so. */
const GEOCODE_TIMEOUT_MS = 5000;

/**
 * Street level or better. `building` and `amenity` (a named place) are points;
 * `street` places the job on the right street, which is accurate enough for
 * service radii measured in kilometres. Anything coarser — `suburb`,
 * `district`, `postcode`, `city`, … — is the centre of an area, and a job
 * pinned there would feed the recommendation engine's `distance_km` a guess.
 *
 * Building-only would be stricter, but OpenStreetMap (Geoapify's data) has few
 * house numbers in the Philippines, so most real addresses would be refused.
 */
const PRECISE_RESULT_TYPES = ['building', 'amenity', 'street'];

/**
 * Below this street-level confidence Geoapify doubts the result is the street
 * that was typed — it matched something else. 0.2 is the "not confirmed"
 * level from Geoapify's own geocoding docs (DECLINE_LEVEL). Street confidence
 * is used rather than the overall score because a missing house number lowers
 * the overall score, and street level is all this check asks for.
 */
const MIN_STREET_CONFIDENCE = 0.2;

/**
 * How many suggestions the address field offers. Five fills the dropdown
 * without covering the form behind it, and each extra result costs nothing
 * beyond the one credit the request already spends.
 */
const AUTOCOMPLETE_LIMIT = 5;

/**
 * Suggestions are typed into, so they are asked for more often than a final
 * geocode and are worth less when late — past this the keystroke that follows
 * has already replaced the query.
 */
const AUTOCOMPLETE_TIMEOUT_MS = 3000;

/**
 * Shortest query worth a credit. Geoapify answers two letters with the biggest
 * cities in the country, which is noise under a half-typed street name.
 */
const MIN_AUTOCOMPLETE_LENGTH = 3;

/**
 * The thumbnail the job form shows under "Location confirmed". 600×300 is
 * sharp on a phone at the card's width; zoom 16 shows the surrounding streets,
 * which is what a homeowner checks the pin against.
 */
const STATIC_MAP_WIDTH = 600;
const STATIC_MAP_HEIGHT = 300;
const STATIC_MAP_ZOOM = 16;

/** Rendering takes longer than a lookup; still well inside a mobile request. */
const STATIC_MAP_TIMEOUT_MS = 8000;

const UNAVAILABLE_MESSAGE =
  "We couldn't verify addresses right now. Try again shortly.";

const MAP_UNAVAILABLE_MESSAGE = 'Map preview is unavailable right now.';

interface GeoapifyResponse {
  results?: {
    lat: number;
    lon: number;
    formatted?: string;
    result_type?: string;
    rank?: {
      confidence?: number;
      confidence_street_level?: number;
      match_type?: string;
    };
  }[];
}

export interface GeocodedAddress {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

/**
 * One row of the address field's dropdown.
 *
 * `precise` mirrors the rule `geocode()` enforces, so the app can tell a
 * suggestion it may confirm a job with ("12 Mabini Street, …") from one it may
 * only use as a starting point ("Lipa City"). Coarse rows are still returned:
 * tapping a city to then add the street is how a half-remembered address gets
 * typed, and hiding them leaves the dropdown empty for most early keystrokes.
 */
export interface AddressSuggestion extends GeocodedAddress {
  precise: boolean;
}

/**
 * Turns a typed address — a job's or a profile's — into coordinates, using
 * Geoapify's Geocoding API (BACKEND_SCHEMA.md §31, §32).
 *
 * The key lives here, not in the mobile bundle, where anyone could lift it and
 * spend the account's daily credits. Results are restricted to the
 * Philippines, and only a street-level-or-better match the geocoder is not
 * doubtful about is returned: the app refuses to post a job without verified
 * coordinates, so a vague answer is a 400 the user can act on, never a
 * silently wrong pin.
 *
 * Geoapify's free plan requires attribution; the apps show it on the Help &
 * Support screen.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEOAPIFY_API_KEY') || undefined;
  }

  async geocode(address: string): Promise<GeocodedAddress> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Address lookup is not configured');
    }

    // The DTO's length check counts whitespace; an address that is only
    // spaces would reach the geocoder as an empty query.
    const trimmed = address.trim();
    if (trimmed.length < 5) {
      throw new BadRequestException(
        'Enter the full address, including the street.',
      );
    }

    const params = new URLSearchParams({
      text: trimmed,
      filter: 'countrycode:ph',
      lang: 'en',
      limit: '1',
      format: 'json',
      apiKey: this.apiKey,
    });

    let body: GeoapifyResponse;
    try {
      const response = await fetch(`${GEOCODE_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
      });
      if (!response.ok) {
        // 401 (bad key), 429 (daily credits used up), 5xx: our configuration
        // or Geoapify's problem, not the user's. The body stays in the log —
        // it can describe the key and the account.
        this.logger.warn(
          `Geoapify returned HTTP ${response.status}: ${await response.text()}`,
        );
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }
      body = (await response.json()) as GeoapifyResponse;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(`Geocoding request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }

    const result = body.results?.[0];
    if (!result) {
      throw new BadRequestException(
        "We couldn't find that address. Check the street and city.",
      );
    }

    if (!PRECISE_RESULT_TYPES.includes(result.result_type ?? '')) {
      throw new BadRequestException(
        'That address is too general to locate. Add a house number and street.',
      );
    }

    // A named place may carry no street score; fall back to the overall one.
    const confidence =
      result.rank?.confidence_street_level ?? result.rank?.confidence ?? 0;
    if (confidence < MIN_STREET_CONFIDENCE) {
      throw new BadRequestException(
        "We couldn't match that address exactly. Check the house number, street and city.",
      );
    }

    return {
      latitude: result.lat,
      longitude: result.lon,
      formatted_address: result.formatted ?? trimmed,
    };
  }

  /**
   * Address suggestions for what the user has typed so far (§31.2).
   *
   * Unlike `geocode()`, a partial query has no right answer yet, so nothing
   * here throws on a vague match: the rows carry `precise` and the app decides.
   * An empty list is a normal answer — "no match yet" is what half a street
   * name looks like — and a Geoapify outage degrades to that same empty list
   * rather than an error, because the user can always keep typing and let
   * `geocode()` confirm the address on its own.
   */
  async autocomplete(text: string): Promise<AddressSuggestion[]> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Address lookup is not configured');
    }

    const trimmed = text.trim();
    if (trimmed.length < MIN_AUTOCOMPLETE_LENGTH) return [];

    const params = new URLSearchParams({
      text: trimmed,
      filter: 'countrycode:ph',
      lang: 'en',
      limit: String(AUTOCOMPLETE_LIMIT),
      format: 'json',
      apiKey: this.apiKey,
    });

    let body: GeoapifyResponse;
    try {
      const response = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(AUTOCOMPLETE_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `Geoapify autocomplete returned HTTP ${response.status}: ${await response.text()}`,
        );
        return [];
      }
      body = (await response.json()) as GeoapifyResponse;
    } catch (err) {
      this.logger.warn(`Autocomplete request failed: ${(err as Error).message}`);
      return [];
    }

    return (body.results ?? [])
      .filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number')
      .map((r) => ({
        latitude: r.lat,
        longitude: r.lon,
        formatted_address: r.formatted ?? trimmed,
        precise: this.isPrecise(r),
      }));
  }

  /**
   * The address at a set of coordinates, for the "use my current location"
   * button (§31.3). The phone supplies the point from GPS, so unlike
   * `geocode()` there is nothing to verify — but the answer still has to be
   * precise enough to post a job with, and a GPS fix in open country legitimately
   * resolves to nothing at all, which is a 400 the user fixes by typing.
   */
  async reverse(latitude: number, longitude: number): Promise<GeocodedAddress> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Address lookup is not configured');
    }

    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      lang: 'en',
      limit: '1',
      format: 'json',
      apiKey: this.apiKey,
    });

    let body: GeoapifyResponse;
    try {
      const response = await fetch(`${REVERSE_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `Geoapify reverse returned HTTP ${response.status}: ${await response.text()}`,
        );
        throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
      }
      body = (await response.json()) as GeoapifyResponse;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(`Reverse geocoding failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
    }

    const result = body.results?.[0];
    if (!result?.formatted) {
      throw new BadRequestException(
        "We couldn't find an address at your location. Type it instead.",
      );
    }

    // The phone's point, not the geocoder's: reverse results snap to the
    // centre of whatever was matched, and the GPS fix is the better pin.
    return {
      latitude,
      longitude,
      formatted_address: result.formatted,
    };
  }

  /**
   * Street level or better, and a match the geocoder is not doubtful about —
   * the rule `geocode()` rejects an address for, reused so a suggestion the
   * app marks confirmable is one `geocode()` would also accept.
   */
  private isPrecise(result: {
    result_type?: string;
    rank?: { confidence?: number; confidence_street_level?: number };
  }): boolean {
    if (!PRECISE_RESULT_TYPES.includes(result.result_type ?? '')) return false;
    const confidence =
      result.rank?.confidence_street_level ?? result.rank?.confidence ?? 0;
    return confidence >= MIN_STREET_CONFIDENCE;
  }

  /**
   * A PNG map of one point, for the job form's location preview (§31.1).
   *
   * The API fetches the image and returns the bytes rather than handing the
   * app a Geoapify URL: that URL has to carry `apiKey`, and a key in a URL the
   * app loads is as extractable as one in the bundle. The coordinates are the
   * ones `geocode()` returned, already bounded to the Philippines by the DTO.
   */
  async staticMap(latitude: number, longitude: number): Promise<Buffer> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Map preview is not configured');
    }

    const point = `lonlat:${longitude},${latitude}`;
    const params = new URLSearchParams({
      style: 'osm-bright',
      width: String(STATIC_MAP_WIDTH),
      height: String(STATIC_MAP_HEIGHT),
      center: point,
      zoom: String(STATIC_MAP_ZOOM),
      marker: `${point};color:#096e8b;size:medium`,
      format: 'png',
      apiKey: this.apiKey,
    });

    try {
      const response = await fetch(`${STATIC_MAP_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(STATIC_MAP_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Same reasoning as geocode(): the body can describe the key.
        this.logger.warn(
          `Geoapify static map returned HTTP ${response.status}: ${await response.text()}`,
        );
        throw new ServiceUnavailableException(MAP_UNAVAILABLE_MESSAGE);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/png')) {
        this.logger.warn(
          `Geoapify static map answered ${contentType || 'no content type'}, not a PNG`,
        );
        throw new ServiceUnavailableException(MAP_UNAVAILABLE_MESSAGE);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.warn(`Static map request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException(MAP_UNAVAILABLE_MESSAGE);
    }
  }
}
