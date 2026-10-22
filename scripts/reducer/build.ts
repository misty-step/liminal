import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const scratch = join(homedir(), ".cache/tmp");
await mkdir(scratch, { recursive: true });
const temporary = await mkdtemp(join(scratch, "liminal-reducer-"));
try {
  const bundle = join(temporary, "replay.js");
  execFileSync(process.execPath, [
    "build",
    "docs/reducer/replay.ts",
    "--target=browser",
    "--minify-whitespace",
    `--outfile=${bundle}`,
  ]);
  const script = (await readFile(bundle, "utf8")).replaceAll("</script", "<\\/script");
  const template = await readFile("docs/reducer/template.html", "utf8");
  const destination = resolve(process.env.OUT ?? "docs/reducer", "index.html");
  await writeFile(destination, template.replace("/* REPLAY_BUNDLE */", script));
  console.log(`Built ${destination}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
