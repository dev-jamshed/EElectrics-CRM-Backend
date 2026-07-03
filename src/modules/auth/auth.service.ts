import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  login(email: string, password: string) {
    const adminEmail = this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk";
    const adminPassword = this.config.get<string>("ADMIN_PASSWORD") ?? "admin123";

    if (email !== adminEmail || password !== adminPassword) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return {
      token: this.config.get<string>("AUTH_TOKEN") ?? "modern-crm-local-token",
      user: this.me()
    };
  }

  me() {
    return {
      name: "Admin",
      email: this.config.get<string>("ADMIN_EMAIL") ?? "admin@eelectrics.co.uk",
      role: "Administrator"
    };
  }
}

