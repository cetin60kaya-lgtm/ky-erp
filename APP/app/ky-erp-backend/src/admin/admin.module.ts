import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { SqlStoreService } from "../kyerp-core/sql-store.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";

@Module({
  controllers: [AdminController, AdminUsersController],
  providers: [AdminService, AdminUsersService, SqlStoreService],
  exports: [AdminService],
})
export class AdminModule {}
