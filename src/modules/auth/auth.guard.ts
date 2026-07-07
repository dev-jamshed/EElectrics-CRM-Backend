import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService
  ) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      query?: Record<string, string | string[] | undefined>;
    }>();
    const expectedToken = this.config.get<string>("AUTH_TOKEN") ?? "modern-crm-local-token";
    const header = request.headers.authorization;
    const queryToken = request.query?.token;
    const token = header?.startsWith("Bearer ")
      ? header.slice(7)
      : Array.isArray(queryToken)
        ? queryToken[0]
        : queryToken;

    if (token !== expectedToken) {
      throw new UnauthorizedException("Login required");
    }

    return true;
  }
}
