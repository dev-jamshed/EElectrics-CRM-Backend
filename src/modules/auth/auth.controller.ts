import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { IsEmail, IsString } from "class-validator";
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

  @Post("users")
  createUser(@Body() dto: CreateUserDto) {
    return this.auth.createUser(dto);
  }

  @Delete("users/:id")
  deleteUser(@Param("id") id: string) {
    return this.auth.deleteUser(id);
  }
}
