import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

type ResizeImageInput = {
  absolutePath: string;
  mimeType?: string | null;
  fileName?: string | null;
  enabled?: boolean;
  maxWidth?: number | null;
  maxHeight?: number | null;
};

type CreateThumbnailInput = {
  absolutePath: string;
  relativePath: string;
  mimeType?: string | null;
  fileName?: string | null;
  enabled?: boolean;
  width?: number | null;
  height?: number | null;
};

@Injectable()
export class ImageResizeService {
  private loadSharp(): any | null {
    try {
      const sharpModule = require("sharp");
      return sharpModule?.default ?? sharpModule;
    } catch {
      return null;
    }
  }

  private isSupportedImage(mimeType?: string | null, fileName?: string | null) {
    if (String(mimeType || "").toLocaleLowerCase("en-US").startsWith("image/")) {
      return true;
    }
    const ext = path.extname(String(fileName || "")).toLocaleLowerCase("en-US");
    return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"].includes(ext);
  }

  async resizeImageIfEnabled(input: ResizeImageInput) {
    if (!input?.enabled || !this.isSupportedImage(input.mimeType, input.fileName)) {
      return input?.absolutePath || "";
    }
    const sharp = this.loadSharp();
    if (!sharp) {
      return input.absolutePath;
    }

    const metadata = await sharp(input.absolutePath).metadata();
    const width = Number(input.maxWidth || 0);
    const height = Number(input.maxHeight || 0);
    const shouldResize =
      (width > 0 && Number(metadata.width || 0) > width) ||
      (height > 0 && Number(metadata.height || 0) > height);

    if (!shouldResize) {
      return input.absolutePath;
    }

    const buffer = await sharp(input.absolutePath)
      .rotate()
      .resize({
        width: width > 0 ? width : undefined,
        height: height > 0 ? height : undefined,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
    fs.writeFileSync(input.absolutePath, buffer);
    return input.absolutePath;
  }

  async createThumbnail(input: CreateThumbnailInput) {
    if (!input?.enabled || !this.isSupportedImage(input.mimeType, input.fileName)) {
      return "";
    }
    const sharp = this.loadSharp();
    if (!sharp) {
      return "";
    }

    const parsedRelative = path.parse(input.relativePath);
    const parsedAbsolute = path.parse(input.absolutePath);
    const thumbFileName = `${parsedAbsolute.name}-thumb${parsedAbsolute.ext}`;
    const thumbRelativePath = path
      .join(parsedRelative.dir, "thumbs", thumbFileName)
      .replace(/\\/g, "/");
    const thumbAbsolutePath = path.join(parsedAbsolute.dir, "thumbs", thumbFileName);

    fs.mkdirSync(path.dirname(thumbAbsolutePath), { recursive: true });
    await sharp(input.absolutePath)
      .rotate()
      .resize({
        width: Number(input.width || 320) || 320,
        height: Number(input.height || 320) || 320,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFile(thumbAbsolutePath);

    return thumbRelativePath;
  }
}