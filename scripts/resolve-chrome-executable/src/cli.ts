#!/usr/bin/env node

import { parseExecutablePath, resolveChromeExecutable } from "./resolve-chrome-executable";

try {
  const executablePath = resolveChromeExecutable(parseExecutablePath(process.argv.slice(2)));
  process.stdout.write(executablePath + "\n");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(msg + "\n");
  process.exit(1);
}
