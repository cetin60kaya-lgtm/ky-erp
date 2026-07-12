import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ModuleKey, Prisma, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  private cleanUsername(value: unknown) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  private normalizePermissions(
    value: unknown,
  ): Prisma.UserModulePermissionCreateManyUserInput[] {
    if (!Array.isArray(value)) return [];
    const rows = value
      .map((row) => ({
        moduleKey: row?.moduleKey,
        canView: row?.canView === true,
        canCreate: row?.canCreate === true,
        canUpdate: row?.canUpdate === true,
        canDelete: row?.canDelete === true,
        canApprove: row?.canApprove === true,
      }))
      .filter((row) => Object.values(ModuleKey).includes(row.moduleKey));

    const byKey = new Map<
      ModuleKey,
      Prisma.UserModulePermissionCreateManyUserInput
    >();
    for (const row of rows) {
      byKey.set(row.moduleKey, row);
    }
    return Array.from(byKey.values());
  }

  private mapUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      permissions: Array.isArray(user.permissions)
        ? user.permissions.map((permission: any) => ({
            moduleKey: permission.moduleKey,
            canView: permission.canView,
            canCreate: permission.canCreate,
            canUpdate: permission.canUpdate,
            canDelete: permission.canDelete,
            canApprove: permission.canApprove,
          }))
        : [],
    };
  }

  async listUsers() {
    const rows = await this.prisma.user.findMany({
      include: { permissions: true },
      orderBy: { createdAt: "desc" },
    });

    return {
      ok: true,
      data: rows.map((row) => this.mapUser(row)),
    };
  }

  async createUser(body: any) {
    const username = this.cleanUsername(body?.username);
    const password = String(body?.password || "");
    const fullName = String(body?.fullName || "").trim();
    const role = String(body?.role || "") as Role;

    if (!username || !password || !fullName) {
      throw new BadRequestException(
        "username, password ve fullName zorunludur.",
      );
    }

    if (!Object.values(Role).includes(role)) {
      throw new BadRequestException("Geçersiz role değeri.");
    }

    if (password.length < 6) {
      throw new BadRequestException("Şifre en az 6 karakter olmalıdır.");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const permissions = this.normalizePermissions(body?.permissions);

    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName,
        role,
        isActive: body?.isActive !== false,
        mustChangePassword: body?.mustChangePassword === true,
        permissions: {
          createMany: {
            data: permissions,          },
        },
      },
      include: { permissions: true },
    });

    return {
      ok: true,
      data: this.mapUser(user),
    };
  }

  async updateUser(id: string, body: any) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Kullanıcı bulunamadı.");
    }

    const nextRole = body?.role ? (String(body.role) as Role) : existing.role;
    if (!Object.values(Role).includes(nextRole)) {
      throw new BadRequestException("Geçersiz role değeri.");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: body?.fullName ? String(body.fullName).trim() : undefined,
        role: nextRole,
        isActive:
          typeof body?.isActive === "boolean" ? body.isActive : undefined,
        mustChangePassword:
          typeof body?.mustChangePassword === "boolean"
            ? body.mustChangePassword
            : undefined,
      },
      include: { permissions: true },
    });

    return {
      ok: true,
      data: this.mapUser(updated),
    };
  }

  async resetPassword(id: string, newPassword: string) {
    const password = String(newPassword || "");
    if (password.length < 6) {
      throw new BadRequestException("Yeni şifre en az 6 karakter olmalıdır.");
    }

    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Kullanıcı bulunamadı.");
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: true,
      },
    });

    return { ok: true };
  }

  async deactivate(id: string) {
    await this.ensureUser(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }

  async activate(id: string) {
    await this.ensureUser(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: true } });
    return { ok: true };
  }

  async getPermissions(id: string) {
    await this.ensureUser(id);
    const rows = await this.prisma.userModulePermission.findMany({
      where: { userId: id },
      orderBy: { moduleKey: "asc" },
    });
    return { ok: true, data: rows };
  }

  async updatePermissions(id: string, permissionsValue: unknown) {
    await this.ensureUser(id);
    const permissions = this.normalizePermissions(permissionsValue);

    await this.prisma.$transaction(async (tx) => {
      await tx.userModulePermission.deleteMany({ where: { userId: id } });
      if (permissions.length) {
        await tx.userModulePermission.createMany({
          data: permissions.map((row) => ({ ...row, userId: id })),        });
      }
    });

    return this.getPermissions(id);
  }

  private async ensureUser(id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Kullanıcı bulunamadı.");
    }
    return existing;
  }
}
