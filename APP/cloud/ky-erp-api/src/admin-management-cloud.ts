import { registerAdminManagementRoutes as registerCoreAdminManagementRoutes } from "./admin-management-core-cloud";
import { registerAdminBillingRoutes } from "./admin-billing-cloud";

export function registerAdminManagementRoutes(app: any) {
  registerCoreAdminManagementRoutes(app);
  registerAdminBillingRoutes(app);
}
