// STAGING ONLY: pure guards for future MegaFrame Supabase protected editor delivery.
export const studioTicketOk = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export const releasePathOk = value => typeof value === "string" &&
  /^releases\/[a-f0-9]{12,64}\/studio\.html$/.test(value);
export const sha256Ok = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function exactHttpsOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        url.pathname !== "/" || !/^[a-z0-9.-]+$/i.test(url.hostname) ||
        url.hostname.includes("..") || (value.trim() !== url.origin && value.trim() !== url.origin + "/"))
      return "";
    return url.origin;
  } catch { return ""; }
}
export function deliveryConfigured({origin, secret, serviceKey, path, sha, bucket}) {
  return !!exactHttpsOrigin(origin) &&
    typeof secret === "string" && secret.length >= 32 &&
    typeof serviceKey === "string" && serviceKey.length >= 32 &&
    releasePathOk(path) && sha256Ok(sha) && bucket === "megaframe-editor-release";
}
