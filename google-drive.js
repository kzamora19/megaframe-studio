/* MegaFrame Studio – optional Google Drive backup.
 * Uses short-lived Google Identity Services access tokens in RAM only.
 * drive.file permission: only files created/opened by this app.
 * No Supabase changes, no Google password, no persistent OAuth tokens.
 */
'use strict';
(() => {
 const $d = id => document.getElementById('drive-' + id);
 const CONFIG_KEY = 'megaframe_google_oauth_client_id_v1';
 const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
 const API = 'https://www.googleapis.com/drive/v3/files';
 const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
 const FOLDER_NAME = 'MegaFrame Studio';
 const BACKUP_FORMAT = 'MegaFrameDriveBackupV1';
 const MAX_BYTES = 24 * 1024 * 1024;
 const ID_PATTERN = /^[A-Za-z0-9_-]{8,}$/;
 const CLIENT_PATTERN = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
 let token = null, folderId = null, busy = false, backupRows = [], googleScriptPromise = null;
 let connectedClient = '', loading = false;
 const message = value => { $d('status').textContent = String(value); };
 const publicClientId = () => window.megaFrameGoogleDriveConfig?.clientId || '';
 function chosenClientId() {
  try { return (localStorage.getItem(CONFIG_KEY)||publicClientId()).trim(); }
  catch { return publicClientId().trim(); }
 }
 function paint() {
  const connected = !!token;
  $d('connect').hidden = connected;
  $d('disconnect').hidden = !connected;
  $d('backup').disabled = busy || !connected;
  $d('refresh').disabled = busy || !connected;
  $d('connect').disabled = busy;
  $d('save-client').disabled = busy;
  // An upload refreshes the list while busy; re-enable Restore after it finishes.
  for (const button of $d('list').querySelectorAll('button')) button.disabled=busy;
  $d('connection').textContent = connected ?
   'Connected for this session · Drive file access only' : 'Not connected';
  $d('client-id').value = chosenClientId();
 }
 function clearSession() {
  token=null;folderId=null;backupRows=[];connectedClient='';
  $d('list').replaceChildren();
  paint();
 }
 function loadGoogleScript() {
  if (window.google?.accounts?.oauth2?.initTokenClient) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve,reject) => {
   const script=document.createElement('script');
   script.src='https://accounts.google.com/gsi/client';
   script.async=true;script.defer=true;
   script.onload=()=>window.google?.accounts?.oauth2?.initTokenClient ?
    resolve() : reject(Error('Google authorization library unavailable'));
   script.onerror=()=>reject(Error('Google sign-in script could not load. Check your connection or blocker.'));
   document.head.appendChild(script);
  }).catch(error => {googleScriptPromise=null;throw error});
  return googleScriptPromise;
 }
 function connect() {
  if (busy) return;
  const clientId = chosenClientId();
  if (!CLIENT_PATTERN.test(clientId)) {
   message('Google OAuth Web Client ID is not configured. Open Connection settings below.');
   $d('settings').open=true;
   $d('client-id').focus();
   return;
  }
  if (!window.google?.accounts?.oauth2?.initTokenClient) {
   message('Preparing Google sign-in… click Connect again when the library is ready.');
   loadGoogleScript().then(() => message('Google sign-in is ready. Select Connect Google Drive.'))
     .catch(e => message(e.message));
   return;
  }
  const oauth=window.google.accounts.oauth2.initTokenClient({
   client_id:clientId,scope:DRIVE_SCOPE,include_granted_scopes:false,
   callback:response => {
    if (!response?.access_token) {
     message(response?.error_description||'Google authorization was not completed.');
     return;
    }
    if (response.scope && !response.scope.split(' ').includes(DRIVE_SCOPE)) {
     message('The required Drive file permission was not granted.');
     return;
    }
    clearSession();
    token=response.access_token;connectedClient=clientId;
    message('Connected. Your backups are stored in your own Google Drive, not Supabase.');
    paint();
    refreshBackups().catch(e => message(e.message));
   },
   error_callback:error => message(
     error?.type==='popup_failed_to_open'?'Google blocked the sign-in pop-up. Allow pop-ups for this website.':
     'Google authorization was cancelled or could not open.'
   )
  });
  oauth.requestAccessToken({prompt:'consent'});
 }
 function disconnect() {
  const previous=token;
  clearSession();
  if (previous && window.google?.accounts?.oauth2?.revoke) {
   try { window.google.accounts.oauth2.revoke(previous,()=>{}); }
   catch { /* session already cleared */ }
  }
  message('Disconnected. Backups in Google Drive are not deleted.');
 }
 async function driveRequest(url,{method='GET',data,mime='application/json'}={}) {
  if (!token) throw Error('Connect Google Drive to continue.');
  const headers={Authorization:'Bearer '+token};
  if (data!==undefined) headers['Content-Type']=mime;
  let response;
  try {
   response=await fetch(url,{method,headers,body:data,cache:'no-store',credentials:'omit',redirect:'error'});
  }catch{throw Error('Google Drive could not be reached. Check your connection.')}
  if (!response.ok) {
   if (response.status===401) {
    clearSession();
    throw Error('Google authorization expired. Connect again to continue.');
   }
   if (response.status===403)throw Error('Google Drive denied access. Enable Google Drive API and grant drive.file permission.');
   throw Error('Google Drive request failed (HTTP '+response.status+').');
  }
  return response;
 }
 function pathFor(query) {return API+'?'+new URLSearchParams(query);}
 async function listFiles(query) {
  const response=await driveRequest(pathFor(query));
  return response.json();
 }
 async function folder(create=false) {
  if(folderId)return folderId;
  const q="name = '"+FOLDER_NAME+"' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false";
  const result=await listFiles({q,fields:'nextPageToken,files(id,name,mimeType)',pageSize:'30',spaces:'drive'});
  const existing=(result.files||[]).find(x=>x.name===FOLDER_NAME && ID_PATTERN.test(x.id));
  if(existing){folderId=existing.id;return folderId;}
  if(!create)return null;
  const response=await driveRequest(API+'?fields=id,name',{method:'POST',
    data:JSON.stringify({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder',parents:['root']})});
  const made=await response.json();
  if(!ID_PATTERN.test(made.id||''))throw Error('Google Drive did not return a valid folder.');
  folderId=made.id;
  return folderId;
 }
 function currentBackup(includePhotos) {
  if(!app?.frame || !app.template?.data)throw Error('Open or import a frame before creating a backup.');
  const draft=serializeDraft();
  if(!draft)throw Error('No frame is ready for backup.');
  if(!includePhotos){draft.photos=[];draft.selected=-1;draft.mode='map';}
  const record={
   format:BACKUP_FORMAT,kind:includePhotos?'project':'frame',
   createdAt:new Date().toISOString(),containsCustomerPhotos:includePhotos,
   payload:draft
  };
  const json=JSON.stringify(record);
  if(new Blob([json]).size>MAX_BYTES)throw Error('Backup exceeds 24 MB. Reduce imported photos or save a frame-only backup.');
  return {record,json};
 }
 function readableStamp(date) {
  return String(date).replaceAll('-','').replaceAll(':','').replace('T','-').slice(0,15);
 }
 async function uploadBackup({record,json}) {
  const parent=await folder(true);
  const name='MegaFrame-'+record.kind+'-'+readableStamp(record.createdAt)+'.json';
  const metadata={name,mimeType:'application/json',parents:[parent],description:
   record.kind==='project'?'MegaFrame Studio project backup with photos':'MegaFrame Studio frame-only backup'};
  const boundary='mf'+Math.random().toString(36).slice(2)+Date.now();
  const body=new Blob([
   '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
   JSON.stringify(metadata),
   '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
   json,'\r\n--'+boundary+'--\r\n'
  ],{type:'multipart/related; boundary='+boundary});
  const response=await driveRequest(UPLOAD+'?uploadType=multipart&fields=id,name,createdTime',
   {method:'POST',data:body,mime:'multipart/related; boundary='+boundary});
  return response.json();
 }
 async function backup() {
  if(busy||!token)return;
  const includePhotos=$d('photos').checked;
  if(includePhotos && !(await confirmAction(
   'Upload imported photos to Google Drive?',
   'This FULL PROJECT backup includes every imported photo and its adjustments. Customer photos will leave this device and be stored in your personal Google Drive. Continue only if you have permission.',
   'Upload photos to Drive')))return;
  busy=true;paint();message('Preparing backup…');
  try {
   const backupData=currentBackup(includePhotos);
   message('Uploading '+(includePhotos?'full project':'frame template')+' to Google Drive…');
   await uploadBackup(backupData);
   message('Backup saved in your Google Drive / MegaFrame Studio folder.');
   await refreshBackups(true);
  }catch(error){message(error.message||'Could not back up this frame.')}
  finally{busy=false;paint()}
 }
 function backupName(row) {
  const n=String(row.name||'');
  return n.length>130?n.slice(0,130)+'…':n;
 }
 function renderBackups() {
  const list=$d('list');list.replaceChildren();
  if(!token)return;
  if(!backupRows.length){
   const p=document.createElement('p');p.className='help';
   p.textContent='No MegaFrame backups found. Create a frame-only backup to begin.';
   list.appendChild(p);return;
  }
  for(const row of backupRows) {
   const card=document.createElement('article');card.className='driveBackupCard';
   const title=document.createElement('strong');title.textContent=backupName(row);
   const info=document.createElement('small');
   info.textContent=(row.createdTime?new Date(row.createdTime).toLocaleString():'Saved backup')+
     ' · '+(Number(row.size||0)/1048576).toFixed(1)+' MB';
   const button=document.createElement('button');
   button.type='button';button.className='btn small';button.textContent='Restore';
   button.disabled=busy;button.onclick=()=>restoreBackup(row.id);
   card.append(title,info,button);list.append(card);
  }
 }
 async function refreshBackups(silent=false) {
  if(!token)return;
  if(loading)return;
  loading=true;
  if(!silent)message('Checking your Google Drive backups…');
  try{
   const parent=await folder();
   if(!parent){backupRows=[];renderBackups();if(!silent)message('No MegaFrame backups found yet.');return;}
   const q="'"+parent+"' in parents and name contains 'MegaFrame-' and mimeType = 'application/json' and trashed = false";
   const result=await listFiles({q,fields:'nextPageToken,files(id,name,size,createdTime,mimeType)',orderBy:'createdTime desc',pageSize:'100'});
   backupRows=(result.files||[]).filter(x=>ID_PATTERN.test(x.id||'') && /^MegaFrame-(frame|project)-/.test(x.name||''));
   renderBackups();
   if(!silent)message('Found '+backupRows.length+' backup(s).'+(result.nextPageToken?' Showing the latest 100.':''));
  }catch(error){message(error.message||'Could not list Google Drive backups.')}
  finally{loading=false;}
 }
 async function restoreBackup(id) {
  if(!token || !ID_PATTERN.test(id))return;
  const row=backupRows.find(x=>x.id===id);
  if(!row || busy)return;
  if(!(await confirmAction('Restore Google Drive backup?',
    'This restores a saved MegaFrame frame or project into the editor. For a full project, it REPLACES your current imported photo queue. Export or back up unfinished work first.',
    'Restore backup')))return;
  busy=true;paint();message('Downloading backup from Google Drive…');
  try {
   const response=await driveRequest(API+'/'+encodeURIComponent(id)+'?alt=media');
   const reported=Number(response.headers.get('content-length')||0);
   if(reported>MAX_BYTES)throw Error('Backup is over 24 MB and cannot be restored in-browser.');
   const data=await response.text();
   if(new Blob([data]).size>MAX_BYTES)throw Error('This backup is too large.');
   let record;
   try{record=JSON.parse(data)}catch{throw Error('The selected Drive file is not a valid MegaFrame backup.')}
   if(record?.format!==BACKUP_FORMAT || !['frame','project'].includes(record.kind) ||
      record.payload?.format!=='MegaFrameDraftV1' || !record.payload.template) {
    throw Error('This file is not a supported MegaFrame Studio backup.');
   }
   const template=record.payload.template;
   if(typeof template.data!=='string' ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(template.data)) {
    throw Error('Saved frame artwork is invalid.');
   }
   if(record.kind==='project') {
    if(!Array.isArray(record.payload.photos)||record.payload.photos.length>100)throw Error('Project photo list is invalid.');
    await restoreLocalDraft(record.payload);
   } else {
    const frame=await decodedImage(template.data);
    applyTemplate({...template,id:'new',name:String(template.name||'Restored Google Drive frame').slice(0,140)},
      template.data,frame);
    setMode('map');
   }
   render();
   message((record.kind==='project'?'Project':'Frame')+' restored successfully. Your existing Supabase records were not changed.');
   notify('Google Drive backup restored.');
  }catch(error){message(error.message||'Could not restore Google Drive backup.')}
  finally{busy=false;paint();}
 }
 function saveClientId() {
  const id=$d('client-id').value.trim();
  if(!CLIENT_PATTERN.test(id)){message('Enter a Google OAuth Web Client ID ending in .apps.googleusercontent.com');return;}
  if(token && connectedClient!==id){disconnect();}
  try{localStorage.setItem(CONFIG_KEY,id)}
  catch{message('Your browser blocked saving the public Client ID.');return}
  message('Google OAuth Client ID saved on this device. Select Connect Google Drive.');
  paint();loadGoogleScript().catch(e=>message(e.message));
 }
 function initialize() {
  $d('open').onclick=()=>{
   $d('dialog').showModal();
   paint();
   if(chosenClientId())loadGoogleScript().catch(e=>message(e.message));
  };
  $d('close').onclick=()=> $d('dialog').close();
  $d('connect').onclick=connect;
  $d('disconnect').onclick=disconnect;
  $d('save-client').onclick=saveClientId;
  $d('backup').onclick=backup;
  $d('refresh').onclick=()=>refreshBackups();
  message('Optional Google Drive backup. Supabase remains your shared/private template library.');
  paint();
 }
 initialize();
})();
