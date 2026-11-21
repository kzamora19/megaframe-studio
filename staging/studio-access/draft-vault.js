/* STAGING ONLY: AES-GCM protected customer drafts AND named projects.
 * The launcher owns the non-extractable per-account key and IndexDB; the
 * opaque-origin editor receives only scoped read/write/delete via MessagePort.
 * Existing auto-draft AAD and DB version are unchanged for draft recovery.
 * This is NOT a hosted or production storage deployment. */
(() => {
  "use strict";
  const DB_NAME="megaframe-protected-draft-v1", STORE="drafts";
  const encoder=new TextEncoder(), decoder=new TextDecoder();
  const maxBytes=80*1024*1024;
  const valid=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{43}$/.test(value);
  const validProjectId=id=>typeof id==="string"&&/^project_[A-Za-z0-9_-]{2,100}$/.test(id);
  const decodeKey=encoded=>{
    if(!valid(encoded))throw Error("Invalid account-specific recovery key.");
    const binary=atob(encoded.replace(/-/g,"+").replace(/_/g,"/")+"=");
    if(binary.length!==32)throw Error("Invalid account key length.");
    return Uint8Array.from(binary,c=>c.charCodeAt(0));
  };
  const open=()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onerror=()=>reject(Error("Local encrypted project vault unavailable."));
    request.onsuccess=()=>resolve(request.result);
  });
  async function operation(mode,action,key,record){
    const db=await open();
    try {
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
        const request=action==="read"?store.get(key):
          action==="write"?store.put(record,key):
          action==="list"?store.getAllKeys():store.delete(key);
        request.onerror=()=>reject(Error("Local encrypted project operation failed."));
        tx.onabort=()=>reject(Error("Encrypted project transaction aborted."));
        tx.oncomplete=()=>resolve(action==="read"?request.result??null:
          action==="list"?request.result??[]:true);
      });
    } finally{db.close();}
  }
  function session(scope,secret){
    if(!valid(scope))throw Error("Missing PTG account draft scope.");
    const bytes=decodeKey(secret);
    const keyPromise=crypto.subtle.importKey("raw",bytes,{name:"AES-GCM"},false,["encrypt","decrypt"]);
    bytes.fill(0);
    const aad=key=>encoder.encode(DB_NAME+":"+key);
    async function readRecord(key){
      const saved=await operation("readonly","read",key);
      if(!saved)return null;
      if(saved.format!=="AES-GCM-v1"||
         !(saved.iv instanceof Uint8Array)||
         !(saved.encrypted instanceof ArrayBuffer))throw Error("Invalid encrypted project record.");
      const plaintext=await crypto.subtle.decrypt(
        {name:"AES-GCM",iv:saved.iv,additionalData:aad(key)},await keyPromise,saved.encrypted);
      return JSON.parse(decoder.decode(plaintext));
    }
    async function writeRecord(key,record){
      const data=encoder.encode(JSON.stringify(record));
      if(data.byteLength>maxBytes)throw Error("Protected project exceeds 80 MB local limit.");
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const encrypted=await crypto.subtle.encrypt(
        {name:"AES-GCM",iv,additionalData:aad(key)},await keyPromise,data);
      return operation("readwrite","write",key,{
        format:"AES-GCM-v1",iv,encrypted,updatedAt:Date.now()
      });
    }
    const projectKey=id=>{
      if(!validProjectId(id))throw Error("Unsupported named project ID.");
      return scope+":project:"+id;
    };
    return Object.freeze({
      async read(){return readRecord(scope);},
      async write(record){
        if(!record||record.format!=="MegaFrameDraftV1"||!Array.isArray(record.photos))
          throw Error("Unsupported draft record.");
        return writeRecord(scope,record);
      },
      async delete(){return operation("readwrite","delete",scope);},
      async ["project-list"](){
        const keys=await operation("readonly","list",scope);
        if(!Array.isArray(keys))throw Error("Project list unavailable.");
        const matching=keys.filter(key=>typeof key==="string"&&key.startsWith(scope+":project:"));
        const saved=await Promise.all(matching.map(key=>readRecord(key)));
        return saved.filter(r=>r?.format==="MegaFrameProjectV1"&&validProjectId(r.id))
          .map(r=>({id:r.id,name:r.name,savedAt:r.savedAt,photoCount:r.photoCount}))
          .sort((a,b)=>b.savedAt-a.savedAt);
      },
      async ["project-read"](id){return readRecord(projectKey(id));},
      async ["project-write"](record){
        if(!record||record.format!=="MegaFrameProjectV1"||
           !validProjectId(record.id)||typeof record.name!=="string"||
           record.payload?.format!=="MegaFrameDraftV1"||
           !Array.isArray(record.payload.photos))throw Error("Unsupported named project.");
        return writeRecord(projectKey(record.id),record);
      },
      async ["project-delete"](id){return operation("readwrite","delete",projectKey(id));},
    });
  }
  window.MEGAFRAME_LOCAL_DRAFT_VAULT=Object.freeze({session});
})();
