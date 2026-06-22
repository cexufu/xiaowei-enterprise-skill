# 小微企业服务助手

这是一个面向中小微企业主、个体工商户和创业者的公共服务型 Skill / 智能体能力包。

核心定位：先帮助用户把政策信息、融资准备、材料清单、合规风险和经营动作理清楚，再谈案例和扩展能力。

这个仓库现在同时包含两部分：

1. `skill_package/`：平台无关的 Skill 配置包，适合上传或迁移到 Coze、文心智能体、Dify、FastGPT、豆包智能体等平台。
2. 一个最小 Web 服务：可以直接部署到 Zeabur 或 Render，用来在线试这个 Skill。

## 先看哪里

1. `START_HERE.md`
2. `publish_copy.md`
3. `universal_prompt.md`
4. `guardrails.md`
5. `workflow_spec.md`

## 文件说明

- `server.js`：最小 Node 服务，读取 Skill 包并调用模型。
- `index.html`、`app.js`、`styles.css`：在线试用页。
- `Dockerfile`：Zeabur 直接部署用的容器配置。
- `render.yaml`：Render 蓝图配置。
- `.env.example`：本地、Zeabur 和 Render 环境变量示例。
- `universal_prompt.md`：通用系统 Prompt。
- `workflow_spec.md`：工作流与意图识别设计。
- `guardrails.md`：合规护栏与拒答规则。
- `publish_copy.md`：名称、简介、标签、开场白、首屏问题。
- `platform_mapping.md`：各平台配置映射。
- `test_cases.md`：上线前测试用例。
- `skill_manifest.json`：平台无关结构化配置。
- `START_HERE.md`：最短配置顺序。

## 原则

- 不做贷款导流。
- 不要求用户提交身份证号、银行卡号、完整征信、完整流水。
- 不承诺贷款成功、额度、利率、审批结果或放款时间。
- 公开案例只是补充说明，不是主叙事。

## Zeabur 部署

仓库已经补了 `Dockerfile`，Zeabur 直接从 GitHub 导入即可，尽量减少平台自动识别失败。

成本提醒：按 Zeabur 当前官方定价，`Free` 计划是 `0 美元/月`，`Dev` 计划是 `前 14 天免费，之后 5 美元/月`。如果你是先试跑这个 Skill，可以先用试用期验证链路；如果目标是长期零成本在线托管，就不该默认把 Zeabur当成永久免费方案。

创建服务时：

1. 选择从 GitHub 导入这个仓库。
2. 让 Zeabur 按仓库默认方式构建。
3. 在环境变量里补这三项：

- `DEEPSEEK_API_KEY`
- `MODEL_BASE_URL=https://api.deepseek.com`
- `MODEL_NAME=deepseek-v4-flash`

如果暂时不配 `DEEPSEEK_API_KEY`，页面仍然可以跑规则兜底模式，用来测试意图识别、护栏和输出结构。

## Render 部署

仓库内已经带了 `render.yaml`，Render 创建 Web Service 时会自动识别。

需要配置的环境变量：

- `DEEPSEEK_API_KEY`
- `MODEL_BASE_URL=https://api.deepseek.com`
- `MODEL_NAME=deepseek-v4-flash`

如果暂时不配 `DEEPSEEK_API_KEY`，页面仍然可以跑规则兜底模式，用来测试意图识别、护栏和输出结构。
