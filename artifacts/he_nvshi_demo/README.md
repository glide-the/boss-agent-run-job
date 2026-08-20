# 何女士测试题 Demo

- 对话岗位：露嘻嘻 / AI 训练师（杭州）
- 任务理解：参考招聘方提供的白底标准，将服装平铺实拍整理为纯白背景、居中完整、适合电商展示的商品图。
- 本次 Demo：选用 `source/task_02.webp` 的浅蓝银色连衣裙，生成首张 1:1 白底商品图。
- 成品：`demo/he_nvshi_white_background_demo_v1.png`（1254 × 1254）
- 状态：仅供用户预览，未发送给招聘方。

处理重点：保留原始服装配色、吊带、前胸系带与纽扣、分层褶皱裙摆和荷叶边；移除地面背景并校正角度。

## 2026-08-19 剩余三款

- `demo/he_nvshi_white_background_task_01_v1.png`：米白色抹胸褶皱双层荷叶边短裙。
- `demo/he_nvshi_white_background_task_03_v1.png`：浅卡其色松紧腰抽绳短裤。
- `demo/he_nvshi_white_background_task_04_v1.png`：卡其色挂脖连体阔腿裤。
- 生成方式：内置 `imagegen` 精确对象编辑；统一为 1254 × 1254、纯白背景、正面居中电商目录图。
- 交付状态：已于 2026-08-19 19:18 通过 `chrome-file-upload-patterns` 中 BOSS 已验证流程，使用 `[aria-label="发送图片"]` 可见包装触发器逐张发送；三张图片及两句交付说明均核验“送达”。此前失败原因为误点隐藏的 `Choose File`，并非扩展文件 URL 权限缺失。
