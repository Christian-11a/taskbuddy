import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

export const SKILL_REQUEST_TYPES = ['change_primary', 'add_secondary'] as const;
export type SkillRequestType = (typeof SKILL_REQUEST_TYPES)[number];

export const SKILL_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
] as const;
export type SkillRequestStatus = (typeof SKILL_REQUEST_STATUSES)[number];

/** `POST /skill-requests` — a provider asks to change or add a service. */
export class CreateSkillRequestDto {
  @IsIn(SKILL_REQUEST_TYPES)
  type!: SkillRequestType;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  category_id!: number;

  /** Why they qualify: experience, a licence, past work. Admins read this. */
  @IsString()
  @Length(10, 500)
  reason!: string;
}

export class ListSkillRequestsQueryDto {
  @IsOptional()
  @IsIn(SKILL_REQUEST_STATUSES)
  status?: SkillRequestStatus;
}

export class ReviewSkillRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
