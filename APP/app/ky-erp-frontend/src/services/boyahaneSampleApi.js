import { apiPost } from "../utils/api";
import { companyPayload } from "./boyahaneWorkflowApi";

function unwrap(payload) {
  return payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload.data
    : payload;
}

export async function createBoyahaneSampleFromDesign(activeMainCompany, modelId) {
  return unwrap(
    await apiPost(
      `/boyahane/sample-jobs/from-design/${encodeURIComponent(modelId)}`,
      companyPayload(activeMainCompany),
    ),
  );
}
