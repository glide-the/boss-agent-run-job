import { build } from "bun";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (existsSync("./dist")) {
  rmSync("./dist", { recursive: true, force: true });
}

const result = await build({
  entrypoints: ["./src/cli.ts"],
  outdir: "./dist",
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "external"
});

if (!result.success) {
  console.error("Build failed:");
  for (const msg of result.logs) {
    console.error(msg);
  }
process.exit(1);
}

const distPath = join("./dist", "cli.js");
const content = readFileSync(distPath, "utf8");
if (!content.startsWith("#!")) {
  writeFileSync(distPath, "#!/usr/bin/env node\n" + content);
}
chmodSync(distPath, 0o755);

console.log("Build complete: dist/cli.js");
