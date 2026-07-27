import type {
  FileDocumentType as PrismaFileDocumentType,
  FileStorageModule as PrismaFileStorageModule,
  OwnerType,
} from "@prisma/client";

export type FileDocumentType = PrismaFileDocumentType;
export type FileStorageModule = PrismaFileStorageModule;

export type DefaultStorageRule = {
  module: FileStorageModule;
  documentType: FileDocumentType;
  displayName: string;
  targetPathTemplate: string;
  allowedExtensions: string;
  maxFileSizeMb?: number | null;
  imageResizeEnabled?: boolean;
  imageMaxWidth?: number | null;
  imageMaxHeight?: number | null;
  thumbEnabled?: boolean;
  thumbWidth?: number | null;
  thumbHeight?: number | null;
  watchEnabled?: boolean;
  watchSourcePath?: string | null;
  isActive?: boolean;
};

export type BuildStoragePathInput = {
  targetPathTemplate: string;
  originalFileName: string;
  storedFileName?: string | null;
  date?: Date | string | null;
  firmSlug?: string | null;
  modelSlug?: string | null;
  personelSlug?: string | null;
  extraTokens?: Record<string, unknown>;
};

export type SaveFileInput = {
  buffer: Buffer;
  originalFileName: string;
  mimeType?: string | null;
  module: FileStorageModule;
  documentType: FileDocumentType;
  ownerType?: OwnerType | "NONE";
  ownerId?: string | null;
  firmId?: string | null;
  modelId?: string | null;
  personelId?: string | null;
  cariId?: string | null;
  firmSlug?: string | null;
  modelSlug?: string | null;
  personelSlug?: string | null;
  extraTokens?: Record<string, unknown>;
  sourcePath?: string | null;
  date?: Date | string | null;
  mainCompanyId: string;
  createdBy?: string | null;
};