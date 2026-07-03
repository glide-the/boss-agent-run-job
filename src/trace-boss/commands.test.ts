import { expect, test } from "bun:test";
import { buildDomTextClickScript, locatorToClickCommand } from "./commands";

test("locatorToClickCommand builds an eval click for dom-text locators", () => {
  const command = locatorToClickCommand({
    method: "dom-text",
    value: "查看职位"
  });

  expect(command).toContain("eval");
  expect(command).toContain("查看职位");
  expect(command).toContain("querySelectorAll");
  expect(command).toContain("closest");
});

test("buildDomTextClickScript supports exact matching", () => {
  const script = buildDomTextClickScript("查看职位", true);

  expect(script).toContain('normalized === "查看职位"');
  expect(script).toContain('const clickableSelectors = "a,button');
  expect(script).toContain("dispatchEvent");
  expect(script).toContain("iframe");
});
