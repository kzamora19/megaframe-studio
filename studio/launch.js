/* STAGING ONLY. No editor or login token on public Pages. No production routing. */
(() => {
  "use strict";
  const config = window.MEGAFRAME_STUDIO_PRIVATE_CONFIG || {};
  const status = document.getElementById("status");
  const mount = document.getElementById("mount");
  const portal = "https://kzamora19.github.io/first-megasaver-ptg/studios/";
  let active = false, checking = false, expired = false, expiry = 0;
  let interval = null, deadline = null, warned = false;
  let draftPort = null, keyPair = null, proof = null;
  const cloudPanel=document.getElementById("cloudPanel");
  const cloudNote=document.getElementById("cloudMessage");
  let proofQueue=Promise.resolve();
  const withProof=fn=>{const next=proofQueue.then(fn);proofQueue=next.catch(()=>{});return next;};
  const show = (message, addPortal = false) => {
    status.replaceChildren(document.createTextNode(message));
    if (addPortal) {
      const a = document.createElement("a");
      a.textContent = " Open PTG Creative Studios";
      a.rel = "noreferrer";
      a.href = portal;
      status.append(a);
    }
    status.hidden = false;
  };
  const stop = message => {
    active = false;
    expired = true;
    if (interval) clearInterval(interval);
    if (deadline) clearTimeout(deadline);
    interval = deadline = null;
    if (draftPort) draftPort.close();
    draftPort = null;
    keyPair = null;
    proof = null;
    ticket = "";
    // Do not attempt to inspect iframe cookies or cross-origin draft storage.
    mount.replaceChildren();
    if(cloudPanel)cloudPanel.hidden=true;
    window.BRANCHLINE_CENTRAL_DRIVE?.lock();
    show(message, true);
  };
  const raw = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : "");
  let ticket = raw.get("ptg_studio_ticket") || "";
  try { history.replaceState(null, "", location.pathname + location.search); }
  catch { location.hash = ""; }
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
    stop("A valid PTG authorization is required."); return;
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/megaframe-editor-delivery$/.test(String(config.endpoint || "")) ||
      !String(config.publishableKey || "").trim()) {
    stop("Protected MegaFrame delivery is not configured."); return;
  }
  const b64url = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
  async function gateway(action,cloudDetails={}) {
    let payload;
    if (action === "load") {
      // Private key is non-extractable and stays in this browser document.
      keyPair = await crypto.subtle.generateKey(
        {name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
      const publicKey = await crypto.subtle.exportKey("jwk",keyPair.publicKey);
      payload = {action,ticket,publicKey};
    } else {
      if (!keyPair || !proof) throw Error("Signed PTG Studio session is unavailable.");
      const statement = new TextEncoder().encode(
        "ptg-studio-v1|megaframe|" + proof.sessionId + "|" + proof.challenge);
      const signature = b64url(await crypto.subtle.sign(
        {name:"ECDSA",hash:"SHA-256"},keyPair.privateKey,statement));
      payload = {action,...cloudDetails,sessionId:proof.sessionId,challenge:proof.challenge,signature};
    }
    const response = await fetch(config.endpoint, {
      method: "POST", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
      headers: {"Content-Type": "application/json", apikey: config.publishableKey},
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.ok !== true ||
        typeof result.sessionId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(result.sessionId) ||
        typeof result.challenge !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(result.challenge))
      throw Error("PTG authorization denied or unavailable.");
    if(proof && proof.sessionId!==result.sessionId)throw Error("Studio account session changed.");
    proof = {sessionId:result.sessionId,challenge:result.challenge};
    if(action === "load") ticket = ""; // Burn bearer in browser memory after one-time exchange.
    return result;
  }
  function deadlineAt(value) {
    const at = Date.parse(value);
    const diff = at - Date.now();
    if (!Number.isFinite(at) || diff <= 0 || diff > 125 * 60_000)
      throw Error("Invalid or expired PTG ticket.");
    expiry = expiry ? Math.min(expiry, at) : at;
    if (deadline) clearTimeout(deadline);
    deadline = setTimeout(() => stop("PTG access expired. Save your work and reopen from PTG."), Math.max(1, expiry - Date.now()));
  }
  function warn() {
    if (!warned && expiry - Date.now() <= 120_000 && expiry > Date.now()) {
      warned = true;
      show("PTG access is about to expire. Save your project before opening again from PTG.", true);
    }
  }
  async function check() {
    if (!active || checking || expired) return;
    if (Date.now() >= expiry) { stop("PTG access expired."); return; }
    checking = true;
    try {
      const data = await withProof(()=>gateway("check"));
      if (!active || expired) return;
      deadlineAt(data.expiresAt);
      warn();
    } catch {
      stop("PTG access has expired, been revoked, or cannot be verified.");
    } finally { checking = false; }
  }
  document.addEventListener("visibilitychange", () => {
    if (!active || document.visibilityState !== "visible") return;
    void check();
  });
  // Manual encrypted cloud archive is stored in the EXISTING PTG project,
  // keyed by the server-verified PTG actor; no fifth project or extra sign-in.
  // Every request consumes the same serialized one-use P-256 challenge as check().
  async function cloudOperation(operation,details={}){
    return withProof(async()=>{
      if(!active||expired||Date.now()>=expiry)throw Error("PTG session expired.");
      let result;
      try{result=await gateway("cloud",{operation,...details});}
      catch(error){stop("PTG cloud authorization could not be verified.");throw error;}
      deadlineAt(result.expiresAt);
      if(!result.cloud||typeof result.cloud.status!=="string")
        throw Error("Invalid encrypted cloud response.");
      return result.cloud;
    });
  }
  async function centralDriveOperation(operation,details={}){
    return withProof(async()=>{
      if(!active||expired||Date.now()>=expiry)throw Error("PTG session expired.");
      let result;
      try{result=await gateway("drive",{operation,...details});}
      catch(error){stop("PTG Drive authorization could not be verified.");throw error;}
      deadlineAt(result.expiresAt);
      if(!result.drive||typeof result.drive.status!=="string")
        throw Error("Invalid Google Drive response.");
      return result.drive;
    });
  }
  function setupCloud(vault){
    if(!cloudPanel||!cloudNote)return;
    const local=document.getElementById("cloudLocalProject"),remote=document.getElementById("cloudRemoteProject");
    const say=value=>{cloudNote.textContent=String(value);};
    const choices=(select,items)=>{
      select.replaceChildren();
      for(const item of items){
        const opt=document.createElement("option");opt.value=item.id;
        opt.textContent=item.label||item.id;select.append(opt);
      }
    };
    let busy=false;
    const doTask=fn=>async()=>{
      if(busy||!active||expired)return;
      busy=true;
      for(const btn of cloudPanel.querySelectorAll("button"))btn.disabled=true;
      try{await fn();}catch(error){say(error?.message||"Encrypted cloud operation failed.");}
      finally{busy=false;for(const btn of cloudPanel.querySelectorAll("button"))btn.disabled=false;}
    };
    let remoteItems=[];
    async function refresh(){
      const saved=await vault["project-list"]();
      choices(local,saved.map(item=>({id:item.id,label:item.name||item.id})));
      const result=await cloudOperation("list");
      if(result.status!=="ok")throw Error("Encrypted PTG cloud archive unavailable.");
      remoteItems=Array.isArray(result.items)?result.items:[];
      choices(remote,remoteItems.map(item=>({id:item.record_key,label:item.record_key})));
      say("Local projects: "+saved.length+" · Encrypted cloud backups: "+remoteItems.length);
    }
    document.getElementById("cloudRefresh").onclick=doTask(refresh);
    document.getElementById("cloudBackup").onclick=doTask(async()=>{
      const id=local.value;
      if(!id)throw Error("Save a named project in MegaFrame first.");
      const envelope=await vault["cloud-export"](id);
      if(!envelope)throw Error("The selected local project could not be found.");
      const listed=await cloudOperation("list");
      if(listed.status!=="ok")throw Error("Encrypted cloud archive unavailable.");
      const existing=(listed.items||[]).find(item=>item.record_key===id);
      if(existing&&!window.confirm("Replace this project's existing encrypted cloud backup?"))return;
      const saved=await cloudOperation("write",{
        recordKey:id,...envelope,expectedVersion:existing?.version||0
      });
      if(saved.status==="conflict")throw Error("Another device changed this cloud project. Refresh before replacing.");
      if(saved.status!=="ok")throw Error("Encrypted cloud archive write was unavailable.");
      await refresh();
      say("Encrypted backup saved. No customer photos were uploaded without your click.");
    });
    document.getElementById("cloudRestore").onclick=doTask(async()=>{
      const id=remote.value;
      if(!id)throw Error("Choose a cloud project first.");
      const old=await vault["project-read"](id);
      if(old&&!window.confirm("Replace the existing local project with this encrypted cloud version?"))return;
      const data=await cloudOperation("read",{recordKey:id});
      if(data.status!=="ok"||!data.record)throw Error("Cloud project no longer exists.");
      await vault["cloud-import"](id,data.record);
      say("Encrypted project retrieved. Open it from MegaFrame's Open Projects menu.");
    });
    cloudPanel.hidden=false;
    say("Cloud backup is optional. Save a named project, then select Refresh projects.");
  }
  async function showEditor() {
    try {
      const data = await gateway("load");
      if (typeof data.html !== "string" ||
          !data.html.startsWith("<!-- PRIVATE MEGAFRAME EDITOR BUNDLE") ||
          !/^[a-f0-9]{64}$/.test(String(data.sha256 || "")))
        throw Error("Invalid protected editor bundle.");
      // The client checks the complete returned bundle rather than trusting
      // an unverified HTML response. Server independently checks immutable SHA.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.html));
      const sha = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      if (sha !== data.sha256) throw Error("Protected editor integrity failed.");
      if (!window.MEGAFRAME_LOCAL_DRAFT_VAULT ||
          !/^[A-Za-z0-9_-]{43}$/.test(String(data.draftScope || "")) ||
          !/^[A-Za-z0-9_-]{43}$/.test(String(data.draftKey || "")))
        throw Error("Verified account's encrypted local recovery is unavailable.");
      const vault = window.MEGAFRAME_LOCAL_DRAFT_VAULT.session(data.draftScope, data.draftKey);
      deadlineAt(data.expiresAt);
      const frame = document.createElement("iframe");
      frame.id = "studio-editor-frame";
      frame.title = "Authorized MegaFrame editor";
      frame.referrerPolicy = "no-referrer";
      // Intentionally omit allow-same-origin: private editor code must not be
      // able to read PTG/Branchline localStorage on the shared github.io origin.
      // Cloud OAuth/storage functionality must pass compatibility testing before release.
      // Native <dialog>.showModal() is used for the v2.7 New/Retrieve
      // startup picker, Save Project and emoji chooser. allow-modals
      // enables those dialogs, but NEVER grant allow-same-origin.
      frame.sandbox = "allow-scripts allow-downloads allow-modals";
      const channel = new MessageChannel();
      draftPort = channel.port1;
      channel.port1.onmessage = async ({data:message}) => {
        if (!active || expired || Date.now() >= expiry ||
            mount.querySelector("iframe") !== frame ||
            !message || !Number.isSafeInteger(message.id) ||
            !["read", "write", "delete", "project-list", "project-read", "project-write", "project-delete"].includes(message.action)) return;
        try {
          const value = await vault[message.action](message.record);
          if (active && !expired && Date.now() < expiry)
            channel.port1.postMessage({id:message.id,ok:true,value});
        } catch {
          if (active && !expired && Date.now() < expiry)
            channel.port1.postMessage({id:message.id,ok:false});
        }
      };
      channel.port1.start();
      frame.addEventListener("load", () => {
        if (active && !expired && frame.contentWindow)
          frame.contentWindow.postMessage({kind:"megaframe-private-draft-port"},"*",[channel.port2]);
      }, {once:true});
      // Raw bytes have already passed SHA-256 verification. Apply only the local,
      // deterministic presentation overlay inside the unchanged opaque sandbox.
      frame.srcdoc = window.BranchlineFrameDeviceLayout?.apply(data.html) ?? data.html;
      mount.replaceChildren(frame);
      active = true;
      status.hidden = true;
      setupCloud(vault);
      if(window.BRANCHLINE_CENTRAL_DRIVE){
        void window.BRANCHLINE_CENTRAL_DRIVE.setup({
          studio:"megaframe",vault,
          request:(operation,fields)=>centralDriveOperation(operation,fields)
        }).catch(()=>{const n=document.getElementById("driveMessage");
          if(n)n.textContent="Company Google Drive could not initialize.";});
      }
      const every = Number.isInteger(config.checkIntervalMs) && config.checkIntervalMs >= 500
        ? config.checkIntervalMs : 30000;
      interval = setInterval(() => { void check(); }, every);
      warn();
    } catch {
      stop("Could not verify protected MegaFrame Studio access.");
    }
  }
  void showEditor();
})();
