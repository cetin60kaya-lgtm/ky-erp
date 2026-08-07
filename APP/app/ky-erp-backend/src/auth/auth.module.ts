import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { ModulePermissionGuard } from "./module-permission.guard";
import { getJwtExpiresInSeconds } from "./jwt-expiration";

const jwtExpiresInSeconds = getJwtExpiresInSeconds();

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: jwtExpiresInSeconds,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, ModulePermissionGuard],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
