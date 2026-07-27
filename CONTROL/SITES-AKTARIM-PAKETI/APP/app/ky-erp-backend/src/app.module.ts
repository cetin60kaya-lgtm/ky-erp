import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MuhasebeModule } from "./muhasebe/muhasebe.module";
import { AdminModule } from "./admin/admin.module";
import { PersonelModule } from "./modules/personel/personel.module";
import { UretimModule } from "./modules/uretim/uretim.module";
import { HealthController } from "./health.controller";
import { BoyahaneModule } from "./modules/boyahane/boyahane.module";
import { DesenModule } from "./modules/desen/desen.module";
import { DatabaseModule } from "./database/database.module";
import { ModelTakipModule } from "./modules/model-takip/model-takip.module";
import { ModelModule } from "./modules/models/model.module";
import { IkModule } from "./ik/ik.module";
import { BackboneApiModule } from "./common/backbone-api.module";
import { StorageModule } from "./storage/storage.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { ModulePermissionGuard } from "./auth/module-permission.guard";
import { MobileCompatModule } from "./mobile-compat/mobile-compat.module";

@Module({
  controllers: [HealthController],
  imports: [
    DatabaseModule,
    AuthModule,
    StorageModule,
    ModelModule,
    MuhasebeModule,
    AdminModule,
    PersonelModule,
    UretimModule,
    BoyahaneModule,
    DesenModule,
    ModelTakipModule,
    IkModule,
    BackboneApiModule,
    MobileCompatModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ModulePermissionGuard,
    },
  ],
})
export class AppModule {}
