import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
export class PortfolioDetailsDto {
  @IsString() @Length(1, 400) caption!: string;
  @IsInt() @Min(0) @Max(10000) position!: number;
  @IsOptional() @IsInt() @Min(1) category_id?: number | null;
}
export class CreatePortfolioDto extends PortfolioDetailsDto {
  @IsString() @Length(1, 240) image_path!: string;
}
