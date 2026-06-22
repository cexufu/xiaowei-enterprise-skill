# 平台映射

## Coze / 扣子

建议形态：Bot + Workflow + Knowledge + Web Search。

配置方式：

1. Bot 人设与回复逻辑：复制 `universal_prompt.md`。
2. 开场白：使用 `publish_copy.md` 中的开场白。
3. 推荐问题：使用 `publish_copy.md` 中的首屏问题。
4. Workflow：按 `workflow_spec.md` 建 6-7 个意图分支。
5. Knowledge：只上传稳定素材，不上传大而全政策库。
6. Plugin / Tool：优先启用联网搜索或官方网页查询能力。
7. 发布前测试：执行 `test_cases.md`。

不建议第一版使用代码节点。节点审核、权限、网络和密钥管理都容易拖慢上线。

## 文心智能体 / 百度智能体平台

建议形态：公开智能体 + 角色设定 + 知识库 + 联网检索。

配置方式：

1. 智能体名称：小微企业服务助手。
2. 简介：使用 `publish_copy.md`。
3. 角色设定：复制 `universal_prompt.md`。
4. 开场白与推荐问题：复制 `publish_copy.md`。
5. 知识库：上传联合会介绍、合规护栏、模板材料，以及经过审核的公开案例素材。
6. 工具：开启联网搜索或平台提供的检索能力。
7. 标签：小微企业、政策查询、融资准备、合规提醒、材料生成、普惠金融。

百度生态里更适合强调“政策查询、材料准备、合规避坑、公共服务”，不要把名称做成贷款广告。

## Dify / FastGPT

建议形态：Chatflow / Workflow 应用。

节点建议：

1. 开始节点：收集地区、行业、阶段、资金用途、金额区间。
2. LLM 意图识别节点：按 `workflow_spec.md` 分类。
3. 条件分支：policy / financing / document / compliance / operations / cases / publish。
4. 检索节点：连接政策、案例、模板、合规材料。
5. LLM 生成节点：使用 `universal_prompt.md` + 模块输出模板。
6. 合规校验节点：使用 `guardrails.md`。
7. 输出节点：结构化回复。

## 豆包、通义、其他智能体平台

如果平台只支持 Prompt：

1. 复制 `universal_prompt.md` 到系统设定。
2. 复制 `publish_copy.md` 的开场白和推荐问题。
3. 知识库上传 `guardrails.md`、`workflow_spec.md`、通过审核的案例材料。
4. 不要依赖代码执行和外部 API。

如果平台支持工作流：

优先搭意图识别、检索、生成、合规校验四步。
