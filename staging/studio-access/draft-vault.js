/* STAGING ONLY. The GitHub Pages launcher stores AES-GCM ENCRYPTED drafts locally.
 * No service-role secret, PTG bearer token, image or draft is sent to Supabase.
 * draftScope and draftKey MUST be returned only after live server-side
 * verification of an eligible PTG account, with stable account-specific values.
 * Keep an isolated Studio origin as a separate release security requirement. */
(() => {
  "use strict";
  const DB_NAME = "megaframe-protected-draft-v1";
  const STORE = "drafts";
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  const maxBytes = 80 * 1024 * 1024;
  const valid = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
  const decodeKey = encoded => {
    if (!valid(encoded)) throw Error("Invalid account-specific recovery key.");
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + "=");
    if (binary.length !== 32) throw Error("Invalid key length.");
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  };
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onerror = () => reject(Error("Local draft database unavailable."));
    request.onsuccess = () => resolve(request.result);
  });
  async function operation(mode, action, scope, record) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = action === "read" ? store.get(scope)
          : action === "write" ? store.put(record, scope) : store.delete(scope);
        request.onerror = () => reject(Error("Local draft operation failed."));
        tx.onabort = () => reject(Error("Local draft transaction aborted."));
        tx.oncomplete = () => resolve(action === "read" ? request.result ?? null : true);
      });
    } finally { db.close(); }
  }
  function session(scope, secret) {
    if (!valid(scope)) throw Error("Missing PTG account draft scope.");
    const bytes = decodeKey(secret);
    // A non-extractable CryptoKey remains in the launcher; never relay it into
    // the sandboxed editor. Source bytes are promptly overwritten.
    const promise = crypto.subtle.importKey("raw", bytes, {name:"AES-GCM"}, false, ["encrypt","decrypt"]);
    bytes.fill(0);
    const additionalData = textEncoder.encode("megaframe-protected-draft-v1:" + scope);
    return Object.freeze({
      async read() {
        const saved = await operation("readonly", "read", scope);
        if (!saved) return null;
        if (saved.format !== "AES-GCM-v1" ||
            !(saved.iv instanceof Uint8Array) ||
            !(saved.encrypted instanceof ArrayBuffer)) throw Error("Invalid encrypted draft record.");
        const decoded = await crypto.subtle.decrypt(
          {name:"AES-GCM", iv:saved.iv, additionalData},
          await promise, saved.encrypted
        );
        return JSON.parse(textDecoder.decode(decoded));
      },
      async write(record) {
        if (!record || record.format !== "MegaFrameDraftV1" || !Array.isArray(record.photos))
          throw Error("Unsupported draft record.");
        const plaintext = textEncoder.encode(JSON.stringify(record));
        if (plaintext.byteLength > maxBytes) throw Error("Draft exceeds local storage safety limit.");
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
          {name:"AES-GCM", iv, additionalData}, await promise, plaintext
        );
        return operation("readwrite", "write", scope,
          {format:"AES-GCM-v1",iv,encrypted,updatedAt:Date.now()});
      },
      async delete() { return operation("readwrite","delete",scope); },
    });
  }
  window.MEGAFRAME_LOCAL_DRAFT_VAULT = Object.freeze({session});
})();
