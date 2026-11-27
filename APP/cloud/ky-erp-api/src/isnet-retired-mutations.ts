// Historical reads remain available. No legacy provider write or local claim of official success.
const patterns=[
 /^\/api\/isnet\/invoice-preparation\/dispatches\/[^/]+\/draft\/?$/i,
 /^\/api\/isnet\/invoice-drafts\/[^/]+\/(?:verify|final-approval|submit|retry-closure)\/?$/i,
 /^\/api\/isnet\/drafts\/(?:dispatch|invoice)\/?$/i,
 /^\/api\/isnet\/drafts\/[^/]+\/(?:validate|prepare|approve|submit|retry-closure)\/?$/i,
 /^\/api\/isnet\/dispatches\/[^/]+\/create-invoice\/?$/i,
 /^\/api\/isnet\/source-workflow\/[^/]+\/(?:outgoing-dispatch|invoice)\/?$/i,
 /^\/api\/isnet\/source-intakes\/[^/]+\/(?:quantities|outgoing-dispatch\/[^/]+\/complete)\/?$/i,
 /^\/api\/isnet\/auto-flows\/[^/]+\/(?:outgoing-draft|outgoing-document-no|invoice-state)\/?$/i,
 /^\/api\/isnet\/documents\/[^/]+\/complete\/?$/i,
];
export function retiredIsnetMutation(path:string,method:string){
 return !["GET","HEAD","OPTIONS"].includes(method.toUpperCase())&&patterns.some(p=>p.test(path));
}
export const retiredIsnetResponse={ok:false,error:{code:"CANONICAL_EBELGE_REQUIRED",message:"Eski İşNet fatura/sevk işlem yolu kapatıldı. Ortak e-Belge çalışma merkezini kullanın. Önceki kayıtlar korunur; belirsiz gönderim yeniden denenmez.",replacement:"/api/e-belge/operator-drafts"}};
