import { IsEmail, IsOptional, IsString } from "class-validator";

export class UpsertClientDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

