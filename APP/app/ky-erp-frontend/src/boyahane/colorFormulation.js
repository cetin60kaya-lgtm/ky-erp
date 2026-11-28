export function colorKs(hex){
  if(!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Geçerli HEX girin.");
  return [1,3,5].map(i=>{const x=parseInt(hex.slice(i,i+2),16)/255;const r=Math.max(0.0005,x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return (1-r)**2/(2*r);});
}

export function colorLab(rgb){
  const [r,g,b]=rgb;
  const f=x=>x>216/24389?Math.cbrt(x):(24389/27*x+16)/116;
  const x=f((0.4124564*r+0.3575761*g+0.1804375*b)/0.95047),y=f(0.2126729*r+0.7151522*g+0.072175*b),z=f((0.0193339*r+0.119192*g+0.9503041*b)/1.08883);
  return [116*y-16,500*(x-y),200*(y-z)];
}

export function hexLinear(hex){if(!/^#[0-9a-f]{6}$/i.test(hex))throw new Error("Geçerli HEX girin.");return [1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});}

export function linearHex(rgb){return "#"+rgb.map(r=>Math.round(255*Math.max(0,Math.min(1,r<=0.0031308?12.92*r:1.055*r**(1/2.4)-0.055))).toString(16).padStart(2,"0")).join("").toUpperCase();}

export function recipeBudget(mass,whitePct,pigmentPct){
  if(![mass,whitePct,pigmentPct].every(Number.isFinite)||mass<=0||whitePct<0||whitePct>100||pigmentPct<0||pigmentPct>=100)throw new Error("Gramaj pozitif, oranlar 0–100 aralığında olmalıdır.");
  const pigment=mass*pigmentPct/100,white=(mass-pigment)*whitePct/100;
  return {mass,pigment,white,clear:mass-pigment-white};
}

export function linkedPigmentPct(referenceRatio,whitePct){
  if(!Number.isFinite(referenceRatio)||referenceRatio<0||!Number.isFinite(whitePct)||whitePct<=0||whitePct>100)throw new Error("Sıfır beyazlı reçetede bağlantı kullanılamaz; pigmenti elle belirleyin.");
  const r=referenceRatio*whitePct/100;
  return 100*r/(1+r);
}

export function makeModel(palette,whitePower){
  if(!Number.isFinite(whitePower)||whitePower<=0)throw new Error("Beyaz kuvveti pozitif olmalıdır.");
  const p=palette.map(x=>{if(!Number.isFinite(x.strength)||x.strength<=0)throw new Error("Pigment kuvveti pozitif olmalıdır.");return {...x,ks:colorKs(x.hex)};});
  return (grams,white)=>{let den=white*whitePower;const a=[0,0,0];for(let i=0;i<p.length;i++){const m=grams[i]*p[i].strength;den+=m;for(let j=0;j<3;j++)a[j]+=m*p[i].ks[j];}return a.map(v=>{const k=v/Math.max(den,1e-12);return 1/(1+k+Math.sqrt(k*k+2*k));});};
}

export function solveColor({target,palette,mass,whitePct,pigmentPct,whitePower=1}){
  const budget=recipeBudget(mass,whitePct,pigmentPct),goal=colorLab(hexLinear(target)),predict=makeModel(palette,whitePower);
  if(palette.length>40)throw new Error("Bir hesapta en fazla 40 kalibre pigment seçin.");
  if(!palette.length&&budget.pigment>0)throw new Error("En az bir kalibre pigment seçin.");
  if(budget.white===0&&budget.pigment===0)throw new Error("Yalnız şeffafın rengi kumaş zeminine bağlıdır.");
  const cost=x=>{const l=colorLab(predict(x.map(v=>v*budget.pigment),budget.white));return l.reduce((s,v,i)=>s+(v-goal[i])**2,0);};
  let best=palette.map(()=>0),score=cost(best);
  if(budget.pigment>0){
    score=Infinity;
    const starts=palette.map((_,i)=>palette.map((__,j)=>i===j?1:0));starts.push(palette.map(()=>1/palette.length));
    for(let x of starts){let current=cost(x);
      for(const step of [0.25,0.08,0.025,0.008,0.002,0.0005,0.0001]){
        for(let k=0;k<15;k++){let next=null,nextScore=current;
          for(let i=0;i<x.length;i++)if(x[i]>1e-12)for(let j=0;j<x.length;j++)if(i!==j){const y=x.slice(),v=Math.min(step,x[i]);y[i]-=v;y[j]+=v;const c=cost(y);if(c<nextScore-1e-10){next=y;nextScore=c;}}
          if(!next)break;x=next;current=nextScore;
        }
      }
      if(current<score){best=x;score=current;}
    }
  }
  const grams=best.map(x=>x*budget.pigment);
  return {budget,grams,hex:linearHex(predict(grams,budget.white)),delta:Math.sqrt(score)};
}

export function weighRecipe(budget,palette,grams,dilutions){
  if(palette.length!==grams.length||grams.length!==dilutions.length||grams.some(x=>!Number.isFinite(x)||x<0)||Math.abs(grams.reduce((s,v)=>s+v,0)-budget.pigment)>0.00001)throw new Error("Pigment gramajları toplam pigment bütçesini tutmalı.");
  let carry=0;
  const lines=palette.flatMap((p,i)=>{if(!grams[i])return [];const d=dilutions[i];if(!Number.isFinite(d)||d<=0||d>100)throw new Error("Açılım oranı geçersiz.");const weight=grams[i]*100/d;carry+=weight-grams[i];return [{name:p.name,productId:p.id,pure:grams[i],dilution:d,weight}];});
  const clear=budget.clear-carry;if(clear<-0.000001)throw new Error("Açılım taşıyıcısı şeffaf bütçesini aşıyor.");
  return {lines,clear:Math.max(0,clear),white:budget.white,carry};
}
