import { afterEach, describe, expect, it, vi } from "vitest";
import { generateId } from "./id.js";

describe("generateId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unique ids using crypto.randomUUID when available", () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("falls back to crypto.getRandomValues when randomUUID is unavailable", () => {
    // Mirrors a plain-http (non-secure-context) origin, where crypto.randomUUID is undefined
    // but crypto.getRandomValues still works — e.g. opening the dev server via a LAN IP.
    vi.stubGlobal("crypto", {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });

    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("falls back to a non-crypto id when no crypto global exists at all", () => {
    vi.stubGlobal("crypto", undefined);

    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
  });
});
