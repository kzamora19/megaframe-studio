/* STAGING ONLY — Central encrypted Google Drive backups belonging to
 * the approved First Megasaver owner. Staff authorize solely with PTG.
 * This script NEVER receives or stores the owner's Google OAuth credentials. */
(()=>{"use strict";
  const $=id=>document.getElementById(id);
  let state=null,working=false,generation=0,items=[];
  const say=message=>{if($("driveMessage"))$("driveMessage").textContent=String(message);};
  function paint(){
    for(const id of ["driveBackup","driveRefresh","driveRestore"])
      if($(id))$(id).disabled=!state||working;
  }
  async function localProjects(){
    const select=$("driveLocalProject");if(!select)return;
    select.replaceChildren();
    if(state?.studio!=="megaframe")return;
    const projects=await state.vault["project-list"]();
    for(const p of projects){
      const option=document.createElement("option");
      option.value=p.id;option.textContent=p.name||p.id;select.append(option);
    }
  }
  function localId(){return state.studio==="megaframe"?$("driveLocalProject")?.value:"p:current";}
  function fillRemote(){
    const select=$("driveRemoteProject");if(!select)return;
    select.replaceChildren();
    for(const r of items){
      const option=document.createElement("option");
      option.value=r.fileId;
      option.textContent=r.recordKey+" · "+(r.modifiedTime?
        new Date(r.modifiedTime).toLocaleDateString():"Encrypted backup");
      select.append(option);
    }
  }
  async function ask(operation,fields={}){
    if(!state)throw Error("PTG Studio is no longer active.");
    const result=await state.request(operation,fields);
    if(!state)throw Error("PTG session ended.");
    if(!result||result.status!=="ok"){
      if(result?.status==="not_configured")
        throw Error("Central Drive needs one-time owner Google authorization. Contact System Admin.");
      throw Error(result?.status==="denied"?
        "PTG account or encrypted project is not authorized.":
        "Google Drive backup service is unavailable. Local projects are unchanged.");
    }
    return result;
  }
  async function refresh(){
    await localProjects();
    const result=await ask("list");items=result.items||[];fillRemote();
    say(items.length+" encrypted project backup(s) in the owner-managed Google Drive."+
      (result.hasMore?" Showing the most recent 100.":""));
  }
  async function backup(){
    const key=localId();
    if(!key)throw Error("Save and select a named project first.");
    const item=state.studio==="megaframe"?
      await state.vault["cloud-export"](key):
      await state.vault.cloudExport(key);
    if(!item)throw Error("Save the project locally before backing it up.");
    if(!window.confirm("Back up this encrypted project to the company's Google Drive? Customer photos may be included. No other project is overwritten."))return;
    await ask("write",{recordKey:key,iv:item.iv,encrypted:item.encrypted});
    await refresh();
    say("Encrypted backup saved in company Google Drive. Local projects are unchanged.");
  }
  async function restore(){
    const selected=items.find(x=>x.fileId===$("driveRemoteProject")?.value);
    if(!selected)throw Error("Select a Drive backup to retrieve.");
    const key=selected.recordKey;
    const existing=state.studio==="megaframe"?
      await state.vault["project-read"](key):
      await state.vault.read(key);
    if(existing&&!window.confirm("Replace the local version of this project with the selected encrypted company Drive backup?"))return;
    const result=await ask("read",{recordKey:key,fileId:selected.fileId});
    if(!result.record)throw Error("Encrypted Google Drive backup is missing.");
    if(state.studio==="megaframe")
      await state.vault["cloud-import"](key,result.record);
    else await state.vault.cloudImport(key,result.record);
    say("Encrypted project retrieved. Reopen it from the Studio's saved-project controls.");
  }
  async function run(fn){
    if(!state||working)return;
    working=true;paint();
    try{await fn();}catch(e){say(e?.message||"Company Drive operation failed.");}
    finally{working=false;paint();}
  }
  async function setup(context){
    if(!context||!["flyer","megaframe"].includes(context.studio)||
       !context.vault||typeof context.request!=="function")
      throw Error("Invalid protected company Drive setup.");
    const version=++generation;
    state=context;items=[];working=false;
    if($("drivePanel"))$("drivePanel").hidden=false;
    if($("driveLocalWrap"))$("driveLocalWrap").hidden=context.studio!=="megaframe";
    // Owner credentials are intentionally not accepted by any frontend control.
    if($("driveConnect"))$("driveConnect").hidden=true;
    if($("driveDisconnect"))$("driveDisconnect").hidden=true;
    $("driveRefresh").onclick=()=>run(refresh);
    $("driveBackup").onclick=()=>run(backup);
    $("driveRestore").onclick=()=>run(restore);
    await localProjects();
    if(version!==generation)return;
    paint();
    say("Company Google Drive • encrypted backup. PTG login only; owner setup required once.");
  }
  function lock(){
    generation++;state=null;items=[];working=false;
    if($("drivePanel"))$("drivePanel").hidden=true;paint();
  }
  window.BRANCHLINE_CENTRAL_DRIVE=Object.freeze({setup,lock});
})();