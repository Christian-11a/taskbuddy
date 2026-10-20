import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ApplyDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cover_message?: string;

  /** The provider's total labor quote; omitted by older clients to accept the posted budget. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(50)
  @Max(100000)
  quote_amount?: number;
}
