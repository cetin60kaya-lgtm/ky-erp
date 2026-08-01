import app from "./index";
import { registerBoyahaneInventoryRoutes } from "./boyahane-inventory";
import { registerBoyahaneWorkflowRoutes } from "./boyahane-workflow";
import { registerDesenWorkflowRoutes } from "./desen-workflow";
import { registerProductionCenterRoutes } from "./production-center";

// Önce ortak üretim ve stok kaynakları, ardından bu kaynakları kullanan iş akışları bağlanır.
registerProductionCenterRoutes(app);
registerBoyahaneInventoryRoutes(app);
registerBoyahaneWorkflowRoutes(app);
registerDesenWorkflowRoutes(app);

export default app;
