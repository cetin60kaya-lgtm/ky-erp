import app from "./index";
import { registerBoyahaneInventoryRoutes } from "./boyahane-inventory";
import { registerProductionCenterRoutes } from "./production-center";

registerProductionCenterRoutes(app);
registerBoyahaneInventoryRoutes(app);

export default app;
