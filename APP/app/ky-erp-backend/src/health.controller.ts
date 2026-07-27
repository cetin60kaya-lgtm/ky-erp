import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator";

@Controller()
export class HealthController {
  @Public()
  @Get("health")
  getHealth() {
    return {
      ok: true,
      service: "ky-erp-backend",
    };
  }
}
