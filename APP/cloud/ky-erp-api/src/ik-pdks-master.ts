import type { Hono } from "hono";
import { registerIkPdksMasterRoutes as registerCoreIkPdksMasterRoutes } from "./ik-pdks-master-core";
import { registerIkPdksDeviceRoutes } from "./ik-pdks-device";
import { registerIkPdksDeviceAdminRoutes } from "./ik-pdks-device-admin";

export function registerIkPdksMasterRoutes(app: Hono<any>) {
  registerCoreIkPdksMasterRoutes(app);
  registerIkPdksDeviceAdminRoutes(app);
  registerIkPdksDeviceRoutes(app);
}
