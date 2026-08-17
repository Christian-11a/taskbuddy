import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['held', 'released', 'disputed', 'refunded', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;
}

export class RaiseDisputeDto {
  @IsString()
  @Length(1, 200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ListDisputesQueryDto {
  @IsOptional()
  @IsIn(['open', 'resolved', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  offset?: number;
}

export class ResolveDisputeDto {
  @IsIn(['released_to_provider', 'refunded_to_client'])
  resolution!: 'released_to_provider' | 'refunded_to_client';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
