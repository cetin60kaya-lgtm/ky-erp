import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { getJwtExpiresInSeconds } from "./jwt-expiration";

function isAuthUsersTableMissingError(error: unknown) {
  const code = String((error as any)?.code || "");
  const table = String((error as any)?.meta?.table || "").toLowerCase();
  return code === "P2021" && table.includes("auth_users");
}

function isDatabaseTemporarilyUnavailableError(error: unknown) {
  const code = String((error as any)?.code || "");
  const message = String((error as any)?.message || "").toLowerCase();
  return code === "P1008" || message.includes("socket timeout") ||
    message.includes("failed to respond to a query") || message.includes("timed out") ||
    message.includes("database is locked");
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async buildUserPayload(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { permissions: true } });
    if (!user || !user.isActive) throw new UnauthorizedException("Kullanıcı bulunamadı veya pasif.");
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
    const cleanUsername = String(username || "").trim().toLowerCase();
    const cleanPassword = String(password || "");
    if (!cleanUsername || !cleanPassword) throw new BadRequestException("Kullanıcı adı ve şifre zorunludur.");

    let user: any;
    try {
      user = await this.prisma.user.findUnique({ where: { username: cleanUsername }, include: { permissions: true } });
    } catch (error) {
      if (isAuthUsersTableMissingError(error) || isDatabaseTemporarilyUnavailableError(error)) {
        throw new ServiceUnavailableException("Kimlik veritabanına ulaşılamıyor. Güvenli fallback girişi kapalıdır.");
      }
      throw error;
    }
    if (!user || !user.isActive || !(await bcrypt.compare(cleanPassword, user.passwordHash))) {
      throw new UnauthorizedException("Kullanıcı adı veya şifre hatalı.");
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = await this.jwtService.signAsync(
      { sub: user.id, username: user.username, role: user.role },
      { expiresIn: getJwtExpiresInSeconds() },
    );
    return { ok: true, token, user: await this.buildUserPayload(user.id) };
  }

  async getMe(userId: string) {
    return { ok: true, user: await this.buildUserPayload(userId) };
  }

  async logout() {
    return { ok: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const cleanCurrent = String(currentPassword || "");
    const cleanNext = String(newPassword || "");
    if (!cleanCurrent || !cleanNext) throw new BadRequestException("Mevcut şifre ve yeni şifre zorunludur.");
    if (cleanNext.length < 6) throw new BadRequestException("Yeni şifre en az 6 karakter olmalıdır.");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Kullanıcı bulunamadı.");
    if (!(await bcrypt.compare(cleanCurrent, user.passwordHash))) throw new UnauthorizedException("Mevcut şifre hatalı.");
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(cleanNext, 10), mustChangePassword: false },
    });
    return { ok: true };
  }

  async findUserForRequest(userId: string) {
    let user: any;
    try {
      user = await this.prisma.user.findUnique({ where: { id: userId }, include: { permissions: true } });
    } catch (error) {
      if (isAuthUsersTableMissingError(error) || isDatabaseTemporarilyUnavailableError(error)) {
        throw new ServiceUnavailableException("Kimlik veritabanına geçici olarak ulaşılamıyor.");
      }
      throw error;
    }
    if (!user || !user.isActive) return null;
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
