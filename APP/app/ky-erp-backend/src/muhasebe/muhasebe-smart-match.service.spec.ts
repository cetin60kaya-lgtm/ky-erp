import { MuhasebeSmartMatchService } from "./muhasebe-smart-match.service";

describe("MuhasebeSmartMatchService Boyahane lot güvenliği", () => {
  it("aynı fatura yeniden yönlendirildiğinde tüketilmiş lot kalanını sıfırlamaz", async () => {
    const boyahaneLotUpdate = jest.fn().mockResolvedValue({ id: "lot-1" });
    const db: any = {
      document: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "doc-1",
            documentNo: "SVK20260001",
            companyId: "selvi",
            date: new Date("2026-07-20"),
            detectedType: "SUPPLIER_INVOICE",
            targetType: "SUPPLIER_INVOICE",
            documentType: "GELEN_FATURA",
            raporKategoriId: null,
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      invoiceItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "line-1",
            documentId: "doc-1",
            productId: "product-1",
            productName: "Beyaz Pigment",
            description: "Boya kimyasalı",
            quantity: 100,
            unit: "KG",
            unitPrice: 50,
            lineTotal: 5000,
            lotNo: "LOT-2026-77",
            raw: {},
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "product-1",
            name: "Beyaz Pigment",
            unit: "KG",
            raw: {
              routingType: "BOYAHANE",
              productGroup: "BOYAHANE",
            },
          },
        ]),
      },
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue({ id: "movement-1" }),
        create: jest.fn(),
      },
      boyahaneLot: {
        findUnique: jest.fn().mockResolvedValue({
          id: "lot-1",
          invoiceItemId: "line-1",
          quantity: 100,
          remainingQuantity: 25,
          raw: { consumed: 75 },
        }),
        update: boyahaneLotUpdate,
        create: jest.fn(),
      },
    };

    const prisma = new Proxy(
      {},
      {
        get: (_target, property) => db[property as string],
      },
    );
    const service = new MuhasebeSmartMatchService(prisma as any);

    const result = await service.synchronizeSupplierRouting({
      mainCompanySlug: "mecit-hakan",
    });

    expect(result.lotsCreated).toBe(0);
    expect(result.lotsLinked).toBe(1);
    expect(db.stockMovement.create).not.toHaveBeenCalled();
    expect(db.boyahaneLot.create).not.toHaveBeenCalled();
    expect(boyahaneLotUpdate).toHaveBeenCalledTimes(1);
    const updateData = boyahaneLotUpdate.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("quantity");
    expect(updateData).not.toHaveProperty("remainingQuantity");
    expect(updateData.raw.consumed).toBe(75);
  });
});
