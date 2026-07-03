# Filled Task Requirement Prompt: SUO-165 / BTR-01 Backend Task Package Rewrite

## Optimized Prompt

You are `BackendTaskAgent` in the `design -> issue -> task -> stage` pipeline. Convert the following backend Issue context into one executable task-stage Markdown package under `$PROJECT_ROOT/docs/task/`.

## Source Issue Fields

- Current task-package issue: `SUO-165`
- Current issue title: `同步 README、trace 指南与 backend task 包到 all-left-panel contract`
- Current issue status at wake: `in_progress`
- Current issue priority: `medium`
- Current issue work mode: `standard`
- Assigned agent: `BackendTaskAgent`
- Target upstream implementation issue: `BTR-01`
- Available issue sources: Paperclip wake payload for `SUO-165` and `$PROJECT_ROOT/docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`

## Design Inputs

- Primary design: `$PROJECT_ROOT/docs/design/design_001_boss_trace_chat_to_job_detail.md`
- Related project doc: `$PROJECT_ROOT/docs/boss-agent-browser-trace.md`
- Existing related task package: `$PROJECT_ROOT/docs/task/SUO-139-selector-inspection-multi-job-fix.md`
- Existing stage reference: `$PROJECT_ROOT/docs/stage/stage_suo_150_boss_trace_per_contact_chain_backend.md`
- Current implementation baseline: `$PROJECT_ROOT/src/trace-boss.ts`
- Current config baseline: `$PROJECT_ROOT/config/boss.config.json`

## Background

The active design and issue list now define left-panel conversation discovery as the normal BOSS trace source of truth: open chat once, collect the chat list, resolve left-panel targets, preserve `leftIndex` and `targetProvenance`, iterate per target in the same browser/session, accept at most one current-session-bound job per target, return to chat with browser history, and keep job detail output scoped to the clicked job/current company.

`BTR-01` needs a backend task package that makes the implementation boundary explicit:

1. preserve one-open-per-run normal flow
2. resolve targets from discovered left-panel conversations first, then merge `traceTargets` / `conversationEntryLocators` as overrides or compatibility inputs without narrowing coverage
3. keep `leftIndex`, `target_id`, and `targetProvenance` available for coverage audit
4. keep `job_id` sourced from the current `/job_detail/<job_id>.html` URL
5. keep continue-vs-abort semantics explicit for target/job failure handling
6. split orchestration, command building, output writing, and parser/filter logic only where needed, while keeping the current helper-module boundaries intact

`BTR-02` and `BTR-03` are adjacent follow-up issues for documentation sync and verification closeout. Do not fold them into this backend task package.

Downstream handoff after this package:

1. `SUO-162` owned by `StagePlanner` for stage derivation.
2. `SUO-163` owned by `ExecTaskAgent` for execution evidence and fresh runtime validation.

## Labels / Priority

- Target implementation priority: `P0`
- Suggested labels: `backend`, `trace`, `orchestration`, `artifact-contract`, `left-panel-coverage`, `per-target-chain`

## Dependencies

- `SUO-157`
- `SUO-160`
- `SUO-147`
- `docs/design/design_001_boss_trace_chat_to_job_detail.md`
- `docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`
- `src/trace-boss.ts`
- `config/boss.config.json`
- Runtime dependency: valid BOSS login/session, no CAPTCHA/risk-control blockage, and live site availability

## Acceptance Conditions

- Task package is written to `$PROJECT_ROOT/docs/task/`.
- The task package maps back to `SUO-165` and `BTR-01`.
- The task package does not implement code and does not modify design/issue/stage docs.
- The task package includes title, associated Issue, task objective, implementation steps, file paths, input/output contract, dependencies, test strategy, completion flags, and risks.
- Normal `bun run trace` remains one open `https://www.zhipin.com/web/geek/chat` trajectory for the run.
- `output/chat-list.json`, `output/chats.json`, `output/jobs.json`, and `output/trace-events.json` carry `leftIndex`, `target_id`, and `targetProvenance` where applicable.
- `output/jobs.json` records `target_id` and URL-derived `job_id`.
- `output/jobs.json` does not accept `job_sug_*` or `/recommend/` URLs as successful jobs.
- Normal mode accepts at most one job per target and does not continue to same-contact other jobs after a success.
- Normal mode does not treat `--inspect-selectors` as completion evidence.
- `--inspect-selectors` must reuse the same resolved target cardinality as normal mode and remain debug-only.
- Every downstream verification path requires fresh evidence or exact external blocker evidence.

## Output Instruction

Generate a single Markdown backend task package named:

`task_01_backend_boss_trace_execution_output_contract.md`

Use concrete engineering instructions suitable for a downstream StagePlanner and implementation agent. Keep frontend, design-authoring, stage planning, and runtime execution out of scope.

## Optional Enhancers

- Include a downstream task split that StagePlanner can turn into stages.
- Include command-log and output-file proof requirements.
- Keep BTR-02 docs sync and BTR-03 validation as separate follow-up issues rather than embedding them as implementation scope here.
