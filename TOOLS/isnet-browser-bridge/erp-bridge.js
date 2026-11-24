/* Only the trusted KY ERP page can request fixed portal operations. */
(()=>{
const origin=location.origin;
if(!["https://kyerp.net","https://app.kyerp.net"].includes(origin)||window.top!==window)return;
window.addEventListener("message",async e=>{
 if(e.source!==window||e.origin!==origin||e.data?.channel!=="KYERP_ISNET_BROWSER_V2"||e.data?.direction!=="request")return;
 const {id,op,payload}=e.data;
 if(typeof id!=="string"||id.length>80||!["status","connect","list","file"].includes(op))return;
 try{const result=await chrome.runtime.sendMessage({type:"KY_ERP_CENTER",op,payload});window.postMessage({channel:"KYERP_ISNET_BROWSER_V2",direction:"response",id,result},origin)}
 catch{window.postMessage({channel:"KYERP_ISNET_BROWSER_V2",direction:"response",id,result:{ok:false,error:"EXTENSION_UNAVAILABLE"}},origin)}
});
})();