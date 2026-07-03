import type { Config, ChatListEntry, JobRecord } from "./types";
import { traceMarkerPrefix } from "./types";

export function extractChatListEntries(text: string): ChatListEntry[] {
  const seen = new Set<string>();
  const entries: ChatListEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/generic "([^"]{8,})" \[ref=e\d+\] clickable/);
    if (!match) continue;
    const value = match[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    if (seen.has(value)) continue;
    seen.add(value);
    entries.push({ index: entries.length + 1, text: value });
  }
  return entries;
}

export function parseJobText(text: string): Partial<JobRecord> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const joined = lines.join("\n");
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "");
  const titleIndex = title ? lines.findIndex((line) => line === `# ${title}`) : -1;
  const companyInfoIndex = lines.findIndex((line) => line === "公司基本信息");
  const companyFromInfo = companyInfoIndex >= 0 ? lines[companyInfoIndex + 1] : undefined;

  return {
    title: title || firstMeaningfulLine(lines),
    salary: matchFirst(joined, /(?:\d+\s*-\s*\d+|\d+)\s*K(?:·\d+薪)?|(?:\d+\s*-\s*\d+|\d+)\s*元\/月/i),
    location: titleIndex >= 0
      ? matchFirst(lines.slice(titleIndex, titleIndex + 6).join("\n"), /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|长沙|郑州|青岛|厦门|合肥|东莞|佛山|宁波|无锡|远程)/)
      : matchFirst(joined, /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|长沙|郑州|青岛|厦门|合肥|东莞|佛山|宁波|无锡|远程)/),
    experience: matchFirst(joined, /(经验不限|\d+\s*-\s*\d+年|\d+年以上|\d+年以内|在校\/应届)/),
    education: matchFirst(joined, /(学历不限|中专\/中技|高中|大专|本科|硕士|博士)/),
    company: companyFromInfo || findLineAfterKeywords(lines, ["公司", "科技", "网络", "信息", "集团"]),
    recruiter: findLineAfterKeywords(lines.filter((line) => line !== title), ["招聘者", "HR", "人事", "经理", "负责人"])
  };
}

export function extractJobId(url: string) {
  return url.match(/\/job_detail\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/)?.[1];
}

export function cleanJobDetailText(text: string, excludedHeadings: string[]) {
  const headings = excludedHeadings.length > 0
    ? excludedHeadings
    : ["相似职位", "更多相似职位", "精选职位", "看过该职位的人还看了", "城市招聘", "热门职位", "推荐公司", "热门企业"];
  const allLines = text.split(/\r?\n/);
  const headingIndex = allLines.findIndex((line) => {
    const normalized = normalizeJobLine(line);
    return line.trim().startsWith("# ") && !containsExcludedJobHeading(normalized, headings);
  });
  const lines = headingIndex >= 0 ? allLines.slice(headingIndex) : allLines;
  const cleaned: string[] = [];

  for (const line of lines) {
    const normalized = normalizeJobLine(line);
    if (containsExcludedJobHeading(normalized, headings)) break;
    if (isExcludedJobNoise(normalized)) continue;
    if (line.includes(traceMarkerPrefix)) continue;
    cleaned.push(line);
  }

  return `${cleaned.join("\n").trim()}\n`;
}

export function normalizeJobLine(line: string) {
  return line.replace(/^[-#\s]+/, "").trim();
}

export function containsExcludedJobHeading(line: string, headings: string[]) {
  return headings.some((heading) => line.includes(heading));
}

export function isExcludedJobNoise(line: string) {
  return [
    "相似职位",
    "更多相似职位",
    "精选职位",
    "看过该职位的人还看了",
    "城市招聘",
    "热门职位",
    "推荐公司",
    "热门企业",
    "其它公司品牌信息",
    "其他公司品牌信息"
  ].some((keyword) => line.includes(keyword));
}

export function firstMeaningfulLine(lines: string[]) {
  return lines.find((line) => line.length >= 2 && line.length <= 40 && !line.includes("BOSS直聘"));
}

export function matchFirst(text: string, regex: RegExp) {
  return text.match(regex)?.[0];
}

export function findLineAfterKeywords(lines: string[], keywords: string[]) {
  return lines.find((line) =>
    !line.startsWith("#") &&
    keywords.some((keyword) => line.includes(keyword)) &&
    line.length <= 60
  );
}

export function looksLikeJobDetail(url: string, config: Config) {
  if (url.includes("/job_detail/")) return true;
  const simplifiedPattern = config.jobDetailUrlPattern.replaceAll("*", "");
  return simplifiedPattern.length > 0 && url.includes(simplifiedPattern);
}

export function isRecommendedJobUrl(url: string) {
  try {
    const parsed = new URL(url);
    const ka = parsed.searchParams.get("ka")?.toLowerCase() || "";
    return (
      ka.startsWith("job_sug") ||
      ka.includes("recommend") ||
      parsed.pathname.includes("/recommend/")
    );
  } catch {
    const normalized = url.toLowerCase();
    return normalized.includes("ka=job_sug") || normalized.includes("/recommend/");
  }
}

export function extractMarkedSegment(output: string, startLabel: string, endLabel: string) {
  const startMarker = `${traceMarkerPrefix}${startLabel}`;
  const endMarker = `${traceMarkerPrefix}${endLabel}`;
  const startIndex = output.indexOf(startMarker);
  if (startIndex < 0) return "";

  const segmentStart = output.indexOf("\n", startIndex);
  const endIndex = output.indexOf(endMarker, segmentStart >= 0 ? segmentStart : startIndex);
  const rawSegment = output.slice(segmentStart >= 0 ? segmentStart + 1 : startIndex, endIndex >= 0 ? endIndex : undefined);
  return rawSegment
    .split(/\r?\n/)
    .filter((line) => !line.includes(traceMarkerPrefix))
    .join("\n")
    .trim();
}

export function lastUrl(text: string) {
  const standalone = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\/\S+$/.test(line));
  if (standalone.length > 0) return standalone.at(-1) || "";

  const matches = text.match(/https?:\/\/[^\s)"\]]+/g);
  return matches?.at(-1) || "";
}

export function lastInteger(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
  return Number.parseInt(lines.at(-1) || "0", 10);
}

export function lastNonEmptyLine(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("✓"))
    .filter((line) => !line.startsWith("[agent-browser]"))
    .filter((line) => !line.startsWith("- "));
  return lines.at(-1) || "";
}
