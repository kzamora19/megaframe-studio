/* DEVELOPMENT ONLY — optional encrypted Google Drive project backups.
 * Runs in the trusted, PTG-verified Studio launcher, NEVER in the opaque editor.
 * Google OAuth access tokens stay in memory. No automatic customer photo upload.
 * Google Drive is additive; normal Supabase project saving is unaffected. */
(() => {
  "use strict";
  const DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
  const API="https://www.googleapis.com/drive/v3/files";
  const UPLOAD="https://www.googleapis.com/upload/drive/v3/files";
  const FOLDER="Branchline Studio Backups";
  const FORMAT="BranchlineStudioDriveBackupV1";
  const MAX_FILE_BYTES=150*1024*1024;
  const ID=/^[A-Za-z0-9_-]{8,}$/;
  const CLIENT=/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
  const OWNER=/^[A-Za-z0-9_-]{43}$/;
  let context=null,token="",tokenUntil=0,controller=null,connectClient=null;
  let driveFiles=[],folderId="";
  const el=id=>document.getElementById(id);
  const note=value=>{if(el("driveMessage"))el("driveMessage").textContent=String(value);};
  const enabled=()=>!!context&&!!token&&Date.now()<tokenUntil;
  function paint(){
    const connected=enabled();
    for(const name of ["driveBackup","driveRestore","driveRefresh"])
      if(el(name))el(name).disabled=!connected;
    if(el("driveConnect"))el("driveConnect").hidden=connected;
    if(el("driveDisconnect"))el("driveDisconnect").hidden=!connected;
    if(el("driveDisconnect"))el("driveDisconnect").disabled=false;
    if(el("driveConnect"))el("driveConnect").disabled=false;
  }
  function clear(){
    if(controller)controller.abort();
    controller=new AbortController();
    token="";tokenUntil=0;driveFiles=[];folderId="";connectClient=null;
    paint();
  }
  function disconnect(){
    const previous=token;
    clear();
    if(previous&&window.google?.accounts?.oauth2?.revoke)
      try{window.google.accounts.oauth2.revoke(previous,()=>{});}catch{/* cleared already */}
    note("Disconnected. Existing Google Drive backups were not deleted.");
  }
  function ensure(){
    if(!context)throw Error("Protected Studio is not active.");
    if(!enabled())throw Error("Connect Google Drive again. Authorization expires after this session.");
  }
  async function verify(){
    ensure();
    await context.verify(); // Fresh one-use P-256 PTG proof, including revocation check.
    ensure();
  }
  function connect(){
    if(!context||!CLIENT.test(context.clientId)){
      note("Google Drive OAuth Web Client ID is missing or invalid.");return;
    }
    if(!window.google?.accounts?.oauth2?.initTokenClient){
      // Load on demand; on browsers that block delayed popups, click Connect again.
      note("Preparing Google's authorization service. Select Connect again when ready.");
      const script=document.createElement("script");
      script.src="https://accounts.google.com/gsi/client";
      script.async=true;script.onload=()=>note("Google authorization is ready. Select Connect Google Drive.");
      script.onerror=()=>note("Google sign-in could not load. Check your connection.");
      document.head.append(script);return;
    }
    const selected=context;
    connectClient=window.google.accounts.oauth2.initTokenClient({
      client_id:selected.clientId,scope:DRIVE_SCOPE,include_granted_scopes:false,
      callback:response=>{
        if(context!==selected)return;
        if(!response?.access_token||response.scope&&!response.scope.split(" ").includes(DRIVE_SCOPE)){
          note("Google Drive permission was not granted.");return;
        }
        token=response.access_token;
        tokenUntil=Date.now()+Math.max(0,Number(response.expires_in||3600)-60)*1000;
        folderId="";driveFiles=[];paint();
        note("Connected to Google Drive for this session. Backups require manual confirmation.");
      },
      error_callback:e=>note(e?.type==="popup_failed_to_open"?
        "Allow popups for the Studio website and try Connect again.":
        "Google Drive connection was cancelled or blocked.")
    });
    connectClient.requestAccessToken({prompt:"consent"});
  }
  async function request(url,options={}){
    ensure();
    const headers={Authorization:"Bearer "+token,...options.headers};
    let response;
    try{
      response=await fetch(url,{method:options.method||"GET",headers,body:options.body,
        signal:controller.signal,credentials:"omit",cache:"no-store",redirect:"error",
        referrerPolicy:"no-referrer"});
    }catch(e){
      if(e?.name==="AbortError")throw Error("Google Drive operation cancelled because Studio access ended.");
      throw Error("Could not connect to Google Drive. Your local project is unchanged.");
    }
    if(!response.ok){
      if(response.status===401){clear();throw Error("Google Drive authorization expired. Reconnect.");}
      if(response.status===403)throw Error("Google Drive denied this operation. Check Google Drive API and drive.file consent.");
      throw Error("Google Drive returned HTTP "+response.status+". No local projects were changed.");
    }
    return response;
  }
  const path=params=>API+"?"+new URLSearchParams(params);
  const safeQ=x=>String(x).replaceAll("\\","\\\\").replaceAll("'","\\'");
  async function getFolder(create){
    if(folderId)return folderId;
    const q="name = '"+safeQ(FOLDER)+"' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false";
    const list=await (await request(path({q,fields:"files(id,name),nextPageToken",pageSize:"100"}))).json();
    const found=(list.files||[]).find(f=>ID.test(f.id)&&f.name===FOLDER);
    if(found){folderId=found.id;return folderId;}
    if(!create)return "";
    const metadata={name:FOLDER,mimeType:"application/vnd.google-apps.folder",parents:["root"]};
    const made=await(await request(API+"?fields=id,name",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(metadata)
    })).json();
    if(!ID.test(made.id||""))throw Error("Drive did not create the backup folder.");
    folderId=made.id;return folderId;
  }
  async function scopeHash(scope){
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(scope));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
  }
  async function files(){
    await verify();
    const folder=await getFolder(false);
    if(!folder){driveFiles=[];return [];}
    const q="'"+safeQ(folder)+"' in parents and trashed = false and mimeType = 'application/json'"+
      " and appProperties has {key='branchline' and value='studio-backup-v1'}"+
      " and appProperties has {key='studio' and value='"+context.studio+"'}"+
      " and appProperties has {key='ownerScope' and value='"+context.ownerScope+"'}";
    const listing=await(await request(path({q,fields:"nextPageToken,files(id,name,size,modifiedTime,mimeType,appProperties)",
      orderBy:"modifiedTime desc",pageSize:"100"}))).json();
    driveFiles=(listing.files||[]).filter(f=>ID.test(f.id||"")&&
      f.appProperties?.branchline==="studio-backup-v1"&&
      f.appProperties?.studio===context.studio&&
      f.appProperties?.ownerScope===context.ownerScope);
    if(listing.nextPageToken)note("Showing the latest 100 Google Drive backups.");
    return driveFiles;
  }
  function localId(){
    if(context.studio==="flyer")return "p:current";
    return el("driveLocalProject")?.value||"";
  }
  async function projectExport(id){
    if(!id)throw Error("Choose a named local project first.");
    const envelope=context.studio==="megaframe"?
      await context.vault["cloud-export"](id,{drive:true}):
      await context.vault.cloudExport(id,{drive:true});
    if(!envelope)throw Error("Save your project locally before backing up.");
    return envelope;
  }
  async function projectImport(id,envelope){
    if(context.studio==="megaframe")
      return context.vault["cloud-import"](id,envelope,{drive:true});
    return context.vault.cloudImport(id,envelope,{drive:true});
  }
  async function renderLocal(){
    const target=el("driveLocalProject");
    if(!target||context.studio!=="megaframe")return;
    const projects=await context.vault["project-list"]();
    target.replaceChildren();
    for(const item of projects){
      const opt=document.createElement("option");opt.value=item.id;
      opt.textContent=item.name||item.id;target.append(opt);
    }
  }
  function renderRemote(){
    const target=el("driveRemoteProject");if(!target)return;
    target.replaceChildren();
    for(const f of driveFiles){
      const o=document.createElement("option");o.value=f.id;
      const date=f.modifiedTime?new Date(f.modifiedTime).toLocaleDateString():"";
      o.textContent=(f.appProperties?.recordKey||f.name||"Encrypted project")+" · "+date;
      target.append(o);
    }
  }
  async function refresh(){
    await renderLocal();
    await files();
    renderRemote();
    note(driveFiles.length+" encrypted Google Drive backup(s). No photos are uploaded automatically.");
  }
  async function backup(){
    await verify();
    const recordKey=localId(),envelope=await projectExport(recordKey);
    const title=context.studio==="megaframe"?"the selected MegaFrame project":"the current MegaFlyer project";
    if(!window.confirm("Back up "+title+" to YOUR Google Drive? This encrypted backup may contain imported customer photos. Upload only with appropriate permission."))return;
    await verify();
    const payload={format:FORMAT,studio:context.studio,recordKey,
      ownerScope:context.ownerScope,createdAt:new Date().toISOString(),
      iv:envelope.iv,encrypted:envelope.encrypted};
    const body=new Blob([JSON.stringify(payload)],{type:"application/json"});
    if(body.size>MAX_FILE_BYTES)throw Error("Encrypted project exceeds the 150 MB Google Drive backup limit.");
    const parent=await getFolder(true);
    // Create a new, immutable backup. Never silently overwrite or delete older revisions.
    const filename="Branchline-"+context.studio+"-encrypted-"+Date.now()+".json";
    const metadata={name:filename,mimeType:"application/json",parents:[parent],
      description:"Manual AES-GCM encrypted Branchline Studio project backup",
      appProperties:{branchline:"studio-backup-v1",studio:context.studio,
        ownerScope:context.ownerScope,recordKey}};
    // Resumable upload supports photo-heavy projects and keeps editor bytes private.
    const start=await request(UPLOAD+"?uploadType=resumable&fields=id,name",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-Upload-Content-Type":"application/json","X-Upload-Content-Length":String(body.size)},
      body:JSON.stringify(metadata)
    });
    const location=start.headers.get("Location")||"";
    if(!/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files(?:\?|\/)/.test(location))
      throw Error("Google Drive did not provide a secure upload session. Retry without changing the local project.");
    await request(location,{method:"PUT",headers:{"Content-Type":"application/json"},body});
    await refresh();
    note("Encrypted Google Drive backup created. Previous versions and local projects are unchanged.");
  }
  async function restore(){
    await verify();
    const fileId=el("driveRemoteProject")?.value;
    const f=driveFiles.find(f=>f.id===fileId);
    if(!f)throw Error("Choose a Google Drive backup to retrieve.");
    const recordKey=f.appProperties.recordKey;
    if(context.studio==="megaframe"&&!/^project_[A-Za-z0-9_-]{2,100}$/.test(recordKey)&&
       !/^recovery_(?:[0-9]{10,16}|unknown)$/.test(recordKey))
      throw Error("Invalid MegaFrame project ID in Google Drive.");
    if(context.studio==="flyer"&&recordKey!=="p:current")
      throw Error("Invalid MegaFlyer backup ID.");
    const current=context.studio==="megaframe"?
      await context.vault["project-read"](recordKey):await context.vault.read(recordKey);
    if(current&&!window.confirm("Replace the local version of this project with the selected Google Drive backup? Your other projects will be kept."))return;
    await verify();
    const detail=await(await request(API+"/"+encodeURIComponent(fileId)+"?fields=id,mimeType,trashed,size,appProperties")).json();
    if(detail.trashed||detail.mimeType!=="application/json"||
       detail.appProperties?.studio!==context.studio||
       detail.appProperties?.ownerScope!==context.ownerScope||
       detail.appProperties?.recordKey!==recordKey||
       Number(detail.size||0)>MAX_FILE_BYTES)throw Error("The selected backup failed ownership or size checks.");
    const response=await request(API+"/"+encodeURIComponent(fileId)+"?alt=media");
    if(Number(response.headers.get("content-length")||0)>MAX_FILE_BYTES)
      throw Error("Google Drive backup is too large.");
    const blob=await response.blob();
    if(blob.size>MAX_FILE_BYTES)throw Error("Google Drive backup exceeds 150 MB.");
    let payload;
    try{payload=JSON.parse(await blob.text());}catch{throw Error("Google Drive backup JSON is invalid.");}
    if(payload?.format!==FORMAT||payload.studio!==context.studio||
       payload.ownerScope!==context.ownerScope||payload.recordKey!==recordKey||
       typeof payload.iv!=="string"||typeof payload.encrypted!=="string")
      throw Error("This is not a valid encrypted backup belonging to this PTG account.");
    await verify();
    await projectImport(recordKey,{iv:payload.iv,encrypted:payload.encrypted});
    note("Encrypted backup restored to local projects. Reopen the project in the Studio editor.");
  }
  async function action(fn){
    for(const b of el("drivePanel")?.querySelectorAll("button")||[])b.disabled=true;
    try{await fn();}catch(error){note(error?.message||"Google Drive operation failed.");}
    finally{paint();}
  }
  async function setup(input){
    if(!input||!["megaframe","flyer"].includes(input.studio)||
       !OWNER.test(input.scope)||typeof input.verify!=="function"||!input.vault)
      throw Error("Invalid PTG account Google Drive configuration.");
    clear();
    context={...input,ownerScope:await scopeHash(input.scope)};
    if(el("driveLocalWrap"))el("driveLocalWrap").hidden=input.studio!=="megaframe";
    if(el("drivePanel"))el("drivePanel").hidden=false;
    el("driveConnect").onclick=connect;
    el("driveDisconnect").onclick=disconnect;
    el("driveRefresh").onclick=()=>action(refresh);
    el("driveBackup").onclick=()=>action(backup);
    el("driveRestore").onclick=()=>action(restore);
    await renderLocal();
    note("Optional Google Drive backups. Connect, then choose a project and back up manually.");
    paint();
  }
  function lock(){
    clear();context=null;
    if(el("drivePanel"))el("drivePanel").hidden=true;
  }
  window.BRANCHLINE_GOOGLE_DRIVE_BACKUP=Object.freeze({setup,lock});
})();