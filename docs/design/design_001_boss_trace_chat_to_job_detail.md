# BOSS trace chat-to-job-detail trajectory design

Design ID: `DESIGN-001-BOSS-TRACE-CHAT-TO-JOB-DETAIL`

Related issues:

- [SUO-131](/SUO/issues/SUO-131): update interaction flow
- [SUO-137](/SUO/issues/SUO-137): update BOSS trace background and goals into project design docs

Related project docs:

- `docs/boss-agent-browser-trace.md`
- `docs/task/SUO-133-boss-trace-flashing-fix.md`
- `docs/stage/stage_suo_133_boss_trace_flashing_fix.md`

## 1. Background and Goals

Previous work produced scripts and docs for BOSS trace collection, but it did not reliably solidify the real `agent-browser` BOSS chat -> job detail trajectory. The unsafe behavior was repeated `open chat` and selector probing in the normal flow, which caused visible page flashing and made the captured path hard to trust.

The corrected direction is a normal trace path that opens BOSS chat once, then completes the whole trajectory in the same browser/session:

1. Open `https://www.zhipin.com/web/geek/chat`.
2. Scroll the chat list to collect available conversations.
3. Click the configured contact.
4. Collect current chat context.
5. Click the job/detail entry inside that chat.
6. Collect the job detail page.
7. Parse and store the unique `job_id` from the address-bar job detail URL.

The design goal is to convert the real BOSS chat-to-job-detail trajectory into a repeatable, debuggable automation script that can produce structured results without repeated normal-flow page opens.

## 2. Scope Definition

In scope:

- Define the normal BOSS chat-to-job-detail trace contract.
- Define output boundaries for chat data, job detail data, trace events, raw text, snapshots, screenshots, and command logs.
- Define the no-flashing rule: selector/data collection in normal mode must complete within one open/session and must not repeatedly open the chat page.
- Define the focused job detail extraction rule: output only the current job and current company.
- Define `job_id` extraction from the current detail URL.
- Define mandatory `agent-browser` launch arguments for every browser/session/open/launch path used by the scripts.

Out of scope:

- Implementing or modifying `src/`, `config/`, `README.md`, `docs/task/`, `docs/stage/`, `docs/exec/`, or runtime output files from this design issue.
- Creating Issue, Task, Stage, or Exec artifacts.
- Bypassing BOSS login, CAPTCHA, risk control, rate limits, or platform restrictions.
- Broad multi-contact crawling beyond the configured trace flow.

## 3. Solution Summary

Normal `bun run trace` must behave as a single trajectory, not as repeated independent probes. Debug selector probing may exist only behind an explicit opt-in mode such as `--inspect-selectors`.

The script should centralize `agent-browser` invocation so every command path receives the required launch context:

```text
--extension /Users/dmeck/agent-brower/capsolver-extension
--extension /Users/dmeck/agent-brower/stealth-extension
--state /Users/dmeck/agent-brower/my-auth.json
--headed
```

The collection contract is:

- One normal-flow chat open per run.
- All chat-list scrolling, contact click, chat capture, job click, and detail capture happen in the same browser/session.
- Job detail output is filtered to the selected job and current company.
- `job_id` is parsed from the address-bar URL, for example `job_detail/8f3825274588ab210nF63ty8EFVU.html` -> `8f3825274588ab210nF63ty8EFVU`.
- Evidence is generated from the current run, not reused from stale output files.

## 4. Detailed Design

### 4.1 Normal Trace State Machine

The normal trace should follow this state machine:

| State | Entry action | Exit condition | Prohibited behavior |
| --- | --- | --- | --- |
| `START_CHAT` | Open the configured chat URL once | Chat page loaded or explicit login/risk blocker recorded | Reopening chat for selector discovery |
| `COLLECT_CHAT_LIST` | Scroll the conversation list in the same session | Configured scroll budget exhausted or no new visible items | Starting a new browser/session for list collection |
| `SELECT_CONTACT` | Click configured contact locator | Current chat panel changes and is readable | Reopening chat before clicking the contact |
| `COLLECT_CHAT_CONTEXT` | Read current chat panel and save context | Chat context persisted | Running broad selector probes that refresh the page |
| `OPEN_JOB_DETAIL` | Click configured job/detail locator | URL matches `/job_detail/` | Trying every fallback locator by reopening chat |
| `COLLECT_JOB_DETAIL` | Read focused job detail page and current URL | Job output persisted with `job_id` | Including recommendation or unrelated company sections |
| `RETURN_OR_FINISH` | Finish, or use browser back only if configured for another contact | Next configured contact or run complete | Returning through another `open chat` in normal mode |

