import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { Config, JobRecord, RuntimeTraceTarget } from "../types";
import {
  cleanJobDetailText,
  extractJobId,
  extractMarkedSegment,
  extractSectionText,
  extractSkillChipLines,
  extractSkillTags,
  extractSkillTermsFromText,
  isRecommendedJobUrl,
  lastNonEmptyLine,
  lastUrl,
  looksLikeJobDetail,
  normalizeJobLine,
  parseJobText
} from "../parser";
import { projectRoot } from "../runtime";
import { safeLabel } from "../chat/target-resolver";

export class JobCollector {
  constructor(private readonly config: Config) {}

  async collect(
    target: RuntimeTraceTarget,
    output: string,
    trace: (step: string, detail?: unknown) => Promise<void>
  ): Promise<JobRecord | undefined> {
    const label = safeLabel(target.target_id, 1);
    const jobLabel = `job-${label}-1`;
    const jobSegment = extractMarkedSegment(output, `job-${label}-start`, `job-${label}-end`);
    const jobRawFile = join(this.config.outputDir, "raw", `${jobLabel}.txt`);

    if (!jobSegment) {
      await trace("job-not-collected", {
        target_id: target.target_id,
        leftIndex: target.leftIndex,
        targetProvenance: target.targetProvenance,
        reason: "岗位采集片段缺失，可能是 locator 点击、页面加载或 wait 失败导致 batch 提前停止"
      });
      return undefined;
    }

    const currentUrl = lastUrl(jobSegment);
    const currentTitle = lastNonEmptyLine(jobSegment.replace(currentUrl || "", ""));

    if (!looksLikeJobDetail(currentUrl, this.config)) {
      await writeFile(join(projectRoot, jobRawFile), jobSegment);
      await trace("job-not-collected", {
        target_id: target.target_id,
        leftIndex: target.leftIndex,
        targetProvenance: target.targetProvenance,
        reason: "点击岗位入口后未进入 job_detail URL",
        currentUrl,
        currentTitle
      });
      return undefined;
    }

    if (isRecommendedJobUrl(currentUrl)) {
      await writeFile(join(projectRoot, jobRawFile), jobSegment);
      await trace("job-not-collected", {
        target_id: target.target_id,
        leftIndex: target.leftIndex,
        targetProvenance: target.targetProvenance,
        reason: "命中推荐岗位 URL，跳过非当前会话绑定的岗位入口",
        currentUrl,
        currentTitle
      });
      return undefined;
    }

    const jobId = extractJobId(currentUrl);
    if (!jobId) {
      await writeFile(join(projectRoot, jobRawFile), jobSegment);
      await trace("job-not-collected", {
        target_id: target.target_id,
        leftIndex: target.leftIndex,
        targetProvenance: target.targetProvenance,
        reason: "当前 URL 看起来是 job_detail，但无法从地址栏 URL 解析 job_id",
        currentUrl,
        currentTitle
      });
      return undefined;
    }

    const cleanJobText = this.buildCleanJobText(jobSegment);
    const resolvedJobRawFile = join(this.config.outputDir, "raw", `job-${jobId}.txt`);
    const resolvedJobSnapshotFile = join(this.config.outputDir, "snapshots", `job-detail-${jobId}.txt`);
    await writeFile(join(projectRoot, resolvedJobRawFile), cleanJobText);
    await writeFile(join(projectRoot, resolvedJobSnapshotFile), cleanJobText);

    const parsedJob = parseJobText(cleanJobText);
    const skills = this.resolveSkills(cleanJobText, jobSegment);

    const job: JobRecord = {
      ...parsedJob,
      skills: skills.length > 0 ? skills : parsedJob.skills,
      target_id: target.target_id,
      leftIndex: target.leftIndex,
      targetProvenance: target.targetProvenance,
      job_id: jobId,
      url: currentUrl,
      collectedAt: new Date().toISOString(),
      rawTextFile: resolvedJobRawFile,
      snapshotFile: resolvedJobSnapshotFile
    };

    await trace("job-collected", { ...job });
    return job;
  }

  private buildCleanJobText(jobSegment: string): string {
    const supplementalBlock = this.buildSupplementBlock(jobSegment);
    const augmented = this.injectSupplementBeforeNoise(jobSegment, supplementalBlock);
    return cleanJobDetailText(augmented, this.config.excludedJobSectionHeadings);
  }

  private buildSupplementBlock(jobSegment: string): string {
    const jobLines = jobSegment.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rawDescriptionText = extractSectionText(
      jobLines,
      ["职位描述"],
      ["竞争力分析", "BOSS 安全提示", "工商信息", "工作地址", "更多职位", "精选职位"]
    );
    const rawSkillChipText = extractSkillChipLines(jobLines).join("\n");
    const chipSkills = rawSkillChipText.length > 0 ? extractSkillTags(rawSkillChipText) : [];
    const termSkills = extractSkillTermsFromText(rawDescriptionText || "");
    const skills = [...new Set([...chipSkills, ...termSkills])];
    return [
      rawDescriptionText ? `职位描述\n${rawDescriptionText}` : "",
      skills.length > 0 ? `技能标签\n${skills.join("\n")}` : ""
    ].filter(Boolean).join("\n\n");
  }

  private injectSupplementBeforeNoise(text: string, supplement: string): string {
    if (!supplement) return text;
    const lines = text.split(/\r?\n/);
    const firstExcludedIndex = lines.findIndex((line) => {
      const normalized = normalizeJobLine(line);
      return this.config.excludedJobSectionHeadings.some((heading) => normalized.includes(heading));
    });
    if (firstExcludedIndex < 0) {
      return [text, supplement].filter(Boolean).join("\n\n");
    }
    const beforeNoise = lines.slice(0, firstExcludedIndex).join("\n");
    const noiseTail = lines.slice(firstExcludedIndex).join("\n");
    return [beforeNoise, supplement, noiseTail].filter(Boolean).join("\n\n");
  }

  private resolveSkills(cleanText: string, rawSegment: string): string[] {
    const parsed = parseJobText(cleanText);
    const chipText = extractSkillChipLines(rawSegment.split(/\r?\n/)).join("\n");
    const chips = chipText ? extractSkillTags(chipText) : [];
    const terms = extractSkillTermsFromText(cleanText);
    const combined = [...new Set([...chips, ...terms])];
    return combined.length > 0 ? combined : (parsed.skills || []);
  }
}
