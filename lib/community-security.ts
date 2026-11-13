import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const voterCookieName = "xenon_community_v1";
export function communityError(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
export function communityHash(value: string) {
  const secret = process.env.COMMUNITY_FORM_SECRET || process.env.WEBSITE_BOT_TOKEN;
  if (!secret || secret.length < 32) communityError("Community submissions are temporarily unavailable. Please try again later.", 503);
  return createHmac("sha256", secret).update(`xenon-community-v1:${value}`).digest("hex");
}
function same(left: string, right: string) {
  return /^[a-f0-9]{64}$/.test(left) && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function voterId(request: Request) {
  try {
    const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${voterCookieName}=`))?.slice(voterCookieName.length + 1);
    const [id, expiry, signature] = String(cookie || "").split(".");
    if (/^[a-f0-9]{48}$/.test(id) && Number(expiry) > Date.now() && same(signature, communityHash(`cookie:${id}:${expiry}`))) return id;
  } catch { /* Invalid or unsigned cookies never identify a voter. */ }
  return null;
}
export function communitySession(request: Request) {
  const existing = voterId(request), id = existing || randomBytes(24).toString("hex");
  const issued = Date.now(), nonce = randomUUID(), expiry = issued + 365 * 86400000;
  const proof = `${issued}.${nonce}.${communityHash(`proof:${id}:${issued}:${nonce}`)}`;
  return { proof, voterHash: communityHash(`voter:${id}`), cookie: existing ? null
    : `${voterCookieName}=${id}.${expiry}.${communityHash(`cookie:${id}:${expiry}`)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:" ? "; Secure" : ""}` };
}
export function assertCommunityOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || new URL(request.url).host;
  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (!["http:", "https:"].includes(origin.protocol) || origin.host.toLowerCase() !== host.toLowerCase()
      || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Invalid origin");
  } catch { communityError("This request did not come from the Xenon website. Refresh the page and try again.", 403); }
}
export function networkIdentity(request: Request) {
  const hops = Number(process.env.EVENT_TRUSTED_PROXY_HOPS || "1");
  if (!Number.isInteger(hops) || hops < 1 || hops > 5) communityError("Community submissions are temporarily unavailable.", 503);
  const chain = (request.headers.get("x-forwarded-for") || "").split(",").map((value) => value.trim());
  const raw = chain.at(-hops) || "";
  if (!isIP(raw)) communityError("Your network could not be verified. Please try again later.", 503);
  if (isIP(raw) === 4) return raw;
  const canonical = new URL(`http://[${raw}]`).hostname.slice(1, -1);
  const [left, right = ""] = canonical.split("::"), first = left ? left.split(":") : [], last = right ? right.split(":") : [];
  const groups = canonical.includes("::") ? [...first, ...Array(8 - first.length - last.length).fill("0"), ...last] : first;
  if (groups.slice(0, 5).every((part) => Number.parseInt(part, 16) === 0) && groups[5] === "ffff") {
    const value = Number.parseInt(groups[6], 16) * 65536 + Number.parseInt(groups[7], 16);
    return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
  }
  return `${groups.slice(0, 4).map((part) => part.padStart(4, "0")).join(":")}::/64`;
}
export function validateCommunityInteraction(request: Request, proof: string) {
  assertCommunityOrigin(request);
  const id = voterId(request), [issued, nonce, signature] = proof.split(".");
  if (!id || !/^\d{13}$/.test(issued) || !/^[a-f0-9-]{36}$/.test(nonce || "")
    || !same(signature || "", communityHash(`proof:${id}:${issued}:${nonce}`)) || Date.now() - Number(issued) > 3600000 || Number(issued) > Date.now()) {
    communityError("Your form session expired. Refresh the page and try again.", 403);
  }
  if (Date.now() - Number(issued) < 2000) communityError("Please wait a moment, then submit again.", 429);
  return { voterHash: communityHash(`voter:${id}`), networkHash: communityHash(`network:${networkIdentity(request)}`) };
}
export function safeCommunityFailure(error: unknown) {
  const value = error as { status?: number; message?: string; code?: string };
  const status = value.status && [400, 403, 404, 409, 429].includes(value.status) ? value.status : 503;
  if (status === 503) console.error("Community event storage unavailable", { code: /^[A-Z0-9_]{1,60}$/.test(value.code || "") ? value.code : "UNAVAILABLE" });
  return { status, error: status === 503 ? "Community event services are temporarily unavailable. Please try again later." : value.message || "The request could not be completed." };
}
