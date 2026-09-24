import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("brand image assets", () => {
  it("ships square, text-free marks for all icon sizes", () => {
    for (const [path, size] of [
      ["public/brand/liminal-mark-16.svg", 16],
      ["public/brand/liminal-mark-32.svg", 32],
      ["public/brand/liminal-mark.svg", 256],
      ["src/app/icon.svg", 32],
    ] as const) {
      const svg = readFileSync(join(root, path), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`);
      expect(svg).not.toMatch(/<text\b/i);
    }
  });

  it("ships raster icons at the dimensions consumers require", () => {
    for (const [path, width, height] of [
      ["src/app/apple-icon.png", 180, 180],
      ["public/brand/liminal-share.png", 1200, 630],
    ] as const) {
      const png = readFileSync(join(root, path));
      expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
      expect(png.readUInt32BE(16)).toBe(width);
      expect(png.readUInt32BE(20)).toBe(height);
    }
  });
});
