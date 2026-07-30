import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { IsnetConnectionService } from "./isnet-connection.service";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function fakePrisma() {
  return {
    setting: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => create,
    },
  };
}

test("İşNet resmî API girişinde firma listesi ve bağlantı modu döner", async () => {
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    assert.match(String(input), /einvoiceapi\.isnet\.net\.tr\/api\/Account\/Login$/);
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.IdentificationNumber, "11111111111");
    assert.equal(body.Password, "secret");
    return new Response(
      JSON.stringify({
        Token: "api-token",
        CompanyList: [
          {
            IdFirma: "company-1",
            FirmaAdi: "MECİT HAKAN",
            UserHasRole: true,
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const service = new IsnetConnectionService(fakePrisma() as any);
  const result: any = await service.test({
    mainCompanySlug: "mecit-hakan",
    username: "11111111111",
    password: "secret",
  });

  assert.equal(result.ok, true);
  assert.equal(result.connectionMode, "api");
  assert.equal(result.companies[0].id, "company-1");
  assert.equal(result.diagnostics.api, "Bağlandı");
});

test("API başarısızsa güncel NetteFatura giriş yolu ve form alanları kullanılır", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  globalThis.fetch = async (input: any, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body || "");
    calls.push({ url, body });

    if (url.includes("einvoiceapi.isnet.net.tr")) {
      return new Response(JSON.stringify({ Message: "API geçici olarak kullanılamıyor" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/account/login/Login") && (!init?.method || init.method === "GET")) {
      return new Response(
        '<form><input name="Tckn"><input name="Password"><input name="__RequestVerificationToken" value="csrf-1"></form>',
        { status: 200, headers: { "set-cookie": "portal-session=abc; Path=/" } },
      );
    }
    if (url.endsWith("/account/login/Login") && init?.method === "POST") {
      assert.match(body, /Tckn=11111111111/);
      assert.match(body, /Password=secret/);
      assert.match(body, /__RequestVerificationToken=csrf-1/);
      return new Response("", {
        status: 302,
        headers: { location: "/Home", "set-cookie": "auth=ok; Path=/" },
      });
    }
    if (url.endsWith("/account/GetCompanyList")) {
      return new Response(
        JSON.stringify([
          {
            IdFirma: "company-2",
            FirmaAdi: "HAKAN EMP",
            UserHasRole: true,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };

  const service = new IsnetConnectionService(fakePrisma() as any);
  const result: any = await service.test({
    mainCompanySlug: "mecit-hakan",
    username: "11111111111",
    password: "secret",
  });

  assert.equal(result.ok, true);
  assert.equal(result.connectionMode, "portal");
  assert.equal(result.companies[0].id, "company-2");
  assert.equal(result.diagnostics.portal, "Bağlandı");
  assert.ok(calls.some((call) => call.url.endsWith("/account/login/Login")));
});
