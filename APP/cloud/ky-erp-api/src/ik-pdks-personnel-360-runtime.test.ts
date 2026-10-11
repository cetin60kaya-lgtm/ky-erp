// @ts-nocheck
// Runs the real Worker handler with mocked auth and deterministic, no-network D1 responses.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const typescriptSource=readFileSync(new URL("./ik-pdks-personnel-360.ts",import.meta.url),"utf8");
const translated=ts.transpileModule(typescriptSource,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
}).outputText
  .replace(/^import .*;\s*$/gm,"")
  .replace(/^export function /gm,"function ")
  .replace(/^export \{\};?\s*$/gm,"");
const register=new Function("getAuthenticatedUser","crypto",
  translated+"\nreturn registerIkPdksPersonnel360Routes;")(
    async(c)=>c.testUser,{randomUUID:()=>"test-uuid"}
  );
const paths={};
register({get:(path,fn)=>{paths["GET "+path]=fn;},
  post:(path,fn)=>{paths["POST "+path]=fn;}});

function fakeContext({
  role="ADMIN",scope="FULL",expectedCardNo="11",personStatus="Aktif",
  personMissing=false,updateChanges=1,historyChanges=1,body={},
}={}){
  const db={
    batchCalls:0,queries:[],
    prepare(sql){
      const statement={
        bind(...args){this.args=args;this.sql=sql;return this;},
        async first(){
          if(sql.includes("FROM ik_user_hr_scope"))return {scope};
          if(sql.includes("FROM hr_monthly_employees"))
            return personMissing?null:{id:"emp",full_name:"Example",status:personStatus,
              active_passive:personStatus,exit_date:""};
          if(sql.includes("FROM ik_person_card_settings"))return {cardNo:expectedCardNo};
          return null;
        },
        async all(){return {results:[]};},
      };
      db.queries.push(sql);
      return statement;
    },
    async batch(statements){
      db.batchCalls++;
      assert.equal(statements.length,2);
      return [{meta:{changes:updateChanges}},{meta:{changes:historyChanges}}];
    },
  };
  const context={
    testUser:{id:"operator",role,username:role==="DENETIM"?"denetim":"staff"},
    get:()=> "tenant-one",
    req:{param:(name)=>name==="employeeId"?"emp":"doc-1",
      json:async()=>body},
    env:{DB:db,FILES:{get:async()=>null}},
    json:(body,status=200)=>({status,body}),
  };
  return {context,db};
}
const root="/api/ik/personnel-control/people/:employeeId";
const good={cardNo:"33",expectedCardNo:"11",reason:"Yeni kart talebi",effectiveDate:"2026-10-10"};
const card=paths["POST "+root+"/card-assignment"];
const cases=[
  ["DENETIM write denied",{role:"DENETIM",body:good},403,0],
  ["nonadmin write denied",{role:"USER",body:good},403,0],
  ["AUDIT scope denied",{scope:"AUDIT",body:good},403,0],
  ["unknown employee denied",{personMissing:true,body:good},404,0],
  ["missing previous card blocked",{body:{...good,expectedCardNo:undefined}},428,0],
  ["invalid card format blocked",{body:{...good,cardNo:"/3"}},400,0],
  ["invalid date blocked",{body:{...good,effectiveDate:"2026-02-30"}},400,0],
  ["missing reason blocked",{body:{...good,reason:"x"}},400,0],
  ["stale card refused",{body:{...good,expectedCardNo:"00"}},409,0],
  ["duplicate conflict refused",{body:good,updateChanges:0,historyChanges:0},409,1],
  ["history write unverified",{body:good,historyChanges:0},500,1],
  ["confirmed card assignment",{body:good},200,1],
  ["inactive card issue refused",{body:good,personStatus:"Pasif"},409,0],
  ["inactive card release allowed",{body:{...good,cardNo:""},personStatus:"Pasif"},200,1],
];
for(const [name,options,status,batches] of cases){
  test(name,async()=>{
    const {context,db}=fakeContext(options);
    // JSON serialization drops undefined fields, matching actual HTTP payloads.
    context.req.json=async()=>JSON.parse(JSON.stringify(options.body));
    const result=await card(context);
    assert.equal(result.status,status);
    assert.equal(db.batchCalls,batches);
  });
}
test("File Hub link with unavailable typed binding fails closed",async()=>{
  const {context,db}=fakeContext({body:{assetId:"asset",documentType:"CONTRACT"}});
  const result=await paths["POST "+root+"/documents"](context);
  assert.equal(result.status,409);
  assert.equal(db.batchCalls,0);
  assert.ok(db.queries.some(x=>x.includes("b.purpose_code=?")&&x.includes("b.write_enabled=1")));
});
test("privileged preview cannot be opened by DENETIM",async()=>{
  const {context}=fakeContext({role:"DENETIM"});
  const result=await paths["GET "+root+"/documents/:relationId/preview"](context);
  assert.equal(result.status,403);
});
test("terminal and time-clock tables are never mutated by this module",()=>{
  assert.doesNotMatch(typescriptSource,/UPDATE ik_time_clock_events|DELETE FROM ik_time_clock_events|FP_CLOCK\.ocx|UPDATE GIRCIK/);
});
