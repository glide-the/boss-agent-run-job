// 批量 JD 抽取：对有招聘方回复的会话，逐条搜索定位 -> 打开聊天 ->
// 点击「查看职位」-> 认领详情页抽取 -> 关闭详情页 -> 落盘 JSONL。
const fs = globalThis.__nodeFs;
import { buildSearchTerm } from "./collect-search.js";
import { extractJobDetail } from "./job-extract.js";

const JD_PATH = "/Users/dmeck/project/boss-agent/data/boss_jd_raw.jsonl";

export function loadJdDone(path = JD_PATH) {
  const done = new Set();
  const errCount = new Map();
  if (fs.existsSync(path)) {
    for (const line of fs.readFileSync(path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (r.key && !r.error) done.add(r.key);
        if (r.key && r.error) errCount.set(r.key, (errCount.get(r.key) || 0) + 1);
      } catch {}
    }
  }
  return { done, errCount };
}

export async function processOneJd(browser, tab, item) {
  const key = item.key;
  const companyPart = item.titleBox.startsWith(item.name)
    ? item.titleBox.slice(item.name.length)
    : item.titleBox;
  const term = buildSearchTerm(item);

  const box = tab.playwright.getByPlaceholder("搜索30天内的联系人");
  await box.click();
  await box.fill(term);
  await tab.playwright.waitForTimeout(1600);

  const results = await tab.playwright.evaluate(() =>
    Array.from(document.querySelectorAll(".boss-search-result .search-list")).map((li) =>
      li.innerText.replace(/\s+/g, " ").trim()
    )
  );
  const idx = results.findIndex(
    (t) =>
      t.includes(item.name) &&
      (companyPart.length < 2 || t.replace(/\s+/g, "").includes(companyPart.slice(0, 6)))
  );
  if (idx < 0) {
    await box.fill("");
    await tab.playwright.waitForTimeout(400);
    return { key, error: "searchMiss", term };
  }

  await tab.playwright.locator(".boss-search-result .search-list").nth(idx).click();
  await tab.playwright.waitForTimeout(1800);
  await box.fill("");

  // 点击职位条「查看职位」
  const btn = tab.playwright.locator(".chat-position-content .right-content").first();
  if (!(await btn.count())) return { key, error: "noViewJobBtn" };
  await btn.click();
  await tab.playwright.waitForTimeout(4000);

  const userTabs = await browser.user.openTabs();
  const jobTabInfo = userTabs.find((t) => /job_detail/.test(t.url || ""));
  if (!jobTabInfo) return { key, error: "jobTabNotFound" };
  const jobTab = await browser.user.claimTab(jobTabInfo);
  let detail;
  try {
    detail = await extractJobDetail(jobTab);
  } finally {
    try {
      await jobTab.close();
    } catch {}
  }
  return { key, ...detail };
}

export async function runJdBatch(browser, tab, queue, N) {
  const { done, errCount } = loadJdDone();
  const out = [];
  let i = 0;
  for (const item of queue) {
    if (i >= N) break;
    if (done.has(item.key)) continue;
    if ((errCount.get(item.key) || 0) >= 2) continue; // 连续失败 2 次放弃，防止卡死
    i++;
    try {
      const rec = await processOneJd(browser, tab, item);
      fs.appendFileSync(JD_PATH, JSON.stringify(rec) + "\n");
      if (!rec.error) done.add(rec.key);
      out.push({ k: item.name, err: rec.error || "", jd: rec.jd ? rec.jd.length : 0 });
    } catch (e) {
      fs.appendFileSync(
        JD_PATH,
        JSON.stringify({ key: item.key, error: String(e).slice(0, 150) }) + "\n"
      );
      out.push({ k: item.name, err: "exception" });
    }
    await tab.playwright.waitForTimeout(1500);
  }
  return {
    processed: out.length,
    doneTotal: done.size,
    errors: out.filter((o) => o.err).length,
    last3: out.slice(-3),
  };
}
