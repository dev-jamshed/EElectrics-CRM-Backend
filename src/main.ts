import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const webOrigin = config.get<string>("WEB_ORIGIN") ?? "http://localhost:5173";

  app.enableCors({
    origin: webOrigin.split(",").map((origin) => origin.trim()),
    credentials: true
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  await app.listen(config.get<number>("PORT") ?? 4000);
}

bootstrap();

