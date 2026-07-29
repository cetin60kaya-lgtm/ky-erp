import { CanonicalModelFlowService } from "./canonical-model-flow.service";

describe("CanonicalModelFlowService irsaliye imalat denklemi", () => {
  const service = new CanonicalModelFlowService({} as any, {} as any);
  const calculate = (input: any) => (service as any).calculateRow(input);

  it("ön ve arka operasyonlarını toplamak yerine en düşük ortak adedi kullanır", () => {
    const row = calculate({
      expectedQty: 1000,
      requiredRegions: ["Ön", "Arka"],
      regionTotals: new Map([
        ["Ön", 1000],
        ["Arka", 980],
      ]),
      printDefectQty: 10,
      fabricDefectQty: 5,
      wasteQty: 15,
    });
    expect(row.completedGrossQty).toBe(980);
    expect(row.remainingQty).toBe(20);
    expect(row.netGoodQty).toBe(965);
    expect(row.status).toBe("EKSİK");
  });

  it("gelen adedi aşan üretimi fazla olarak işaretler", () => {
    const row = calculate({
      expectedQty: 1000,
      requiredRegions: ["Ön"],
      regionTotals: new Map([["Ön", 1020]]),
      printDefectQty: 0,
      fabricDefectQty: 0,
      wasteQty: 0,
    });
    expect(row.completedGrossQty).toBe(1020);
    expect(row.overQty).toBe(20);
    expect(row.status).toBe("FAZLA");
  });

  it("eksik baskı bölgesini tamamlanmış model saymaz", () => {
    const row = calculate({
      expectedQty: 800,
      requiredRegions: ["Ön", "Arka"],
      regionTotals: new Map([["Ön", 800]]),
      printDefectQty: 0,
      fabricDefectQty: 0,
      wasteQty: 0,
    });
    expect(row.completedGrossQty).toBe(0);
    expect(row.missingRegions).toEqual(["Arka"]);
    expect(row.status).toBe("EKSİK BÖLGE");
  });

  it("tam üretimde baskı ve kumaş sakatını net sağlam adetten düşer", () => {
    const row = calculate({
      expectedQty: 500,
      requiredRegions: ["Ön"],
      regionTotals: new Map([["Ön", 500]]),
      printDefectQty: 8,
      fabricDefectQty: 2,
      wasteQty: 10,
    });
    expect(row.completedGrossQty).toBe(500);
    expect(row.netGoodQty).toBe(490);
    expect(row.status).toBe("SAKATLI TAMAM");
  });
});
