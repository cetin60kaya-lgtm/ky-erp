import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ModuleKey, Role } from "@prisma/client";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { MODULE_KEY, ROLES_KEY } from "./roles.decorator";

const MODULE_BY_PATH: Record<string, ModuleKey> = {
  muhasebe: ModuleKey.MUHASEBE,
  ik: ModuleKey.IK,
  desen: ModuleKey.DESEN,
  imalat: ModuleKey.IMALAT,
  uretim: ModuleKey.IMALAT,
  boyahane: ModuleKey.BOYAHANE,
  admin: ModuleKey.ADMIN,
  storage: ModuleKey.BELGE_ISLEM,
  models: ModuleKey.DESEN,
  "model-takip": ModuleKey.DESEN,
};

function inferAction(
  method: string,
  path: string,
): "canView" | "canCreate" | "canUpdate" | "canDelete" | "canApprove" {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const normalizedPath = String(path || "").toLowerCase();

  if (normalizedPath.includes("onay") || normalizedPath.includes("approve")) {
    return "canApprove";
  }
  if (normalizedMethod === "POST") return "canCreate";
  if (normalizedMethod === "PATCH" || normalizedMethod === "PUT")
    return "canUpdate";
  if (normalizedMethod === "DELETE") return "canDelete";
  return "canView";
}

function inferModuleFromPath(pathValue: string): ModuleKey | null {
  const cleanPath = String(pathValue || "")
    .split("?")[0]
    .replace(/^\/+api\/?/i, "")
    .replace(/^\/+/, "");
  const head = cleanPath.split("/").filter(Boolean)[0] || "";
  return MODULE_BY_PATH[head] || null;
}

@Injectable()
export class ModulePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Yetkisiz erişim.");
    }

    if (user.role === Role.ADMIN) {
      return true;
    }

    const requiredRoles =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    if (requiredRoles.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException("Bu işlem için rol yetkiniz yok.");
    }

    const explicitModule = this.reflector.getAllAndOverride<ModuleKey>(
      MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredModule = explicitModule || inferModuleFromPath(request.path);
    if (!requiredModule) {
      return true;
    }

    const permission = Array.isArray(user.permissions)
      ? user.permissions.find((item: any) => item.moduleKey === requiredModule)
      : null;

    if (!permission) {
      throw new ForbiddenException("Bu modüle erişim yetkiniz yok.");
    }

    const action = inferAction(request.method, request.path);
    if (!permission[action]) {
      throw new ForbiddenException("Bu işlem için yetkiniz yok.");
    }

    return true;
  }
}
