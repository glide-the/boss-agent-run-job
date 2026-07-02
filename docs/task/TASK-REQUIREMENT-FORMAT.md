# Filled Task Requirement Prompt: SUO-140 / SUO-139 Backend Task Package

## Optimized Prompt

You are `BackendTaskAgent` in the `design -> issue -> task -> stage` pipeline. Convert the following backend Issue context into one executable task-stage Markdown package under `$PROJECT_ROOT/docs/task/`.

## Source Issue Fields

- Current task-package issue: `SUO-140`
- Current issue title: `产出 SUO-139 selector inspection 单会话与多岗位采集 task 包`
- Current issue status at wake: `in_progress`
- Current issue priority: `medium`
- Current issue work mode: `standard`
- Assigned agent: `BackendTaskAgent`
- Target upstream implementation issue: `SUO-139`
- Available issue source: Paperclip wake payload for `SUO-140`; `$PROJECT_ROOT/docs/issue/` is absent in the current workspace, so no local Issue-list file can be cited as input.

## Design Inputs

- Primary design: `$PROJECT_ROOT/docs/design/design_001_boss_trace_chat_to_job_detail.md`
- Related project doc: `$PROJECT_ROOT/docs/boss-agent-browser-trace.md`
- Existing related task package: `$PROJECT_ROOT/docs/task/SUO-133-boss-trace-flashing-fix.md`
- Existing stage reference: `$PROJECT_ROOT/docs/stage/stage_suo_133_boss_trace_flashing_fix.md`

## Background

The BOSS trace collector must keep normal data collection quiet and reproducible. Earlier work established that normal `bun run trace` should open `https://www.zhipin.com/web/geek/chat` only once, collect the chat list, click configured contacts, read chat context, click the job/detail entry, and collect focused job detail data in the same browser/session. Broad selector probing is allowed only as explicit opt-in inspection mode.

`SUO-139` extends that backend work with a task package for:

1. `selector inspection`: keep selector probing explicit, evidence-labeled, and separate from normal trace completion.
2. `single-session collection`: preserve the no-flashing rule in normal mode.
3. `multi-job collection`: support collecting multiple configured jobs/contacts without reopening chat for each item, while keeping output scoped to the selected job/current company and preserving `job_id` extraction.

## Labels / Priority

- Priority: medium
- Suggested labels: backend, task-package, boss-trace, agent-browser, selector-inspection, single-session, multi-job

## Dependencies

- Design contract in `docs/design/design_001_boss_trace_chat_to_job_detail.md`
- Current implementation files:
  - `src/trace-boss.ts`
  - `config/boss.config.json`
  - `README.md`
  - `docs/boss-agent-browser-trace.md`
  - `package.json`
- Required `agent-browser` launch args:
  - `--extension /Users/dmeck/agent-brower/capsolver-extension`
  - `--extension /Users/dmeck/agent-brower/stealth-extension`
  - `--state /Users/dmeck/agent-brower/my-auth.json`
  - `--headed`
- External runtime dependency: BOSS login/session availability, CAPTCHA/risk-control state, and live site availability.

## Acceptance Conditions

- Task package is written to `$PROJECT_ROOT/docs/task/`.
- The task package maps back to `SUO-140` and `SUO-139`.
- The task package does not implement code and does not modify design/issue/stage docs.
- The task package includes title, associated Issue, task objective, implementation steps, file paths, input/output contract, dependencies, test strategy, completion flags, and risks.
- Normal mode remains one chat open and one browser/session trajectory.
- Selector inspection remains explicitly opt-in and cannot be accepted as normal-flow completion evidence.
- Multi-job collection is planned as configured bounded collection, not broad crawling.
- Every downstream verification path requires fresh evidence or exact external blocker evidence.

## Output Instruction

Generate a single Markdown backend task package named:

`SUO-139-selector-inspection-multi-job-fix.md`

Use concrete engineering instructions suitable for a downstream StagePlanner and implementation agent. Keep frontend, design-authoring, stage planning, and runtime execution out of scope.

## Optional Enhancers

- Include a downstream task split that StagePlanner can turn into stages.
- Include command-log and output-file proof requirements.
- Include blockers for missing `$PROJECT_ROOT/docs/issue/` and live BOSS access without making them fatal to task-package creation.
