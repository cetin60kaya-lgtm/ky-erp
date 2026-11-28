import test from "node:test";
import assert from "node:assert/strict";
import { recipeBudget, linkedPigmentPct, makeModel, linearHex, solveColor, weighRecipe } from "./colorFormulation.js";
const palette=[
 {id:"a",name:"Sarı test",hex:"#F5E233",strength:1.2},
 {id:"b",name:"Kırmızı test",hex:"#AE2642",strength:2},
 {id:"c",name:"Mavi test",hex:"#204D90",strength:1.7},
 {id:"d",name:"Siyah test",hex:"#333333",strength:3}
];
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test("S10, S20 ve gerçek pigment toplamı korunur",()=>{
 const b=recipeBudget(1000,40,8);close(b.white+b.clear+b.pigment,1000);close(b.white,368);close(b.pigment,80);
});
test("Beyaz arttığında ve azaldığında pigment / beyaz oranı değişmez",()=>{
 const a=recipeBudget(100,25,6),r=a.pigment/a.white;
 for(const white of [10,50,75]){const b=recipeBudget(100,white,linkedPigmentPct(r,white));close(b.pigment/b.white,r);}
 assert.throws(()=>linkedPigmentPct(r,0));
});
test("Arşiv kullanmadan daha önce bilinmeyen HEX için ters çözüm",()=>{
 const b=recipeBudget(100,40,12);
 const target=linearHex(makeModel(palette,1)([3,4,4,1],b.white));
 const result=solveColor({target,palette,mass:100,whitePct:40,pigmentPct:12});
 close(result.grams.reduce((s,g)=>s+g,0),12);
 assert.ok(result.grams.every(g=>g>=0));assert.ok(result.delta<1.2);
 close(result.budget.white,b.white);close(result.budget.clear,b.clear);
});
test("Açılım gerçek pigmenti değiştirmez ve şeffaf taşıyıcıyı düşer",()=>{
 const budget=recipeBudget(100,30,2);
 const w=weighRecipe(budget,palette,[.25,.5,1,.25],[5,10,100,3]);
 close(w.lines.reduce((s,x)=>s+x.pure,0),2);
 close(w.lines.reduce((s,x)=>s+x.weight,0)+w.clear+w.white,100);
 assert.throws(()=>weighRecipe(recipeBudget(100,95,5),palette,[5,0,0,0],[3,100,100,100]));
});
test("Geçersiz oran ve hedeflerde hesap engellenir",()=>{
 assert.throws(()=>recipeBudget(0,40,5));assert.throws(()=>recipeBudget(100,101,5));assert.throws(()=>recipeBudget(100,40,100));
 assert.throws(()=>solveColor({target:"hata",palette,mass:100,whitePct:40,pigmentPct:5}));
 assert.throws(()=>solveColor({target:"#AAAAAA",palette:[],mass:100,whitePct:40,pigmentPct:5}));
});
test("S20 açma deneyi aynı pigmenti daha açık yapar",()=>{
 const predict=makeModel([palette[1]],1);const a=predict([10],5),b=predict([10],20);assert.ok(b.every((v,i)=>v>=a[i]));
});
