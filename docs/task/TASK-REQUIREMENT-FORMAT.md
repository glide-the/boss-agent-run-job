# Filled Task Requirement Prompt: SUO-149 / BTR-01 Backend Task Package

## Optimized Prompt

You are `BackendTaskAgent` in the `design -> issue -> task -> stage` pipeline. Convert the following backend Issue context into one executable task-stage Markdown package under `$PROJECT_ROOT/docs/task/`.

## Source Issue Fields

- Current task-package issue: `SUO-149`
- Current issue title: `产出逐联系人链路重构的 BOSS trace backend task 包`
- Current issue status at wake: `in_progress`
- Current issue priority: `medium`
- Current issue work mode: `standard`
- Assigned agent: `BackendTaskAgent`
- Target upstream implementation issue: `BTR-01`
- Available issue sources: Paperclip wake payload for `SUO-149` and `$PROJECT_ROOT/docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`

## Design Inputs

- Primary design: `$PROJECT_ROOT/docs/design/design_001_boss_trace_chat_to_job_detail.md`
- Related project doc: `$PROJECT_ROOT/docs/boss-agent-browser-trace.md`
- Existing related task package: `$PROJECT_ROOT/docs/task/SUO-139-selector-inspection-multi-job-fix.md`
- Existing stage reference: `$PROJECT_ROOT/docs/stage/stage_suo_139_selector_inspection_multi_job_fix.md`
- Current implementation baseline: `$PROJECT_ROOT/src/trace-boss.ts`
- Current config baseline: `$PROJECT_ROOT/config/boss.config.json`

## Background

The design update defines a per-contact chain as the normal BOSS trace contract: open chat once, collect the chat list, iterate configured targets, collect chat context for each target, attempt bounded job entries, return to chat in the same browser/session, and keep job detail output scoped to the clicked job/current company.

`src/trace-boss.ts` already contains most of the flow scaffolding, but `BTR-01` needs a backend task package that makes the implementation boundary explicit:

1. preserve one-open-per-run normal flow
2. preserve bounded target/job iteration with `traceTargets`, `target_id`, `maxJobs`, and `maxJobsPerTarget`
3. keep `job_id` sourced from the current `/job_detail/<job_id>.html` URL
4. keep continue-vs-abort semantics explicit for target/job failure handling
5. split orchestration, command building, output writing, and parser/filter logic out of a single monolith where needed

`BTR-02` and `BTR-03` are adjacent follow-up issues for documentation sync and verification closeout. Do not fold them into this backend task package.

## Labels / Priority

- Target implementation priority: `P0`
- Suggested labels: `backend`, `trace`, `orchestration`, `artifact-contract`, `per-target-chain`

## Dependencies

- `SUO-147`
- `docs/design/design_001_boss_trace_chat_to_job_detail.md`
- `docs/issue/ISSUES_boss-trace-chat-to-job-detail.md`
- `src/trace-boss.ts`
- `config/boss.config.json`
- Runtime dependency: valid BOSS login/session, no CAPTCHA/risk-control blockage, and live site availability

## Acceptance Conditions

- Task package is written to `$PROJECT_ROOT/docs/task/`.
- The task package maps back to `SUO-149` and `BTR-01`.
- The task package does not implement code and does not modify design/issue/stage docs.
- The task package includes title, associated Issue, task objective, implementation steps, file paths, input/output contract, dependencies, test strategy, completion flags, and risks.
- Normal `bun run trace` remains one open `https://www.zhipin.com/web/geek/chat` trajectory for the run.
- `output/chats.json` records `target_id`.
- `output/jobs.json` records `target_id` and URL-derived `job_id`.
- Normal mode does not treat `--inspect-selectors` as completion evidence.
- Multi-target execution remains bounded and configuration-driven.
- Every downstream verification path requires fresh evidence or exact external blocker evidence.

## Output Instruction

Generate a single Markdown backend task package named:

`task_01_backend_boss_trace_execution_output_contract.md`

Use concrete engineering instructions suitable for a downstream StagePlanner and implementation agent. Keep frontend, design-authoring, stage planning, and runtime execution out of scope.

## Optional Enhancers

- Include a downstream task split that StagePlanner can turn into stages.
- Include command-log and output-file proof requirements.
- Keep BTR-02 docs sync and BTR-03 validation as separate follow-up issues rather than embedding them as implementation scope here.
