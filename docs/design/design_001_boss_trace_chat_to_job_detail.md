# BOSS trace chat-to-job-detail trajectory design

Design ID: `DESIGN-001-BOSS-TRACE-CHAT-TO-JOB-DETAIL`

Related issues:

- [SUO-146](/SUO/issues/SUO-146): upstream coordination for contact-chain refactor
- [SUO-147](/SUO/issues/SUO-147): update design for per-contact chain execution
- [SUO-139](/SUO/issues/SUO-139): selector-inspection and multi-job task package
- [SUO-140](/SUO/issues/SUO-140): backend execution plan for SUO-139
- [SUO-137](/SUO/issues/SUO-137): update BOSS trace background and goals into project design docs

Related project docs:

- `docs/boss-agent-browser-trace.md`
- `docs/task/SUO-133-boss-trace-flashing-fix.md`
- `docs/task/SUO-139-selector-inspection-multi-job-fix.md`
- `docs/task/TASK-REQUIREMENT-FORMAT.md`
- `docs/stage/stage_suo_139_selector_inspection_multi_job_fix.md`
- `docs/exec/exec_SUO-143_job-detail-more-info-blocked.md`
- `docs/task/SUO-133-boss-trace-flashing-fix.md`

## 1. Background and Goals

`SUO-137` established a normal, single-open/single-session trace trajectory for BOSS chat → job detail.  
`src/trace-boss.ts`, `README.md`, and downstream stage/exec work now require a stricter contract: trace must execute a bounded **per-contact chain** for each configured target and continue safely across multiple contacts.

This design update supersedes the prior single-contact framing by explicitly defining:

- one `open https://www.zhipin.com/web/geek/chat` per normal run
- repeated in-session contact and job traversals
- bounded per-contact job-attempt loops
- explicit target-level failure recovery

The goal is a deterministic, low-noise, single-session path consumable by downstream Task/Stage/Exec agents.

## 2. Scope Definition

In scope:

- Define the normal `bun run trace` contract as:
  1. open chat once
  2. collect chat list
  3. iterate configured targets in order (contact-by-contact)
  4. for each target, collect chat context
  5. for each target, try bounded jobs
  6. return to chat for the next target in the same browser/session
  7. emit per-target and per-job evidence
- Define target identity and bound rules (`traceTargets[*].id`, `maxJobs`, `maxJobsPerTarget`).
- Define how target/job failures are recorded and when the run continues vs aborts.
- Define per-target/per-job output boundaries and naming.
- Define mandatory launch args for all command paths.

Out of scope:

- Implementing code in `src/`, `config/`, `README.md`, `docs/task/`, `docs/stage/`, `docs/exec/`, or runtime outputs.
- Bypassing BOSS login, CAPTCHA, risk control, rate limits, or platform restrictions.
- Unbounded broad crawling beyond configured target bounds.

## 3. Solution Summary

Normal `bun run trace` remains one session, one chat open.  
The key update is to treat each target as a chain:

1. Click target contact.
2. Read and save chat context for that target.
3. Click bounded job entry(s) for that target.
4. Parse URL-derived `job_id` and collect focused job text/snapshot.
5. Return to chat with in-session command (`back`) before next target/job when needed.

This chain runs repeatedly for configured targets:

- `traceTargets` if present (with de-dup and stable `target_id`)
- fallback to remaining `conversationEntryLocators`

Debug selector probing remains explicit `--inspect-selectors` and is not accepted as normal completion evidence.

## 4. Detailed Design

### 4.1 Normal Flow State Machine (Per-Contact Chain)

State transitions:

| State | Entry | Exit | Invariance |
| --- | --- | --- | --- |
| `START_CHAT` | open configured chat URL once | chat page loaded | no other `open chat` in normal mode |
| `COLLECT_CHAT_LIST` | list scrolling + read/snapshot | list collection done | same session preserved |
| `FOR_EACH_TARGET_START` | resolved target loaded | target list exhausted or blocker | `target_id` derived once from config or fallback index |
| `SELECT_CONTACT` | click target locator | chat panel changed | no re-open of chat URL |
| `COLLECT_CHAT_CONTEXT` | read current chat context | chat evidence persisted | context evidence includes `target_id` |
| `FOR_EACH_JOB_ATTEMPT` | click job locator by job budget | job detail collected or target-job failure recorded | stop when `maxJobs` / `maxJobsPerTarget` reached |
| `RETURN_TO_CHAT` | back to list context (`browser-back`) if needed | next job/target | URL/state must return to list/chat phase |
| `DONE_OR_BLOCKED` | no more targets or external blocker | finish/fail with blocker evidence | failure state includes exact blocker + command evidence |

Looping rules:

