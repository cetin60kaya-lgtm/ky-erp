(()=>{
  const NOTE_NOTIFY_PREFIX="kyerp-note-reminder-v1:";
  let runtime=null;
  let notes=[];
  let chatUsers=[];
  let selectedPeer=null;
  let loading=false;
  let reminderTimer=null;
  const q=(selector)=>document.querySelector(selector);
  const dateText=(value)=>{if(!value)return"-";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString("tr-TR")};
  const localDateTime=(value)=>{if(!value)return"";const d=new Date(value);if(Number.isNaN(d.getTime()))return"";const off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,16)};
  const roleText=(value)=>({SUPER_ADMIN:"Süper Yönetici",ADMIN:"Süper Yönetici",COMPANY_ADMIN:"Firma Sahibi",MUHASEBE:"Muhasebe",DESEN:"Desen",IMALAT:"İmalat",BOYAHANE:"Boyahane",IK:"İK",DENETIM:"Denetim",VIEWER:"Kullanıcı"})[String(value||"").toUpperCase()]||String(value||"Kullanıcı").replaceAll("_"," ");
  function toast(message){runtime?.toast?.(message)}
  function reminderKey(note){return NOTE_NOTIFY_PREFIX+String(note?.id||"")+":"+String(note?.remindAt||"")}
  function updateNoteCount(){const due=notes.filter((n)=>n.due&&!n.done).length;const el=q("#noteDueCount");if(el)el.textContent=String(due)}
  async function notifyDueNotes(){
    if(!("Notification" in window)||Notification.permission!=="granted")return;
    for(const note of notes){
      if(!note?.due||note?.done||!note?.remindAt)continue;
      const key=reminderKey(note);if(localStorage.getItem(key)==="1")continue;
      localStorage.setItem(key,"1");
      try{
        const reg=await navigator.serviceWorker?.ready;
        if(reg)await reg.showNotification(note.title||"KY ERP · Hatırlatma",{body:note.body||"Not hatırlatma zamanı geldi.",tag:"kyerp-note-"+note.id,renotify:false,icon:"/guvenlik/kyerp-security-icon.svg",badge:"/guvenlik/kyerp-security-icon.svg",data:{openNotes:true}});
        else new Notification(note.title||"KY ERP · Hatırlatma",{body:note.body||"Not hatırlatma zamanı geldi."});
      }catch{}
    }
  }
  function renderNotes(){
    const list=q("#noteList");if(!list)return;list.replaceChildren();updateNoteCount();
    if(!notes.length){const empty=document.createElement("div");empty.className="workspace-empty";empty.textContent="Henüz not yok. Yeni Not ile kişisel not veya hatırlatma ekleyebilirsiniz.";list.appendChild(empty);return}
    for(const note of notes){
      const card=document.createElement("article");card.className="note-item"+(note.done?" is-done":"")+(note.due&&!note.done?" is-due":"");
      const head=document.createElement("div");head.className="note-item-head";
      const copy=document.createElement("div");const title=document.createElement("strong");title.textContent=note.title||"Not";const meta=document.createElement("small");meta.textContent=note.remindAt?`Hatırlatma: ${dateText(note.remindAt)}`:"Hatırlatma yok";copy.append(title,meta);
      const state=document.createElement("span");state.className="note-state";state.textContent=note.done?"Tamam":note.due?"Hatırlatma":"Aktif";head.append(copy,state);
      const body=document.createElement("p");body.textContent=note.body||"";
      const actions=document.createElement("div");actions.className="workspace-actions";
      const done=document.createElement("button");done.type="button";done.textContent=note.done?"Geri Aç":"Tamamla";done.addEventListener("click",()=>updateNote(note,{done:!note.done}));
      const edit=document.createElement("button");edit.type="button";edit.textContent="Düzenle";edit.addEventListener("click",()=>openNote(note));
      const del=document.createElement("button");del.type="button";del.className="danger";del.textContent="Sil";del.addEventListener("click",()=>deleteNote(note));
      actions.append(done,edit,del);card.append(head,body,actions);list.appendChild(card);
    }
  }
  async function loadNotes(showError=false){
    if(!runtime||loading)return;loading=true;
    try{const res=await runtime.deviceFetch("/auth/push/device/workspace/notes");notes=Array.isArray(res?.data?.items)?res.data.items:[];renderNotes();await notifyDueNotes()}
    catch(error){if(showError)toast(error?.message||"Notlar alınamadı.")}
    finally{loading=false}
  }
  function openNote(note=null){
    const form=q("#noteForm");if(!form)return;form.classList.remove("hidden");q("#noteId").value=note?.id||"";q("#noteTitle").value=note?.title||"";q("#noteBody").value=note?.body||"";q("#noteRemindAt").value=localDateTime(note?.remindAt||"");q("#noteTitle")?.focus();
  }
  function closeNote(){q("#noteForm")?.classList.add("hidden");q("#noteId").value="";q("#noteTitle").value="";q("#noteBody").value="";q("#noteRemindAt").value=""}
  async function saveNote(event){
    event.preventDefault();if(!runtime)return;
    const id=q("#noteId").value;const title=q("#noteTitle").value.trim();const body=q("#noteBody").value.trim();const raw=q("#noteRemindAt").value;const remindAt=raw?new Date(raw).toISOString():"";
    if(!title&&!body)return toast("Not başlığı veya içeriği gir.");
    if(remindAt&&"Notification" in window&&Notification.permission==="default"){try{await Notification.requestPermission()}catch{}}
    const path=id?`/auth/push/device/workspace/notes/${encodeURIComponent(id)}`:"/auth/push/device/workspace/notes";
    try{await runtime.deviceFetch(path,{method:id?"PATCH":"POST",body:{title,body,remindAt}});closeNote();toast(id?"Not güncellendi.":"Not kaydedildi.");await loadNotes(true)}
    catch(error){toast(error?.message||"Not kaydedilemedi.")}
  }
  async function updateNote(note,patch){try{await runtime.deviceFetch(`/auth/push/device/workspace/notes/${encodeURIComponent(note.id)}`,{method:"PATCH",body:patch});await loadNotes(true)}catch(error){toast(error?.message||"Not güncellenemedi.")}}
  async function deleteNote(note){if(!confirm("Bu not silinsin mi?"))return;try{await runtime.deviceFetch(`/auth/push/device/workspace/notes/${encodeURIComponent(note.id)}`,{method:"DELETE"});toast("Not silindi.");await loadNotes(true)}catch(error){toast(error?.message||"Not silinemedi.")}}

  function renderChatUsers(){
    const box=q("#chatUsers");if(!box)return;box.replaceChildren();
    if(!chatUsers.length){const empty=document.createElement("div");empty.className="workspace-empty";empty.textContent="Mesajlaşılacak aktif kullanıcı bulunamadı.";box.appendChild(empty);return}
    for(const user of chatUsers){
      const b=document.createElement("button");b.type="button";b.className="chat-user"+(selectedPeer?.id===user.id?" active":"");
      const name=document.createElement("strong");name.textContent=user.fullName||user.username;const meta=document.createElement("small");meta.textContent=`${roleText(user.role)} · ${user.mainCompanySlug||"-"}`;
      const last=document.createElement("span");last.textContent=user.lastMessage||"";b.append(name,meta,last);
      if(Number(user.unread||0)>0){const badge=document.createElement("i");badge.textContent=String(user.unread);b.appendChild(badge)}
      b.addEventListener("click",()=>selectPeer(user));box.appendChild(b);
    }
    const unread=chatUsers.reduce((sum,row)=>sum+Number(row.unread||0),0);const count=q("#chatUnreadCount");if(count)count.textContent=String(unread)
  }
  async function loadChatUsers(showError=false){
    if(!runtime)return;
    try{const res=await runtime.deviceFetch("/auth/push/device/workspace/chat/users");chatUsers=Array.isArray(res?.data?.items)?res.data.items:[];if(selectedPeer){selectedPeer=chatUsers.find((u)=>u.id===selectedPeer.id)||selectedPeer}renderChatUsers()}
    catch(error){if(showError)toast(error?.message||"Kullanıcı listesi alınamadı.")}
  }
  async function selectPeer(user){selectedPeer=user;renderChatUsers();q("#chatPeer").textContent=`${user.fullName||user.username} · ${roleText(user.role)}`;q("#chatMessage").disabled=false;q("#chatSendButton").disabled=false;await loadMessages(true)}
  async function loadMessages(showError=false){
    const box=q("#chatMessages");if(!runtime||!selectedPeer||!box)return;
    try{
      const res=await runtime.deviceFetch(`/auth/push/device/workspace/chat/messages?with=${encodeURIComponent(selectedPeer.id)}&limit=100`);const rows=Array.isArray(res?.data?.items)?res.data.items:[];
      box.replaceChildren();for(const row of rows){const item=document.createElement("article");const mine=String(row.senderUserId||"")!==String(selectedPeer.id);item.className="chat-message "+(mine?"mine":"theirs");const text=document.createElement("p");text.textContent=row.message||"";const meta=document.createElement("small");meta.textContent=dateText(row.createdAt);item.append(text,meta);box.appendChild(item)}box.scrollTop=box.scrollHeight;await loadChatUsers(false);
    }catch(error){if(showError)toast(error?.message||"Mesajlar alınamadı.")}
  }
  async function sendMessage(event){
    event.preventDefault();if(!runtime||!selectedPeer)return;const input=q("#chatMessage");const message=input.value.trim();if(!message)return;
    const button=q("#chatSendButton");button.disabled=true;
    try{await runtime.deviceFetch("/auth/push/device/workspace/chat/messages",{method:"POST",body:{toUserId:selectedPeer.id,message}});input.value="";await loadMessages(true)}
    catch(error){toast(error?.message||"Mesaj gönderilemedi.")}
    finally{button.disabled=false}
  }
  async function refreshWorkspace(tab){
    if(tab==="notes")await loadNotes(true);
    if(tab==="chat"){await loadChatUsers(true);if(selectedPeer)await loadMessages(false)}
  }
  function bind(){
    runtime=window.KYSecurityRuntime||null;if(!runtime)return;
    q("#newNoteButton")?.addEventListener("click",()=>openNote());
    q("#cancelNoteButton")?.addEventListener("click",closeNote);
    q("#noteForm")?.addEventListener("submit",saveNote);
    q("#chatRefreshButton")?.addEventListener("click",async()=>{await loadChatUsers(true);if(selectedPeer)await loadMessages(true)});
    q("#chatForm")?.addEventListener("submit",sendMessage);
    window.addEventListener("kysecurity:tab",(event)=>refreshWorkspace(event.detail?.tab||""));
    navigator.serviceWorker?.addEventListener?.("message",(event)=>{if(event.data?.type==="KYERP_SECURITY_PUSH_WAKE"){loadChatUsers(false);if(selectedPeer)loadMessages(false);loadNotes(false)}});
    window.addEventListener("focus",()=>{const tab=document.querySelector(".security-tabs button.active")?.dataset?.tab||"";refreshWorkspace(tab)});
    reminderTimer=setInterval(()=>loadNotes(false),60000);
    loadNotes(false);loadChatUsers(false);
  }
  if(window.KYSecurityRuntime)bind();else window.addEventListener("kysecurity:runtime-ready",bind,{once:true});
  window.addEventListener("beforeunload",()=>{if(reminderTimer)clearInterval(reminderTimer)});
})();