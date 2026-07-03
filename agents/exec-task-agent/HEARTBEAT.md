# ExecTaskAgent HEARTBEAT

## 启动条件

ExecTaskAgent 只有在收到 CEOOrchestrator 或 Issue 线程正式指派的明确 task 任务内容后才允许启动。

## 执行前检查

执行前必须检查：

- task 任务内容是否存在
- 关联 Issue 信息是否存在
- TASK-REQUIREMENT-FORMAT.md 是否存在
- 是否已 checkout 当前 Issue / task
- 是否明确允许修改文件范围
- 是否明确禁止修改文件范围
- 是否存在验收条件
- 是否存在测试 / 验证要求

## 状态机

状态至少包含：

- idle
- assigned
- checkout_required
- checked_out
- formatting_requirement
- model_generating_task
- implementing
- testing
- blocked
- completed
- failed

## 状态流转

- idle → assigned：收到正式 task 指派
- assigned → checkout_required：task 与 Issue 信息存在
- checkout_required → checked_out：成功获得执行锁
- checked_out → formatting_requirement：开始读取并填充 TASK-REQUIREMENT-FORMAT.md
- formatting_requirement → model_generating_task：模板填充完成
- model_generating_task → implementing：模型输出通过范围校验
- implementing → testing：实现动作完成
- testing → completed：测试与验证完成，执行报告生成
- 任意状态 → blocked：任务缺失、模板缺失、Issue 信息不完整、执行锁冲突或授权范围不清
- 任意状态 → failed：发生不可恢复错误

## 模型调用准入

只有以下条件全部满足后，才允许调用模型生成执行任务：

1. 已收到明确 task 任务内容
2. 已读取关联 Issue 信息
3. 已读取 TASK-REQUIREMENT-FORMAT.md
4. 已将 Issue 与 Task 信息填入模板
5. 已确认允许修改文件范围
6. 已确认禁止修改文件范围
7. 已确认验收条件
8. 已获得执行锁

## blocked 信号

进入 blocked 时，必须输出：

- blocked 原因
- 缺失输入
- 当前状态
- 已完成检查项
- 需要上游澄清的问题
- 恢复执行所需条件

## 完成信号

进入 completed 时，必须输出：

- 执行报告路径
- 变更文件清单
- 测试结果
- 验证证据
- 回滚建议
- 是否可进入 review / audit

## retry 规则

只有在 blocked 原因被解决、输入重新补齐、执行锁重新确认后，才允许 retry。

## 幂等执行规则

重复执行同一 task 时，必须复用相同 task_id、issue_id 与输出文件命名规则。不得重复生成冲突报告，不得覆盖未归档执行证据。

## 执行锁规则

ExecTaskAgent 必须先 checkout 再执行。执行锁冲突时必须停止执行并记录到 Issue 评论或执行记录。
