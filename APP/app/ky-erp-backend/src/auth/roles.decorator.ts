import { SetMetadata } from "@nestjs/common";
import { ModuleKey, Role } from "@prisma/client";

export const ROLES_KEY = "roles";
export const MODULE_KEY = "moduleKey";

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const RequireModule = (moduleKey: ModuleKey) =>
  SetMetadata(MODULE_KEY, moduleKey);