### 4.2 Selector and Data Collection Modes

Normal mode:

- Uses configured locators conservatively.
- Uses one browser/session and one chat open.
- Fails with trace evidence when configured locators are insufficient.
- Records attempted locator, result, URL, and failure reason in trace events.

Inspection mode:

- Must be explicitly enabled, for example `bun run trace -- --inspect-selectors`.
- May perform broader selector probing and extra page reads.
- Must not be invoked implicitly by normal `bun run trace`.
- Its output should be labeled as debug evidence, not normal-flow completion evidence.

### 4.3 Job Detail Output Boundary

The job detail output must include only the selected job and current company information. These fields are acceptable when present:

- `job_id`
- `url`
- `title`
- `salary`
- `location`
- `experience`
- `education`
- `description`
- `skills` or tags
- `company`
- `company_scale`
- `industry`
- `recruiter`
- `collectedAt`

The job detail output must exclude recommendation, discovery, unrelated job, and unrelated company/brand sections, including:

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

Filtering should be applied before final structured output is accepted. It is not enough for only one view of the data to be clean if `output/jobs.json` or raw job text still carries excluded sections as final evidence.

### 4.4 `job_id` Extraction

The source of truth for `job_id` is the current address-bar URL after the job detail page loads.

Extraction rule:

```text
/job_detail/<job_id>.html
```

Example:

```text
https://www.zhipin.com/job_detail/8f3825274588ab210nF63ty8EFVU.html
```

must produce:

```text
8f3825274588ab210nF63ty8EFVU
```

The extracted value must be stored in `output/jobs.json`. When available, it should also be used in raw/snapshot filenames such as `job-<job_id>.txt` so evidence can be tied back to the same detail page.

### 4.5 Command and Launch Contract

All `agent-browser` command paths used by scripts must pass through one centralized launch/open/session construction path. This avoids future wrapper calls accidentally omitting required browser state.

Mandatory launch arguments:

```text
--extension /Users/dmeck/agent-brower/capsolver-extension
--extension /Users/dmeck/agent-brower/stealth-extension
--state /Users/dmeck/agent-brower/my-auth.json
--headed
```

The command log is part of verification. It must show that normal `bun run trace` generated only one `open https://www.zhipin.com/web/geek/chat` in the normal collection path and that every generated `agent-browser` command includes the required launch context.

### 4.6 Evidence Outputs

Expected output categories:

- `output/chat-list.json`: chat list collected by normal list scrolling.
- `output/chats.json`: current-contact chat context.
- `output/jobs.json`: structured job detail data with `job_id`.
- `output/raw/chat-*.txt`: raw chat context evidence.
- `output/raw/job-<job_id>.txt`: filtered job/current-company evidence.
- `output/snapshots/`: snapshots used for interaction and debugging.
- `output/screenshots/`: job detail screenshots when screenshot mode is enabled.
- `output/trace-events.json`: state transitions, locator attempts, URL changes, blockers, and completion events.
- `output/agent-browser-commands.log`: generated command evidence for no repeated chat opens and mandatory launch args.

Old output files must not be treated as completion evidence unless the execution owner explicitly refreshes them during the current run.

## 5. Acceptance Criteria

