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
    // Do not attempt to inspect iframe cookies or cross-origin draft storage.
    mount.replaceChildren();
    show(message, true);
  };
  const raw = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : "");
  const ticket = raw.get("ptg_studio_ticket") || "";
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
  async function gateway(action) {
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
      payload = {action,sessionId:proof.sessionId,challenge:proof.challenge,signature};
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
    proof = {sessionId:result.sessionId,challenge:result.challenge};
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
      const data = await gateway("check");
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
      frame.sandbox = "allow-scripts allow-downloads";
      const channel = new MessageChannel();
      draftPort = channel.port1;
      channel.port1.onmessage = async ({data:message}) => {
        if (!active || expired || Date.now() >= expiry ||
            mount.querySelector("iframe") !== frame ||
            !message || !Number.isSafeInteger(message.id) ||
            !["read", "write", "delete"].includes(message.action)) return;
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
      frame.srcdoc = data.html;
      mount.replaceChildren(frame);
      active = true;
      status.hidden = true;
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
