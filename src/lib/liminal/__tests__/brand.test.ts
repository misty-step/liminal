import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Cabinet, Sharper identity contract", () => {
  it("ships editable square keyhole artwork for 16, 32, and large use", () => {
    for (const path of [
      "public/brand/liminal-mark-16.svg",
      "public/brand/liminal-mark-32.svg",
      "public/brand/liminal-mark.svg",
      "src/app/icon.svg",
    ]) {
      const svg = read(path);
      expect(svg).toContain("<svg");
      expect(svg).toMatch(/viewBox="0 0 (16|32|256) (16|32|256)"/);
      expect(svg).not.toMatch(/<text\b/i);
    }
  });

  it("wires canonical, favicon, Open Graph, and Twitter metadata", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("metadataBase");
    expect(layout).toContain("alternates");
    expect(layout).toContain("liminal-mark-16.svg");
    expect(layout).toContain("liminal-mark-32.svg");
    expect(layout).toContain("openGraph");
    expect(layout).toContain("twitter");
  });

  it("keeps player copy concise and free of internal vocabulary", () => {
    const copy = `${read("src/app/page.tsx")}\n${read("src/app/layout.tsx")}`;
    expect(copy).not.toMatch(/[—–]|&(?:mdash|ndash);/i);
    expect(copy).not.toMatch(/\b(decimal dashboard|backend|schema|webhook)\b/i);
    expect(copy).toContain("Find what belongs");
    expect(copy).toContain("guesses left");
    expect(copy).toContain('state ? STATE_LABEL[state] : "Waiting"');
    expect(copy).not.toContain('state ? STATE_LABEL[state] : "Untested"');
    expect(copy).toContain("Judging is unavailable. Your guess remains.");
    expect(copy).toContain("Report filed. Thank you for the note.");
    expect(copy).toContain('"Answer required"');
    expect(copy).toContain("Report a judging issue");
    expect(copy).not.toContain("mini-keyhole");
    expect(copy).not.toContain('className="drawer-hardware"');
  });

  it("retains a concise maintenance spec for design and copy", () => {
    const spec = read("DESIGN.md");
    expect(spec).toContain("The Cabinet, Sharper");
    expect(spec).toContain("16 px");
    expect(spec).toContain("Iowan Old Style");
    expect(spec).toContain("Outside");
    expect(spec).toContain("Close");
    expect(spec).toContain("Inside");
  });
});
