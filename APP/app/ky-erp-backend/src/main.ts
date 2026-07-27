import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import * as express from "express";
import * as fs from "fs";
import * as path from "path";
import { AppModule } from "./app.module";
import { DocumentNoiseFilterInterceptor } from "./common/interceptors/document-noise-filter.interceptor";
import { getStorageRoot } from "./storage/storage-path.util";

if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile();
}

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, {
    cors: false,
    bufferLogs: false,
  });

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // Allow any localhost port
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return callback(null, true);
      if (/^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) return callback(null, true);
      if ([
        "https://kyerp.net",
        "https://www.kyerp.net",
        "https://app.kyerp.net",
      ].includes(origin)) return callback(null, true);
      // Allow the live server itself
      if (origin === "http://178.157.14.87" || origin.startsWith("http://178.157.14.87")) return callback(null, true);
      // Default deny
      callback(new Error("CORS not allowed: " + origin));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  });

  app.enableShutdownHooks();
  app.use((req, _res, next) => {
    if (req.url === "/api" || req.url.startsWith("/api/")) {
      req.url = req.url.replace(/^\/api(?=\/|$)/, "") || "/";
    }
    next();
  });

  app.useGlobalInterceptors(new DocumentNoiseFilterInterceptor());

  fs.mkdirSync(getStorageRoot(), { recursive: true });
  const serveStorage = (req, res, next) => {
    const storageDir = getStorageRoot();
    fs.mkdirSync(storageDir, { recursive: true });
    return express.static(storageDir)(req, res, next);
  };
  app.use("/storage", serveStorage);

  process.on("unhandledRejection", (reason) => {
    logger.error(
      `Unhandled promise rejection: ${
        reason instanceof Error
          ? reason.stack || reason.message
          : String(reason)
      }`,
    );
  });

  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught exception: ${error.stack || error.message}`);
  });

  const port = Number(process.env.PORT || 3101);
  await app.listen(port);
  logger.log(`KY ERP backend running on http://localhost:${port}`);
}

bootstrap().catch((error) => {
  const logger = new Logger("Bootstrap");
  logger.error(`Bootstrap failed: ${error?.stack || error?.message || error}`);
  process.exit(1);
});

