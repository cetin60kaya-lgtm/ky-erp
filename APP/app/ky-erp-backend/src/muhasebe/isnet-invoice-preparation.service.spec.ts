import { BadRequestException, ConflictException } from "@nestjs/common";
import { IsnetInvoicePreparationService } from "./isnet-invoice-preparation.service";

describe("IsnetInvoicePreparationService satır kuralları", () => {
  const service = new IsnetInvoicePreparationService(
    {} as any,
    {} as any,
    {} as any,
  );

  const prepare = (
    sourceLines: any[],
    requestedLines: any[],
    settings: any,
    body: any = {},
  ) =>
    (service as any).prepareLines(
      sourceLines,
      requestedLines,
      settings,
      body,
    );

  const source = [
    {
      sourceLineId: "main",
      category: "MAIN",
      productName: "CONTACT ÜST",
      quantity: 1190,
    },
    {
      sourceLineId: "test",
      category: "TEST_NUMUNESI",
      productName: "TEST NUMUNESİ",
      quantity: 10,
    },
    {
      sourceLineId: "baski",
      category: "BASKI_SAKATI",
      productName: "BASKI SAKATI",
      quantity: 4,
    },
    {
      sourceLineId: "kumas",
      category: "KUMAS_SAKATI",
      productName: "KUMAŞ SAKATI",
      quantity: 6,
    },
  ];

  it("ana ürünü fiyatlar, test numunesini muafiyetli yapar ve sakatları faturadan çıkarır", () => {
    const result = prepare(
      source,
      [
        { sourceLineId: "main", quantity: 1190, unitPrice: 9, vatRate: 20 },
        { sourceLineId: "test", quantity: 10 },
      ],
      {
        nonBillableRules: {
          TEST_NUMUNESI: {
            invoiceBehavior: "ZERO_PRICE_EXEMPT",
            exemptionCode: "351",
            exemptionReason: "Test numunesi",
          },
        },
      },
    );

    expect(result.prepared).toHaveLength(2);
    expect(result.excluded).toHaveLength(2);
    expect(result.prepared[0].line.unitPrice).toBe(9);
    expect(result.prepared[0].line.vatRate).toBe(20);
    expect(result.prepared[1].line.unitPrice).toBe(0);
    expect(result.prepared[1].line.vatRate).toBe(0);
    expect(result.prepared[1].line.taxExemptionReasonCode).toBe("351");
    expect(result.excluded.map((row: any) => row.category)).toEqual([
      "BASKI_SAKATI",
      "KUMAS_SAKATI",
    ]);
  });

  it("test numunesinde muafiyet kodu eksikse taslağı engeller", () => {
    expect(() =>
      prepare(
        source.slice(0, 2),
        [
          { sourceLineId: "main", quantity: 1190, unitPrice: 9, vatRate: 20 },
          { sourceLineId: "test", quantity: 10 },
        ],
        {
          nonBillableRules: {
            TEST_NUMUNESI: {
              invoiceBehavior: "ZERO_PRICE_EXEMPT",
              exemptionCode: "",
              exemptionReason: "",
            },
          },
        },
      ),
    ).toThrow(BadRequestException);
  });

  it("gönderilmiş irsaliye adedi değiştirilirse faturayı engeller", () => {
    expect(() =>
      prepare(
        source.slice(0, 1),
        [{ sourceLineId: "main", quantity: 1189, unitPrice: 9, vatRate: 20 }],
        { nonBillableRules: {} },
      ),
    ).toThrow(ConflictException);
  });
});
