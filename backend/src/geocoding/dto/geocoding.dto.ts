import { Type } from 'class-transformer';
import { IsNumber, IsString, Length, Max, Min } from 'class-validator';

/**
 * `GET /geocoding/autocomplete` — what the user has typed so far. The lower
 * bound matches the service's own floor; the upper one keeps a pasted essay
 * out of the query string.
 */
export class AutocompleteQueryDto {
  @IsString()
  @Length(1, 300)
  q!: string;
}

/**
 * `GET /geocoding/reverse` — a GPS fix from the phone. Bounded to the
 * Philippines like the static map route, so the endpoint can't be used as a
 * free worldwide reverse geocoder on the platform's Geoapify credits.
 */
export class ReverseQueryDto {
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(4.5)
  @Max(21.5)
  lat!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(116)
  @Max(127)
  lon!: number;
}
