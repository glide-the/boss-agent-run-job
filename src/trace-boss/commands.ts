import { appendFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { AgentBrowserConfig, Config, Locator } from "./types";
import { projectRoot } from "./runtime";
import { requiredAgentBrowserConfig, traceMarkerPrefix } from "./types";
import { resolveChromeExecutable } from "@boss-agent/resolve-chrome-executable";

export function buildAgentBrowserBaseArgs(agentConfig: AgentBrowserConfig) {
  const base: string[] = [];
  if (agentConfig.resolveExecutablePath) {
    base.push("--executable-path", resolveChromeExecutable(agentConfig.executablePath));
  } else if (agentConfig.executablePath) {
    base.push("--executable-path", agentConfig.executablePath);
  }
  for (const extension of agentConfig.extensions) {
    base.push("--extension", extension);
  }
  base.push("--state", agentConfig.state);
  if (agentConfig.headed) base.push("--headed");
  const sessionName = buildAgentBrowserSessionName();
  if (sessionName) {
    base.push("--session", sessionName, "--restore", "--restore-save", "auto");
  }
  return base;
}

export function buildAgentBrowserSessionName() {
  const explicitSession = process.env.AGENT_BROWSER_SESSION?.trim();
  if (explicitSession) return explicitSession;

  const runId = process.env.PAPERCLIP_RUN_ID?.trim();
  if (runId) return `boss-agent-${runId}`;

  return "boss-agent-trace";
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
    return command("eval", buildDomTextClickScript(locator.value, locator.exact));
  }

  if (locator.method === "dom-text") {
    return command("eval", buildDomTextClickScript(locator.value, locator.exact));
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

export function buildDomTextClickScript(value: string, exact = false) {
  const textLiteral = JSON.stringify(value);

  return `(() => {
  const search = ${textLiteral};
  const normalize = (text) => (text || "").replace(/\\s+/g, " ").trim();
  const clickableSelectors = "a,button,[role=\\"button\\"],[role=\\"link\\"],[onclick]";
  const isVisible = (node) => {
    const view = node.ownerDocument.defaultView;
    if (!view) return false;
    const style = view.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const isDirectClickable = (node) => {
    if (!node || node === document.body || node === document.documentElement) return false;
    const view = node.ownerDocument.defaultView;
    const style = view ? view.getComputedStyle(node) : null;
    return node.matches(clickableSelectors) || Boolean(node.getAttribute("onclick")) || Boolean(node.getAttribute("href")) || Boolean(node.getAttribute("data-href")) || Boolean(node.getAttribute("data-url")) || Boolean(style && style.cursor === "pointer");
  };
  const pickClickableAncestor = (node) => {
    let current = node;
    let depth = 0;
    while (current && current !== document.body && current !== document.documentElement && depth < 8) {
      if (isDirectClickable(current)) return { target: current, depth };
      current = current.parentElement;
      depth += 1;
    }
    return null;
  };
  const candidates = [];
  for (const node of Array.from(document.querySelectorAll("*"))) {
    const text = normalize(node.textContent);
    if (!text) continue;
    if (${exact ? "text !== search" : "!text.includes(search)"}) continue;
    if (!isVisible(node)) continue;
    const clickable = pickClickableAncestor(node);
    if (!clickable) continue;
    const clickableText = normalize(clickable.target.textContent);
    if (!clickableText) continue;
    if (${exact ? "clickableText !== search" : "!clickableText.includes(search)"}) continue;
    candidates.push({
      target: clickable.target,
      textLength: clickableText.length,
      exactMatch: clickableText === search,
      direct: clickable.target === node,
      depth: clickable.depth
    });
  }
  if (candidates.length === 0) return "not-found";
  candidates.sort((a, b) => {
    if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
    if (a.direct !== b.direct) return a.direct ? -1 : 1;
    if (a.textLength !== b.textLength) return a.textLength - b.textLength;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return 0;
  });
  const target = candidates[0].target;
  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "center", inline: "center" });
  }
  const rawHref = target.getAttribute("href") || target.getAttribute("data-href") || target.getAttribute("data-url") || target.dataset?.href || target.dataset?.url;
  if (rawHref && !rawHref.startsWith("javascript:")) {
    const view = target.ownerDocument.defaultView;
    if (view) {
      view.location.href = new URL(rawHref, target.ownerDocument.baseURI).href;
      return "navigated";
    }
  }
  const view = target.ownerDocument.defaultView;
  if (view) {
    const eventInit = { bubbles: true, cancelable: true, view };
    target.dispatchEvent(new view.MouseEvent("mousedown", eventInit));
    target.dispatchEvent(new view.MouseEvent("mouseup", eventInit));
    target.dispatchEvent(new view.MouseEvent("click", eventInit));
  }
  if (typeof target.click === "function") {
    target.click();
  }
  return "clicked";
})();`;
}

export async function agent(config: Config, args: string[], options: { optional?: boolean } = {}) {
  const fullArgs = [...buildAgentBrowserBaseArgs(config.agentBrowser), ...args];
  const result = await run("agent-browser", fullArgs, options.optional, (options as { env?: Record<string, string> }).env);
  return result.stdout;
}

export async function runBatch(config: Config, commands: string[], options: { optional?: boolean; env?: Record<string, string> } = {}) {
  return await agent(config, ["batch", ...commands], options);
}

async function run(commandName: string, args: string[], optional = false, env?: Record<string, string>) {
  const displayCommand = [commandName, ...args.map(shellQuote)].join(" ");
  await appendFile(join(projectRoot, "output", "agent-browser-commands.log"), `${displayCommand}\n`);

  return await new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(commandName, args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : process.env
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
