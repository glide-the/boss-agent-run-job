# SUO-133 Task Package: BOSS Trace Flashing Fix

## Issue Links

- Parent issue: [SUO-133](/SUO/issues/SUO-133)
- Upstream parent: [SUO-131](/SUO/issues/SUO-131)
- Task-package issue: [SUO-134](/SUO/issues/SUO-134)
- Target downstream owner: StagePlanner for stage readiness, then ExecTaskAgent or another downstream implementation subagent for execution.

## Task Status

This is a task-stage package only. It does not authorize implementation by CEO/CEOOrchestrator and does not replace stage or exec artifacts.

`TASK-REQUIREMENT-FORMAT.md` was checked in the project workspace, CEO orchestration workspace, and current CEO agent workspace. It was not found.

Disposition update: after SUO-134 was reopened by the local-board comment `继续` on 2026-07-02, this fallback package is the task-stage artifact for SUO-134 closure. The missing canonical template remains a downstream stage/exec readiness gate unless CEOOrchestrator, StagePlanner, or the board explicitly accepts this fallback for the next phase.

## Source Context

SUO-131 asked for a repeatable BOSS agent-browser automation that turns the real browser path from the chat page to a specific job detail page into a debuggable script with structured output.

SUO-133 was opened because the prior delivery still caused repeated flashing while collecting data. The user explicitly rejected repeated page opening and asked that downstream subagents complete the fix and test it.

Current relevant files:

- `src/trace-boss.ts`
- `config/boss.config.json`
- `README.md`
- `docs/boss-agent-browser-trace.md`
- `package.json`
- `output/agent-browser-commands.log`
- `output/trace-report.md`

Current workspace hazard:

- `output/agent-browser-commands.log` and `output/trace-report.md` already contain old dry-run output.
- Do not treat those files as completion evidence unless they are refreshed by the executing agent during the SUO-133 execution run and the completion comment identifies the new run.

## Objective

Fix normal `bun run trace` so BOSS chat-to-job-detail collection runs without repeated chat-page flashing, stores stable job IDs from detail URLs, and extracts only the requested job and current-company information.

The expected user-visible behavior is:

1. Open the BOSS chat page once for normal collection.
2. Collect the full chat list by scrolling within that same browser/session.
3. Click the configured contact.
4. Collect chat context.
5. Click the job/detail entry.
6. Collect the job detail page.
7. Store a unique `job_id` parsed from the address-bar URL.

## Required Functional Changes

### 1. Remove normal-flow repeated `open chat`

Normal `bun run trace` must not repeatedly run:

```text
open https://www.zhipin.com/web/geek/chat
```

for selector probing, locator fallback, chat-list collection, contact/job collection, or per-contact loops.

Current code has separate chat opens in the normal collection path:

- `collectFullChatList(...)` starts a batch with `open chat`.
- `runSingleContactJobFlow(...)` starts another batch with `open chat`.

The execution agent should restructure normal collection so chat-list collection and contact/job collection share one browser/session flow, or otherwise prove that only one normal-flow chat open is generated. `--inspect-selectors` may remain a separate debug mode, but it must not run implicitly in normal `bun run trace`.

### 2. Keep job detail extraction focused

The job detail output must keep only the job and current company information.

Exclude recommendation, discovery, and unrelated brand/company blocks, including:

- 相似职位
- 更多相似职位
- 精选职位
- 看过该职位的人还看了
- 城市招聘
- 热门职位
- 推荐公司
- 热门企业
- 其它公司品牌信息
- 其他公司品牌信息

The execution agent should verify both raw/snapshot text cleaning and structured `output/jobs.json` fields. Do not preserve unrelated sections merely because they are present in `agent-browser read` output.

### 3. Store unique `job_id`

Each collected job must include a unique `job_id` parsed from the current address-bar job detail URL.

Example:

```text
https://www.zhipin.com/job_detail/8f3825274588ab210nF63ty8EFVU.html
```

must produce:

```text
8f3825274588ab210nF63ty8EFVU
```

