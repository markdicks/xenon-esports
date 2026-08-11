import { randomBytes } from "crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePublicReference(prefix: "APP" | "CON") {
  const bytes = randomBytes(6);
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length])
    .join("")
    .slice(0, 6);

  return `XEN-${prefix}-${suffix}`;
}