- For each target, all configured `jobEntryLocators` (bounded) are attempted in order.
- `--url "*job_detail*"` and marker-based extraction determine success.
- If a target job fails (missing detail URL / bad locator / stale segment), continue to next configured job if budget remains.
- If contact transition fails, continue to next target only when that target is unrecoverable; abort entire run only for external blockers:
  - login redirect
  - CAPTCHA / risk-control
  - browser/session loss
  - site availability error

### 4.2 Target Resolution and Limits

Target resolution rules:

- Use `traceTargets` first.
- Merge leftover `conversationEntryLocators` not duplicated by locator signature.
- Generate stable `target_id`:
  - `traceTargets[*].id` when provided
  - fallback `target-{index}` in resolved order
- Resolve job locator list per target as:
  - `traceTargets[*].jobEntryLocators` when present
  - otherwise global `jobEntryLocators`
  - bounded by `traceTargets[*].maxJobs` (target override), else `maxJobsPerTarget`, else locator count
- Enforce fallback duplication only to satisfy declared limit (CSS locator repeat strategy), not to extend unbounded collection.

### 4.3 Selector and Data Collection Modes

Normal mode:

- One chat open and one session.
- Per-target loops for contacts/jobs.
- Failure must be recorded as trace evidence and does not require repeated open.

Inspection mode:

- Enabled only with `bun run trace -- --inspect-selectors`.
- Selector probes are append-only commands in the current session.
- Must never become normal-flow acceptance evidence.

### 4.4 Per-Target Output Contract

Output contracts:

- `output/chats.json` must include one or more records:
  - `target_id`
  - `contactLocator`
  - `collectedAt`
  - `rawTextFile`
  - `snapshotFile`
- `output/jobs.json` must include for each successful job:
  - `target_id`
  - `job_id`
  - `url`
  - `rawTextFile`
  - `snapshotFile` when saved
  - `screenshotFile` when screenshots enabled
  - `collectedAt`

Per-contact chain artifacts:

- `output/raw/chat-<target-id-or-index>.txt`
- `output/snapshots/chat-<target-id-or-index>.txt`
- `output/raw/flow-<target-id-or-index>.txt`
- `output/raw/job-<job_id>.txt` for successfully collected detail pages
- `output/snapshots/job-detail-<job_id>.txt`

### 4.5 Job Detail Output Boundary

Job detail output must remain focused on the clicked/active job and current company.

Required job fields (when present):

- `job_id`
- `url`
- `title`
- `salary`
- `location`
- `experience`
- `education`
- `description`
- `skills`
- `company`
- `company_scale`
- `industry`
- `recruiter`
- `collectedAt`
- `target_id`

Required filtering:

- remove `相似职位`, `更多相似职位`, `精选职位`, `看过该职位的人还看了`, `城市招聘`, `热门职位`, `推荐公司`, `热门企业`, `其他公司品牌信息`, `其它公司品牌信息`
- filtering applies to raw saved text and final structured output

### 4.6 `job_id` Extraction

Truth source:

- parse current URL with `\`/job_detail/<job_id>.html\`` after job detail page load.

Example:

`https://www.zhipin.com/job_detail/8f3825274588ab210nF63ty8EFVU.html`

must yield:

`8f3825274588ab210nF63ty8EFVU`

Deduplication:

- duplicate `(target_id, job_id)` pairs are skipped and traced as `job-duplicate-skipped`.

### 4.7 Command and Launch Contract

All `agent-browser` command paths use the same launch constructor:

- `--extension /Users/dmeck/agent-brower/capsolver-extension`
- `--extension /Users/dmeck/agent-brower/stealth-extension`
- `--state /Users/dmeck/agent-brower/my-auth.json`
- `--headed`

`--inspect-selectors` must only add commands at the end of current batch/session context.

### 4.8 Evidence Outputs

Expected outputs:

- `output/chat-list.json`
- `output/chats.json`
- `output/jobs.json`
- `output/raw/chat-*.txt`
- `output/raw/flow-*.txt`
- `output/raw/job-<job_id>.txt`
- `output/snapshots/chat-*.txt`
- `output/snapshots/job-detail-*.txt`
- `output/raw/chat-list-full.txt`
- `output/raw/job-list-detail-*.txt` (if implemented by downstream parser variants)
- `output/screenshots/job-*.png` when enabled
- `output/trace-events.json`
- `output/selector-inspection.json` when debug mode is enabled
- `output/agent-browser-commands.log`

Old output files from previous runs are not final completion evidence without refresh or explicit blocker proof.

## 5. Acceptance Criteria

