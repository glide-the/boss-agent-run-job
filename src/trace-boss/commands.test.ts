import { expect, test } from "bun:test";
import {
  buildAgentBrowserBaseArgs,
  buildAgentBrowserSessionName,
  buildDomTextClickScript,
  locatorToClickCommand
} from "./commands";

test("locatorToClickCommand builds an eval click for dom-text locators", () => {
  const command = locatorToClickCommand({
    method: "dom-text",
    value: "查看职位"
  });

  expect(command).toContain("eval");
  expect(command).toContain("查看职位");
  expect(command).toContain("querySelectorAll");
  expect(command).toContain("getComputedStyle");
});

test("locatorToClickCommand routes find-text locators through the dom click script", () => {
  const command = locatorToClickCommand({
    method: "find-text",
    value: "王春达"
  });

  expect(command).toContain("eval");
  expect(command).toContain("王春达");
  expect(command).toContain("clickableSelectors");
  expect(command).toContain("getComputedStyle");
});

test("buildDomTextClickScript supports exact matching", () => {
  const script = buildDomTextClickScript("查看职位", true);

  expect(script).toContain('const search = "查看职位";');
  expect(script).toContain("text !== search");
  expect(script).toContain("clickableText !== search");
  expect(script).toContain('const clickableSelectors = "a,button');
  expect(script).toContain("dispatchEvent");
  expect(script).toContain("getComputedStyle");
});

test("buildAgentBrowserBaseArgs adds a stable restore session", () => {
  const originalRunId = process.env.PAPERCLIP_RUN_ID;
  const originalSession = process.env.AGENT_BROWSER_SESSION;
  process.env.PAPERCLIP_RUN_ID = "run-abc";
  delete process.env.AGENT_BROWSER_SESSION;

  const args = buildAgentBrowserBaseArgs({
    extensions: ["/ext/a", "/ext/b"],
    state: "/state.json",
    headed: true
  });

  expect(buildAgentBrowserSessionName()).toBe("boss-agent-run-abc");
  expect(args).toEqual([
    "--extension",
    "/ext/a",
    "--extension",
    "/ext/b",
    "--state",
    "/state.json",
    "--headed",
    "--session",
    "boss-agent-run-abc",
    "--restore",
    "--restore-save",
    "auto"
  ]);

  if (originalRunId === undefined) {
    delete process.env.PAPERCLIP_RUN_ID;
  } else {
    process.env.PAPERCLIP_RUN_ID = originalRunId;
  }
  if (originalSession === undefined) {
    delete process.env.AGENT_BROWSER_SESSION;
  } else {
    process.env.AGENT_BROWSER_SESSION = originalSession;
  }
});
