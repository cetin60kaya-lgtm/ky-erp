(()=>{
  const copy="Yeni cihaz kaydı ve yeniden bağlama yalnız Yedek Kod + Admin Şifresi birlikte doğrulandığında tamamlanır.";
  function setLabelText(label,text){
    if(!label)return;
    const node=Array.from(label.childNodes||[]).find((item)=>item.nodeType===Node.TEXT_NODE);
    if(node)node.nodeValue=`${text}\n        `;
  }
  function enforceUi(){
    const details=document.querySelector("#manualLinkDetails");
    details?.classList.remove("hidden");
    if(details)details.open=true;
    const summary=details?.querySelector("summary");
    if(summary)summary.textContent="Yedek Kod";
    setLabelText(details?.querySelector("label"),"Yedek Kod");
    setLabelText(document.querySelector("#passwordLabel"),"Admin Şifresi");
    const setupCopy=document.querySelector("#setupCopy");
    if(setupCopy)setupCopy.textContent=copy;
    const button=document.querySelector("#connectButton");
    if(button&&!button.disabled)button.textContent="Yedek Kod + Admin Şifresi ile Bağla";
  }
  function wrap(name){
    const original=window[name];
    if(typeof original!=="function")return;
    window[name]=function(...args){
      const result=original.apply(this,args);
      queueMicrotask(enforceUi);
      return result;
    };
  }
  document.addEventListener("click",(event)=>{
    const button=event.target?.closest?.("#connectButton");
    if(!button)return;
    const code=String(document.querySelector("#enrollmentCode")?.value||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    const password=String(document.querySelector("#password")?.value||"");
    if(!code||!password){
      event.preventDefault();
      event.stopImmediatePropagation();
      const target=!code?document.querySelector("#enrollmentCode"):document.querySelector("#password");
      target?.focus?.();
      const message=!code?"Yedek kodu gir.":"Admin şifresini gir.";
      if(typeof window.toast==="function")window.toast(message);
      else target?.setCustomValidity?.(message);
    }
  },true);
  wrap("showRelink");
  wrap("showSetupStart");
  enforceUi();
  queueMicrotask(enforceUi);
  setTimeout(enforceUi,0);
  setTimeout(enforceUi,400);
  window.addEventListener("load",enforceUi,{once:true});
})();
