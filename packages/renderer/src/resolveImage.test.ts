import { afterEach, describe, expect, it, vi } from "vitest";
import { loadImageNaturalSize } from "./resolveImage.js";

/** jsdom's Image never actually loads anything or sets naturalWidth/naturalHeight -- stub the
 *  global constructor so `new Image()` behaves like a real one that just finished loading. */
function stubImageLoad(size: { width: number; height: number } | "error"): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = size === "error" ? 0 : size.width;
    naturalHeight = size === "error" ? 0 : size.height;
    set src(_url: string) {
      queueMicrotask(() => (size === "error" ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadImageNaturalSize", () => {
  it("resolves with the loaded image's natural dimensions", async () => {
    stubImageLoad({ width: 800, height: 1200 });
    await expect(loadImageNaturalSize("https://example.com/photo.jpg")).resolves.toEqual({
      width: 800,
      height: 1200,
    });
  });

  it("rejects if the image fails to load", async () => {
    stubImageLoad("error");
    await expect(loadImageNaturalSize("https://example.com/broken.jpg")).rejects.toThrow();
  });
});
