/* Injected ONLY inside the immutable protected MegaFrame editor package.
 * The sandbox cannot read any parent cookies, PTG tokens, or localStorage.
 * A one-time MessagePort grants read/write/delete of this account's draft only. */
(() => {
  "use strict";
  let port = null, nextId = 0;
  const pending = new Map();
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  window.addEventListener("message", event => {
    if (event.source !== window.parent || !event.data ||
        event.data.kind !== "megaframe-private-draft-port" ||
        port || event.ports.length !== 1) return;
    port = event.ports[0];
    port.onmessage = ({data}) => {
      if (!data || typeof data.id !== "number") return;
      const item = pending.get(data.id);
      if (!item) return;
      pending.delete(data.id);
      clearTimeout(item.timeout);
      if (data.ok === true) item.resolve(data.value ?? null);
      else item.reject(Error("Private draft storage unavailable."));
    };
    port.start();
    resolveReady();
  });
  async function request(action, record) {
    if (!["read", "write", "delete", "project-list", "project-read", "project-write", "project-delete"].includes(action))
      throw Error("Unsupported draft operation.");
    await Promise.race([
      ready,
      new Promise((_,reject) => setTimeout(() => reject(Error("Protected draft bridge unavailable.")), 10000)),
    ]);
    return new Promise((resolve,reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(Error("Protected draft operation timed out."));
      }, 45000);
      pending.set(id,{resolve,reject,timeout});
      try { port.postMessage({id,action,record: ["write", "project-read", "project-write", "project-delete"].includes(action) ? record : undefined}); }
      catch {clearTimeout(timeout);pending.delete(id);reject(Error("Private draft request failed."));}
    });
  }
  window.__MEGAFRAME_PRIVATE_DRAFT__ = Object.freeze({request});
})();
