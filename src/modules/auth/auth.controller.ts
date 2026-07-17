import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

class UpdateSettingsDto {
  @IsEmail()
  currentEmail: string;

  @IsString()
  profileName: string;

  @IsEmail()
  profileEmail: string;

  @IsString()
  profilePhone: string;

  @IsOptional()
  @IsString()
  profileAvatar?: string;

  @IsString()
  companyName: string;

  @IsString()
  companyAddress: string;

  @IsString()
  registrationNo: string;

  @IsString()
  napitNo: string;

  @IsString()
  companyPhone: string;

  @IsEmail()
  companyEmail: string;
}

class ChangePasswordDto {
  @IsEmail()
  currentEmail: string;

  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get("me")
  me() {
    return this.auth.me();
  }

  @Get("users")
  users() {
    return this.auth.users();
  }

  @Get("settings")
  settings(@Query("currentEmail") currentEmail?: string) {
    return this.auth.settings(currentEmail);
  }

  @Put("settings")
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.auth.updateSettings(dto);
  }

  @Post("change-password")
  changePassword(@Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(dto);
  }

  @Post("users")
  createUser(@Body() dto: CreateUserDto) {
    return this.auth.createUser(dto);
  }

  @Delete("users/:id")
  deleteUser(@Param("id") id: string) {
    return this.auth.deleteUser(id);
  }
}