- `docs/design/design_001_boss_trace_chat_to_job_detail.md` exists as the design input for this work.
- Normal `bun run trace` opens `https://www.zhipin.com/web/geek/chat` once for normal collection.
- Chat-list scrolling, contact click, chat capture, job click, and job detail capture run in the same browser/session.
- Normal mode does not perform repeated `open chat` for selector probing, locator fallback, chat-list collection, contact/job collection, or per-contact loops.
- Selector inspection remains explicit opt-in debug behavior and is not part of normal collection.
- Every `agent-browser` browser/session/open/launch path includes both extensions, the auth state file, and `--headed`.
- Each collected job stores a unique `job_id` parsed from the current job detail URL.
- Final job detail outputs contain only the selected job and current company.
- Final job detail outputs exclude 相似职位, 更多相似职位, 精选职位, 看过该职位的人还看了, 城市招聘, 热门职位, 推荐公司, 热门企业, 其它公司品牌信息, and 其他公司品牌信息.
- Verification uses fresh evidence from the execution run, or records an exact blocker such as login, CAPTCHA, risk control, or site availability plus command-generation proof.

## 6. Risks and Dependencies

| Risk or dependency | Impact | Owner / mitigation |
| --- | --- | --- |
| BOSS login, CAPTCHA, risk control, or site availability blocks live trace | A fresh end-to-end run may not complete | Execution owner records exact stop point and provides command-generation verification |
| BOSS DOM or text changes | Configured locators may fail | Keep locators configurable and fail with trace evidence rather than reopening pages repeatedly |
| Chat list uses virtual scrolling | Snapshot may miss offscreen conversations | Scroll within the same session and persist visible list evidence |
| Hidden command wrapper omits launch args | Browser state becomes inconsistent | Centralize launch args and verify command log |
| Noisy job detail page includes recommendations | Final data may include unrelated roles or companies | Apply output-level exclusion checks before accepting results |
| Existing output files are stale | False completion evidence | Require fresh run evidence or explicitly marked blocker evidence |

## 7. Key Decision Records

### DEC-001: Normal trace is single-open and single-session

Decision: normal `bun run trace` opens the BOSS chat URL once and completes list scrolling, contact selection, chat capture, job click, and job detail capture in that same browser/session.

Reason: repeated chat opens caused visible flashing and undermined trajectory reliability.

Impact: selector probing and fallback exploration cannot silently reopen chat in normal mode.

### DEC-002: Selector inspection is opt-in debug mode

Decision: broad selector/data probing belongs only in explicit inspection mode.

Reason: normal collection must be repeatable and quiet; debug probing can refresh or disturb the page.

Impact: execution agents must keep `--inspect-selectors` or equivalent debug flags separate from normal `bun run trace`.

### DEC-003: Job detail data is scoped to current job and current company

Decision: recommendation, discovery, hot job, city recruiting, and unrelated company/brand sections are excluded from final job detail outputs.

Reason: the task is to capture the selected chat-linked job, not the surrounding marketplace recommendations.

Impact: final evidence must prove these sections are absent from accepted outputs.

### DEC-004: `job_id` comes from the address-bar URL

Decision: parse `job_id` from the current job detail URL after navigation succeeds.

Reason: URL-derived IDs are more stable than page text and tie output files to the actual visited detail page.

Impact: `output/jobs.json` must store the parsed `job_id`, and raw/snapshot filenames should use it when available.

### DEC-005: Required `agent-browser` args are centralized

Decision: all script-created `agent-browser` command paths must include the two extension paths, state file, and headed mode through one centralized construction path.

Reason: missing browser state or extension arguments can alter page behavior and make trace results non-reproducible.

Impact: verification must include command-log proof for these args.

## 8. Incremental Change Notes

- 2026-07-02: Created this design draft because `docs/design/` was missing and `docs/stage/stage_suo_133_boss_trace_flashing_fix.md` listed missing design input as an execute gate.
- 2026-07-02: Added the background that earlier scripts/docs did not reliably capture the true `agent-browser` BOSS chat -> job detail trajectory and that repeated `open chat` / selector probing caused page flashing.
- 2026-07-02: Added the current task goals for focused job/current-company output, single-session selector/data collection, `job_id` extraction, and required `agent-browser` launch args.

## 9. Blocking or Clarification Notes

No design blocker remains for the BOSS trace background/goal update requested by [SUO-137](/SUO/issues/SUO-137).

This design resolves the missing `docs/design/` input gate named in `docs/stage/stage_suo_133_boss_trace_flashing_fix.md`. It does not resolve the separate missing `TASK-REQUIREMENT-FORMAT.md` gate or authorize execute handoff; those remain owned by CEOOrchestrator, StagePlanner, or the board according to the existing stage document.
