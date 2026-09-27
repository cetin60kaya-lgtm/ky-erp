(()=>{
  const REVISION="security-ui-final-20260923";
  let confirmPassThrough=false;
  let lastAutoRepairAt=0;

  function runtime(){return window.KYSecurityRuntime||null}
  function isStandalone(){return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true)}
  function toast(message){try{runtime()?.toast?.(message)}catch{}}

  function ensureConfirmButton(card){
    const actions=card?.querySelector?.(".approval-actions");
    if(!actions)return null;
    let confirm=actions.querySelector(".number-confirm");
    if(!confirm){
      confirm=document.createElement("button");
      confirm.type="button";
      confirm.className="approve number-confirm";
      confirm.textContent="Onayla";
      confirm.disabled=true;
      const deny=actions.querySelector(".deny");
      actions.insertBefore(confirm,deny||null);
    }
    return confirm;
  }

  function selectMatch(button){
    const card=button.closest(".approval-item");
    if(!card)return;
    card.querySelectorAll(".approval-number-options [data-match]").forEach((item)=>item.classList.remove("selected","wrong"));
    button.classList.add("selected");
    card.dataset.selectedMatch=String(button.dataset.match||"");
    const confirm=ensureConfirmButton(card);
    if(confirm){confirm.disabled=false;confirm.textContent="Onayla"}
    toast("Rakam seçildi. Girişi tamamlamak için Onayla'ya bas.");
  }

  function confirmMatch(button){
    const card=button.closest(".approval-item");
    const selected=String(card?.dataset?.selectedMatch||"");
    if(!selected){toast("Önce bilgisayarda gördüğün rakamı seç.");return}
    const target=Array.from(card.querySelectorAll(".approval-number-options [data-match]")).find((item)=>String(item.dataset.match||"")===selected);
    if(!target){toast("Seçilen rakam bulunamadı. Tekrar seç.");return}
    button.disabled=true;
    button.textContent="Onaylanıyor…";
    confirmPassThrough=true;
    target.click();
    setTimeout(()=>{
      if(document.contains(button)){
        button.disabled=false;
        button.textContent="Onayla";
      }
    },1400);
  }

  document.addEventListener("click",(event)=>{
    const numberButton=event.target?.closest?.(".approval-number-options [data-match]");
    if(numberButton){
      if(confirmPassThrough){confirmPassThrough=false;return}
      event.preventDefault();
      event.stopImmediatePropagation();
      selectMatch(numberButton);
      return;
    }
    const confirmButton=event.target?.closest?.(".number-confirm");
    if(confirmButton){
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmMatch(confirmButton);
    }
  },true);

  function needsRepair(){
    const badge=String(document.querySelector("#connectionBadge")?.textContent||"").trim();
    return /Yenileme gerekli|Bağlantı kontrolü gerekli|Bağlantı yok|Yenile$/i.test(badge);
  }

  function autoRepair(){
    if(!isStandalone()||!navigator.onLine||!needsRepair())return;
    if(Date.now()-lastAutoRepairAt<30000)return;
    const appPanel=document.querySelector("#appPanel");
    const setupPanel=document.querySelector("#setupPanel");
    const button=document.querySelector("#repairButton");
    if(!button||button.disabled||appPanel?.classList.contains("hidden")||!setupPanel?.classList.contains("hidden"))return;
    lastAutoRepairAt=Date.now();
    button.click();
  }

  window.addEventListener("online",()=>setTimeout(autoRepair,500));
  window.addEventListener("focus",()=>setTimeout(autoRepair,700));
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")setTimeout(autoRepair,700)});
  window.addEventListener("kysecurity:runtime-ready",()=>{setTimeout(autoRepair,1200);setTimeout(autoRepair,8000)});
  navigator.serviceWorker?.addEventListener?.("message",()=>setTimeout(autoRepair,900));

  document.documentElement.dataset.kySecurityUiRevision=REVISION;
})();