The `job_id` must be reflected in `output/jobs.json` and should be used in raw/snapshot output names when available.

### 4. Centralize required agent-browser launch args

Every agent-browser browser/session/open/launch path used by scripts must include these args through one centralized path:

```text
--extension /Users/dmeck/agent-brower/capsolver-extension
--extension /Users/dmeck/agent-brower/stealth-extension
--state /Users/dmeck/agent-brower/my-auth.json
--headed
```

Future wrapper calls must not be able to omit them accidentally.

## Allowed Modification Scope

The eventual execution agent may modify:

- `src/trace-boss.ts`
- `config/boss.config.json`
- `README.md`
- `docs/boss-agent-browser-trace.md`
- `package.json`, only if a script/test command change is necessary and justified.
- `output/`, only for fresh verification evidence from the execution run.

## Forbidden Modification Scope

The execution agent must not modify:

- `/Users/dmeck/agent-brower/capsolver-extension`
- `/Users/dmeck/agent-brower/stealth-extension`
- `/Users/dmeck/agent-brower/my-auth.json`
- Any other agent-browser login state, extension directory, browser profile, or credential material.
- Secret, token, auth, or environment files.
- `agents/` instructions for other agents.
- `docs/exec/` formal execution reports.
- Unrelated project files.
- Existing dirty `output/` files as a substitute for fresh proof.

## Verification Requirements

The executing agent must run the smallest verification that proves the fix:

1. `bun run check`
2. A fresh normal trace:

```bash
bun run trace
```

If a real BOSS run is blocked by login, CAPTCHA, risk control, or site availability, the agent must say exactly where it stopped and provide the smallest reproducible local verification of the command-generation path instead.

The completion evidence must include:

- Changed file list and concise summary.
- Exact `bun run check` result.
- Fresh normal trace result, or the exact blocker plus command-generation verification.
- `output/agent-browser-commands.log` proof that normal collection no longer repeatedly opens `https://www.zhipin.com/web/geek/chat`.
- Proof that the required agent-browser args appear in every generated agent-browser command.
- Proof that `job_id` is parsed from `/job_detail/...html`.
- Proof that excluded recommendation/company sections are absent from final job detail outputs.
- Confirmation that execution was performed by a downstream implementation subagent or ExecTaskAgent, not closed by orchestration audit alone.

## Acceptance Criteria

- Normal `bun run trace` does not repeat `open https://www.zhipin.com/web/geek/chat` for selector probing, locator fallback, chat-list collection, contact/job collection, or per-contact loops.
- `--inspect-selectors` remains opt-in debug behavior and is not part of normal collection.
- Full chat-list collection uses scrolls in the same normal browser/session flow.
- Contact click, chat collection, job click, and job detail collection happen without forcing another chat-page open in normal mode.
- Job detail output keeps only job and current company information.
- Excluded recommendation, discovery, hot job, and unrelated company-brand sections are removed from job outputs.
- Each job record stores a unique `job_id` parsed from the job detail URL.
- Every agent-browser command path includes both extensions, the auth state file, and `--headed`.
- Fresh evidence is created for this execution; old dry-run `output/trace-report.md` or `output/agent-browser-commands.log` is not accepted as completion proof.

## Stage and Exec Handoff Notes

- Do not hand this directly to ExecTaskAgent until StagePlanner or CEOOrchestrator resolves the missing `TASK-REQUIREMENT-FORMAT.md` question and creates/approves a stage path.
- StagePlanner is expected to convert this package into `docs/stage/` planning when its agent state is recovered.
- ExecTaskAgent should create formal execution evidence only after stage approval; this task package intentionally does not create `docs/exec/`.

## Carried-Forward Stage Gates

- Missing `TASK-REQUIREMENT-FORMAT.md`: owner is CEOOrchestrator or the board. Required action before strict stage/exec gating: provide the canonical template location or explicitly accept this fallback task package for the next phase.
- StagePlanner agent state was reported as `error`: owner is CEOOrchestrator or the board. Required action: recover/retry StagePlanner before exec handoff.
