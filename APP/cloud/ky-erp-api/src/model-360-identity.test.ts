import test from "node:test";
import assert from "node:assert/strict";
import {model360CanReadIdentity,model360PublicIdentity} from "./model-360-identity-core.ts";
import {readFileSync} from "node:fs";

test("Boyahane yetkisi yalnız kimlik görüntülemeye yeter, yetkisiz kullanıcı kapalıdır",()=>{
 assert.equal(model360CanReadIdentity({role:"EMPLOYEE",permissions:[{moduleKey:"BOYAHANE",canView:true}]}),true);
 assert.equal(model360CanReadIdentity({role:"EMPLOYEE",permissions:[{moduleKey:"IK",canView:true}]}),false);
 assert.equal(model360CanReadIdentity(null),false);
 assert.equal(model360CanReadIdentity({role:"ADMIN"}),true);
});
test("Model 360 yanıtında yalnız güvenli model bilgileri bulunur",()=>{
 const result=model360PublicIdentity({
   id:"model-123456",model_name:"MODEL A",model_code:"A1",customer_name:"Firma",
   image_url:"/model.jpg",raw:JSON.stringify({companyName:"Firma",secret:"DISALLOWED"}),
   credential:"DISALLOWED",tenantSecret:"DISALLOWED",
 });
 assert.equal(result.modelName,"MODEL A");
 assert.equal(result.imageUrl,"/model.jpg");
 assert.ok(!Object.hasOwn(result,"credential"));
 assert.ok(!Object.hasOwn(result,"raw"));
 assert.ok(!JSON.stringify(result).includes("DISALLOWED"));
});
test("Kimlik endpoint'i tenant+id ile salt okunur ve kullanıcı iznine bağlıdır",()=>{
 const source=readFileSync(new URL("./model-360-identity.ts",import.meta.url),"utf8");
 const main=readFileSync(new URL("./main.ts",import.meta.url),"utf8");
 assert.match(source,/getAuthenticatedUser/);
 assert.match(source,/accountingTenantReadAllowed/);
 assert.match(source,/main_company_slug=\? AND id=\?/);
 assert.match(source,/private, no-store/);
 assert.doesNotMatch(source,/UPDATE model_records|DELETE FROM model_records|INSERT INTO model_records/);
 assert.match(main,/registerModel360IdentityRoutes\(app\)/);
});
