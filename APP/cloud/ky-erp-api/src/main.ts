import app from "./index";
import { registerBoyahaneInventoryRoutes } from "./boyahane-inventory";
import { registerBoyahaneWorkflowRoutes } from "./boyahane-workflow";
import { registerProductionCenterRoutes } from "./production-center";

registerProductionCenterRoutes(app);
registerBoyahaneInventoryRoutes(app);
registerBoyahaneWorkflowRoutes(app);

export default app;
