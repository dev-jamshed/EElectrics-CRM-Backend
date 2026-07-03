import { Body, Controller, Get, Post } from "@nestjs/common";
import { IsEmail, IsString } from "class-validator";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
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
}
