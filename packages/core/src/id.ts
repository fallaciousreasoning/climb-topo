export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // crypto.randomUUID() is restricted to secure contexts (https, or localhost) — it throws
  // "crypto.randomUUID is not a function" on a plain http origin, e.g. opening the dev server
  // via a LAN IP from a phone. crypto.getRandomValues() has no such restriction, so build an
  // RFC 4122 v4 UUID from it instead.
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  // Last-resort fallback for environments with no crypto global at all.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