- `docs/design/design_001_boss_trace_chat_to_job_detail.md` includes this per-contact chain contract and is the active design source for SUO-147.
- Normal `bun run trace` opens `https://www.zhipin.com/web/geek/chat` only once.
- Chat list collection and target loop happen in the same session.
- For each target, a `chat-<target>.txt` raw/snapshot evidence exists.
- For each attempted job entry:
  - success: produces a `job-<job_id>.txt` (or equivalent) and job JSON record with `target_id`
  - failure: records `job-not-collected` in trace events with reason and locator
- Normal mode does not run broad selector probing or repeated chat opens in loops.
- `jobs.json` records stable `target_id` + URL-derived `job_id`.
- Multi-target execution does not use `open https://www.zhipin.com/web/geek/chat` to move between targets.
- Return transitions use same-session strategy (preferred `back`) and do not reopen chat unless a real external blocker forces explicit recovery.
- `output/agent-browser-commands.log` contains required launch args for every generated command.
- Job outputs and raw/snapshot fields do not include excluded recommendation/other-company blocks.

## 6. Risks and Dependencies

| Risk or dependency | Impact | Owner / mitigation |
| --- | --- | --- |
| Target locator drift | Some contacts/jobs become unclickable | keep locators configurable; preserve debug evidence; do not fake progress by reopening chat |
| Virtualized chat list and duplicate entries | Missing contact or unstable order | collect list after scrolling, and keep `target_id`-indexed records |
| External session blockers (login/CAPTCHA/risk control/site down) | Normal flow cannot proceed | record exact blocker and provide command-generation evidence |
| CSS locator fallback duplication behavior | Could create repeated attempts beyond useful items | enforce explicit per-target `maxJobs` and stop conditions |
| Old per-contact assumptions in downstream docs | Inconsistent execution | this design explicitly supersedes those assumptions and is the shared contract source |

## 7. Key Decision Records

### DEC-001: Normal trace is single-open and single-session

Decision: normal `bun run trace` opens the BOSS chat URL once and runs contact/job collection in the same browser/session.

Reason: repeated chat opens caused flashing and state instability.

Impact: normal mode cannot use repeated `open chat` for list/contacts/jobs.

### DEC-002: Selector inspection is opt-in debug mode

Decision: broad selector/data probing is only for `--inspect-selectors`.

Reason: normal path must stay reproducible and quiet.

Impact: inspection evidence cannot be treated as normal completion evidence.

### DEC-003: Job detail data is scoped to current job and current company

Decision: exclude recommendation/discovery noise and unrelated company sections from accepted output.

Reason: required output is the selected job path, not whole page recommendations.

Impact: evidence must prove final fields are focused.

### DEC-004: `job_id` comes from address-bar URL

Decision: extract `job_id` from `/job_detail/<job_id>.html` only.

Reason: URL-based IDs are stable and tie all artifacts to visited pages.

Impact: evidence filenames and records use extracted `job_id` when available.

### DEC-005: Required `agent-browser` args are centralized

Decision: one centralized launch constructor for all command paths.

Reason: missing extension/state/headed args breaks reproducibility.

Impact: command log is mandatory acceptance evidence.

### DEC-006: Per-contact chain execution is first-class

Decision: normal flow executes contacts as bounded chains (`target -> chat -> jobs -> return`) in order, reusing the same session.

Reason: implementation now supports `traceTargets` and target-level batching; design must match to avoid stage/task mismatch.

Impact: design and output contracts are target-oriented and include per-contact artifacts.

### DEC-007: Target scope is bounded and resumable

Decision: each target uses declared `maxJobs` / `maxJobsPerTarget`; target failures are recorded but do not necessarily abort all targets.

Reason: unbounded multi-contact traversal creates noise and non-reproducible runs.

Impact: continue-on-target-error and explicit external-blocker abort rules are required.

## 8. Incremental Change Notes

- 2026-07-02: Updated this design to per-contact chain execution for SUO-147. This supersedes the earlier single-contact-path interpretation in `SUO-137`-level framing by explicitly defining bounded `traceTargets` iteration, per-target loop outcomes, and target-level output contracts.
- 2026-07-02: Linked `docs/stage/stage_suo_139_selector_inspection_multi_job_fix.md` and `docs/exec/exec_SUO-143_job-detail-more-info-blocked.md` as active downstream context for design-consistency and verification constraints.
- 2026-07-02: Clarified that normal flow continues to next target on recoverable target/job failures and aborts only on external blockers (login/CAPTCHA/risk/site loss, or browser/session failure).

## 9. Clarification / Blockers

- [CLARIFICATION_NEEDED] None for now; unresolved runtime blockers (login/CAPTCHA/risk/site availability) should be recorded as execution blockers at trace time with exact URLs and trace event reasons.
