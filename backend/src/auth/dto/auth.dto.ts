import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { UserRole } from '../../common/types';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(['client', 'provider'])
  role!: UserRole;

  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  current_password!: string;

  @IsString()
  @MinLength(8)
  new_password!: string;
}
