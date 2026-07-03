import { appendFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { AgentBrowserConfig, Config, Locator } from "./types";
import { projectRoot } from "./runtime";
import { requiredAgentBrowserConfig, traceMarkerPrefix } from "./types";

export function buildAgentBrowserBaseArgs(agentConfig: AgentBrowserConfig) {
  const base: string[] = [];
  for (const extension of agentConfig.extensions) {
    base.push("--extension", extension);
  }
  base.push("--state", agentConfig.state);
  if (agentConfig.headed) base.push("--headed");
  return base;
}

export function validateAgentBrowserConfig(agentConfig: AgentBrowserConfig) {
  const missing: string[] = [];
  for (const extension of requiredAgentBrowserConfig.extensions) {
    if (!agentConfig.extensions.includes(extension)) {
      missing.push(`--extension ${extension}`);
    }
  }
  if (agentConfig.state !== requiredAgentBrowserConfig.state) {
    missing.push(`--state ${requiredAgentBrowserConfig.state}`);
  }
  if (agentConfig.headed !== requiredAgentBrowserConfig.headed) {
    missing.push("--headed");
  }
  if (missing.length > 0) {
    throw new Error(`agentBrowser 配置缺少必需启动参数: ${missing.join(", ")}`);
  }
}

export function command(...parts: string[]) {
  return parts.map(shellQuote).join(" ");
}

export function markerCommand(label: string) {
  return command("eval", JSON.stringify(`${traceMarkerPrefix}${label}`));
}

export function returnToChatCommands() {
  return [
    "back",
    "wait --load networkidle",
    "snapshot -i -u -c"
  ];
}

export function locatorToClickCommand(locator: Locator, cssOccurrence?: number) {
  if (locator.method === "find-text") {
    return locator.exact
      ? command("find", "text", locator.value, "click", "--exact")
      : command("find", "text", locator.value, "click");
  }

  if (locator.method === "css") {
    if (cssOccurrence && cssOccurrence > 1) {
      const script = `(() => {\n  const nodes = Array.from(document.querySelectorAll(${JSON.stringify(locator.value)}));\n  const target = nodes[${cssOccurrence - 1}];\n  if (!target) return \"not-found\";\n  target.click();\n  return \"clicked\";\n})();`;
      return command("eval", script);
    }
    return command("click", locator.value);
  }

  return command("find", "role", locator.role, "click", "--name", locator.name);
}

export async function agent(config: Config, args: string[], options: { optional?: boolean } = {}) {
  const fullArgs = [...buildAgentBrowserBaseArgs(config.agentBrowser), ...args];
  const result = await run("agent-browser", fullArgs, options.optional);
  return result.stdout;
}

export async function runBatch(config: Config, commands: string[], options: { optional?: boolean } = {}) {
  return await agent(config, ["batch", ...commands], options);
}

async function run(commandName: string, args: string[], optional = false) {
  const displayCommand = [commandName, ...args.map(shellQuote)].join(" ");
  await appendFile(join(projectRoot, "output", "agent-browser-commands.log"), `${displayCommand}\n`);

  return await new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(commandName, args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || optional) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`${displayCommand} failed with code ${code}\n${stderr || stdout}`));
    });
  });
}

function shellQuote(value: string) {
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
