import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { getJwtExpiresInSeconds } from "./jwt-expiration";

const FALLBACK_ADMIN_ID = "bootstrap-admin";
const FALLBACK_ADMIN_USERNAME = "admin";
const FALLBACK_ADMIN_FULL_NAME = "Sistem Admin";
const FALLBACK_ADMIN_PASSWORD = String(
  process.env.KY_ERP_FALLBACK_ADMIN_PASSWORD || "2582",
);

function isAuthUsersTableMissingError(error: unknown) {
  const code = String((error as any)?.code || "");
  const table = String((error as any)?.meta?.table || "").toLowerCase();
  return code === "P2021" && table.includes("auth_users");
}

function buildFallbackAdminPayload() {
  return {
    id: FALLBACK_ADMIN_ID,
    username: FALLBACK_ADMIN_USERNAME,
    fullName: FALLBACK_ADMIN_FULL_NAME,
    role: Role.ADMIN,
    mustChangePassword: false,
    permissions: [],
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async buildUserPayload(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Kullanıcı bulunamadı veya pasif.");
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      permissions: user.permissions.map((permission) => ({
        moduleKey: permission.moduleKey,
        canView: permission.canView,
        canCreate: permission.canCreate,
        canUpdate: permission.canUpdate,
        canDelete: permission.canDelete,
        canApprove: permission.canApprove,
      })),
    };
  }

  async login(username: string, password: string) {
    const cleanUsername = String(username || "")
      .trim()
      .toLowerCase();
    const cleanPassword = String(password || "");

    if (!cleanUsername || !cleanPassword) {
      throw new BadRequestException("Kullanıcı adı ve şifre zorunludur.");
    }

    let user: any = null;
    try {
      user = await this.prisma.user.findUnique({
        where: { username: cleanUsername },
        include: { permissions: true },
      });
    } catch (error) {
      if (!isAuthUsersTableMissingError(error)) {
        throw error;
      }

      if (
        cleanUsername !== FALLBACK_ADMIN_USERNAME ||
        cleanPassword !== FALLBACK_ADMIN_PASSWORD
      ) {
        throw new UnauthorizedException("Kullanıcı adı veya şifre hatalı.");
      }

      const token = await this.jwtService.signAsync(
        {
          sub: FALLBACK_ADMIN_ID,
          username: FALLBACK_ADMIN_USERNAME,
          role: Role.ADMIN,
        },
        { expiresIn: getJwtExpiresInSeconds() },
      );

      return {
        ok: true,
        token,
        user: buildFallbackAdminPayload(),
      };
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Kullanıcı adı veya şifre hatalı.");
    }

    const matches = await bcrypt.compare(cleanPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Kullanıcı adı veya şifre hatalı.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const jwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    const token = await this.jwtService.signAsync(jwtPayload, {
      expiresIn: getJwtExpiresInSeconds(),
    });

    const responseUser = await this.buildUserPayload(user.id);

    return {
      ok: true,
      token,
      user: responseUser,
    };
  }

  async getMe(userId: string) {
    if (String(userId || "") === FALLBACK_ADMIN_ID) {
      return {
        ok: true,
        user: buildFallbackAdminPayload(),
      };
    }

    const user = await this.buildUserPayload(userId);
    return {
      ok: true,
      user,
    };
  }

  async logout() {
    return { ok: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const cleanCurrent = String(currentPassword || "");
    const cleanNext = String(newPassword || "");

    if (!cleanCurrent || !cleanNext) {
      throw new BadRequestException("Mevcut şifre ve yeni şifre zorunludur.");
    }

    if (cleanNext.length < 6) {
      throw new BadRequestException("Yeni şifre en az 6 karakter olmalıdır.");
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("Kullanıcı bulunamadı.");
    }

    const matches = await bcrypt.compare(cleanCurrent, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Mevcut şifre hatalı.");
    }

    const passwordHash = await bcrypt.hash(cleanNext, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    return { ok: true };
  }

  async findUserForRequest(userId: string) {
    if (String(userId || "") === FALLBACK_ADMIN_ID) {
      return buildFallbackAdminPayload();
    }

    let user: any = null;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { permissions: true },
      });
    } catch (error) {
      if (isAuthUsersTableMissingError(error)) {
        return null;
      }
      throw error;
    }

    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role as Role,
      mustChangePassword: user.mustChangePassword,
      permissions: user.permissions,
    };
  }
}
