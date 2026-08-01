interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success?: boolean;
  meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: Array<string | number | null>): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface R2HttpMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
  writeHttpMetadata(headers: Headers): void;
}

interface R2PutOptions {
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
}

interface R2ListedObject {
  key: string;
  size: number;
  etag: string;
  uploaded?: Date;
  customMetadata?: Record<string, string>;
}

interface R2Objects {
  objects: R2ListedObject[];
  truncated?: boolean;
  cursor?: string;
}

interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
  delimiter?: string;
  include?: Array<"httpMetadata" | "customMetadata">;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
    options?: R2PutOptions,
  ): Promise<unknown>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  delete(key: string | string[]): Promise<void>;
}

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
  }
}
