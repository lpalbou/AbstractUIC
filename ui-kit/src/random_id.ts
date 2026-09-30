/*
 * randomId(): a v4 UUID that also works over plain http.
 *
 * Browsers expose `crypto.randomUUID` only in a secure context (https or
 * localhost). Apps and consoles are often opened over http from another
 * machine (LAN, Tailscale), where calling it throws or it is missing. The
 * kit's code never calls `crypto.randomUUID` directly: it calls randomId(),
 * which uses `crypto.randomUUID` when present and otherwise builds an
 * RFC 4122 version-4 UUID from `crypto.getRandomValues` (available in every
 * context). docs/state-toggles.md "Non-secure contexts".
 */

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

function currentCrypto(): CryptoLike | undefined {
  return (globalThis as { crypto?: CryptoLike }).crypto;
}

/** Format 16 random bytes as a version-4, RFC 4122 variant UUID string. */
export function uuidV4FromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error("uuidV4FromBytes: needs 16 bytes");
  const b = Array.from(bytes.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx (RFC 4122)
  const hex = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A random v4 UUID. `crypto.randomUUID` when it exists and works, else a UUID
 * built from `crypto.getRandomValues`. Throws only when neither exists (no
 * Web Crypto at all), never falls back to Math.random.
 */
export function randomId(): string {
  const c = currentCrypto();
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // non-secure context: fall through to getRandomValues
    }
  }
  if (c && typeof c.getRandomValues === "function") {
    return uuidV4FromBytes(c.getRandomValues(new Uint8Array(16)));
  }
  throw new Error("randomId: Web Crypto (crypto.getRandomValues) is unavailable");
}
