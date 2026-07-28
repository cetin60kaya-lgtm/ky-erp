import { ConflictException } from "@nestjs/common";
import { IsnetDispatchPreparationService } from "./isnet-dispatch-preparation.service";

describe("IsnetDispatchPreparationService adet güvenliği", () => {
  const service = new IsnetDispatchPreparationService(
    {} as any,
    {} as any,
    {} as any,
  );

  const validate = (body: any, remaining: number) =>
    (service as any).validateLines(body, remaining);

  it("tam kesimde ana ürün ve test toplamını kalan adede eşit kabul eder", () => {
    const result = validate(
      {
        fullClose: true,
        lines: [
          {
            category: "MAIN",
            productName: "CONTACT ÜST",
            quantity: 1190,
          },
          {
            category: "TEST_NUMUNESI",
            productName: "TEST NUMUNESİ",
            quantity: 10,
          },
          {
            category: "BASKI_SAKATI",
            productName: "BASKI SAKATI",
            quantity: 0,
          },
        ],
      },
      1200,
    );

    expect(result.total).toBe(1200);
    expect(result.fullClose).toBe(true);
    expect(result.lines).toHaveLength(2);
  });

  it("tam kesimde eksik dağıtımı engeller", () => {
    expect(() =>
      validate(
        {
          fullClose: true,
          lines: [
            {
              category: "MAIN",
              productName: "CONTACT ÜST",
              quantity: 1190,
            },
          ],
        },
        1200,
      ),
    ).toThrow(ConflictException);
  });

  it("kısmi kesimde kalan adetten küçük toplamı kabul eder", () => {
    const result = validate(
      {
        fullClose: false,
        lines: [
          {
            category: "MAIN",
            productName: "CONTACT ÜST",
            quantity: 800,
          },
        ],
      },
      1200,
    );

    expect(result.total).toBe(800);
    expect(result.fullClose).toBe(false);
  });

  it("kısmi kesimde kalan adedi aşan toplamı engeller", () => {
    expect(() =>
      validate(
        {
          fullClose: false,
          lines: [
            {
              category: "MAIN",
              productName: "CONTACT ÜST",
              quantity: 1201,
            },
          ],
        },
        1200,
      ),
    ).toThrow(ConflictException);
  });
});
