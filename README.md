# 小微企业服务助手

这是一个面向中小微企业主、个体工商户和创业者的公共服务型 Skill / 智能体能力包。

核心定位：先帮助用户把政策信息、融资准备、材料清单、合规风险和经营动作理清楚，再谈案例和扩展能力。

这个仓库现在同时包含两部分：

1. `skill_package/`：平台无关的 Skill 配置包，适合上传或迁移到 Coze、文心智能体、Dify、FastGPT、豆包智能体等平台。
2. 一个最小 Web 服务：可以直接部署到 Render，用来在线试这个 Skill。

## 先看哪里

1. `START_HERE.md`
2. `publish_copy.md`
3. `universal_prompt.md`
4. `guardrails.md`
5. `workflow_spec.md`

## 文件说明

- `server.js`：最小 Node 服务，读取 Skill 包并调用模型。
- `index.html`、`app.js`、`styles.css`：Render 上的在线试用页。
- `render.yaml`：Render 蓝图配置。
- `.env.example`：本地和 Render 环境变量示例。
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

## Render 部署

仓库内已经带了 `render.yaml`，Render 创建 Web Service 时会自动识别。

需要配置的环境变量：

- `DEEPSEEK_API_KEY`
- `MODEL_BASE_URL=https://api.deepseek.com`
- `MODEL_NAME=deepseek-v4-flash`

如果暂时不配 `DEEPSEEK_API_KEY`，页面仍然可以跑规则兜底模式，用来测试意图识别、护栏和输出结构。
