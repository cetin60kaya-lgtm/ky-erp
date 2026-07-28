import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import { RequireModule } from "../auth/roles.decorator";
import { apiSuccess } from "../common/api-helpers";
import { IsnetAutoFlowService } from "./isnet-auto-flow.service";
import { IsnetDispatchFlowCoordinatorService } from "./isnet-dispatch-flow-coordinator.service";

@Controller("isnet/auto-flows")
@RequireModule(ModuleKey.ISNET)
export class IsnetAutoFlowController {
  constructor(
    private readonly service: IsnetAutoFlowService,
    private readonly coordinator: IsnetDispatchFlowCoordinatorService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.list(query));
  }

  @Post("incoming/:sourceId/prepare")
  async prepareIncoming(
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, any>,
  ) {
    const current: any = await this.service.list(body);
    const existing = Array.isArray(current?.rows)
      ? current.rows.find(
          (row: any) => String(row.incomingSourceId || "") === String(sourceId),
        )
      : null;
    if (existing?.status === "OUTGOING_SEND_REQUIRED") {
      return apiSuccess({
        ok: true,
        duplicatePrevented: true,
        flow: existing,
        message: existing.outgoingDraftNo
          ? `${existing.outgoingDraftNo} taslağı daha önce oluşturuldu. Yeni taslak açılmadı; İşNet'te gönderip gönderilmiş irsaliyeyi bulun.`
          : "İşNet taslak sonucu numarasız kaldı. Çift irsaliye riskine karşı yeni taslak engellendi; portal taslak listesini kontrol edip gönderilmiş irsaliyeyi bulun.",
      });
    }
    return apiSuccess(await this.coordinator.prepareIncoming(sourceId, body));
  }

  @Post(":id/model")
  async assignModel(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.coordinator.assignModel(id, body));
  }

  @Post(":id/outgoing-draft")
  async createOutgoingDraft(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.coordinator.createOutgoingDraft(id, body));
  }

  @Patch(":id/outgoing-document-no")
  async setOutgoingDocumentNo(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.setOutgoingDocumentNo(id, body));
  }

  @Post(":id/refresh")
  async refreshAfterDispatch(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.refreshAfterDispatch(id, body));
  }

  @Patch(":id/invoice-state")
  async updateInvoiceState(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.coordinator.updateInvoiceState(id, body));
  }
}
