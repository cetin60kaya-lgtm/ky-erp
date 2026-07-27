import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { ModuleKey, Role } from "@prisma/client";
import { Roles, RequireModule } from "../auth/roles.decorator";
import { AdminUsersService } from "./admin-users.service";

@Controller("admin/users")
@Roles(Role.ADMIN)
@RequireModule(ModuleKey.ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  listUsers() {
    return this.usersService.listUsers();
  }

  @Post()
  createUser(@Body() body: any) {
    return this.usersService.createUser(body);
  }

  @Patch(":id")
  updateUser(@Param("id") id: string, @Body() body: any) {
    return this.usersService.updateUser(id, body);
  }

  @Put(":id")
  putUser(@Param("id") id: string, @Body() body: any) {
    return this.usersService.updateUser(id, body);
  }

  @Post(":id/reset-password")
  resetPassword(@Param("id") id: string, @Body() body: any) {
    return this.usersService.resetPassword(
      id,
      body?.password || body?.newPassword,
    );
  }

  @Post(":id/deactivate")
  deactivate(@Param("id") id: string) {
    return this.usersService.deactivate(id);
  }

  @Post(":id/activate")
  activate(@Param("id") id: string) {
    return this.usersService.activate(id);
  }

  @Get(":id/permissions")
  getPermissions(@Param("id") id: string) {
    return this.usersService.getPermissions(id);
  }

  @Put(":id/permissions")
  updatePermissions(@Param("id") id: string, @Body() body: any) {
    return this.usersService.updatePermissions(id, body?.permissions);
  }
}
