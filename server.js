import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadLocalEnv();

const PORT = Number(process.env.PORT || 10000);
const MODEL_BASE_URL = (process.env.MODEL_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const MODEL_NAME = process.env.MODEL_NAME || "deepseek-v4-flash";
const MODEL_API_KEY = process.env.DEEPSEEK_API_KEY || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const modules = {
  policy: {
    title: "政策找一找",
    outputFrame: ["政策方向", "适用条件初筛", "官方入口", "材料清单", "核验提醒"]
  },
  financing: {
    title: "融资准备助手",
    outputFrame: ["融资场景判断", "可了解路径", "材料准备", "风险提醒", "下一步动作"]
  },
  document: {
    title: "材料生成工具",
    outputFrame: ["文档初稿", "待确认字段", "提交前检查", "合规提示"]
  },
  compliance: {
    title: "合规避坑问答",
    outputFrame: ["风险等级", "风险点", "替代表达", "核验动作", "专业咨询建议"]
  },
  operations: {
    title: "小微经营知识库",
    outputFrame: ["现状判断", "改进动作", "工具模板", "复盘节奏", "边界提醒"]
  },
  cases: {
    title: "服务案例与公开实践",
    outputFrame: ["案例背景", "服务动作", "可借鉴点", "风险边界", "可复用表达"]
  },
  publish: {
    title: "发布资产包",
    outputFrame: ["名称/简介", "标签", "首屏问题", "关键词覆盖", "审核风险"]
  }
};

const guardrails = [
  {
    pattern: /刷流水|包装流水|假流水|伪造|虚假发票|假合同|包装材料|征信修复|包装资料/,
    title: "疑似虚假材料或规避审核",
    safe: "我不能帮助制作、包装或规避审核材料。可以改为整理真实经营材料、用途说明和风险自查清单。"
  },
  {
    pattern: /套贷|以贷养贷|多头借贷技巧|黑户贷款|强开额度/,
    title: "疑似不当借贷或高风险融资",
    safe: "我不能提供不当借贷操作建议。可以改为梳理债务压力、正规渠道核验和风险降级动作。"
  },
  {
    pattern: /逃税|避税技巧|虚开发票|买发票|不开票怎么处理/,
    title: "疑似税务违法风险",
    safe: "我不能提供逃避税务监管的建议。可以改为整理合规开票、留痕和税务咨询前的问题清单。"
  }
];

const sensitivePatterns = [
  /身份证号|银行卡号|完整征信|完整流水|验证码|账户密码/,
  /\b\d{15,19}\b/,
  /\b\d{17}[\dXx]\b/
];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        modelName: MODEL_NAME,
        modelBaseUrl: MODEL_BASE_URL,
        hasApiKey: Boolean(MODEL_API_KEY)
      }, req.method === "HEAD");
    }

    if (req.method === "POST" && url.pathname === "/api/skill-run") {
      return handleSkillRun(req, res);
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, res, req.method === "HEAD");
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 500, { error: "Server error", detail: error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Xiaowei enterprise skill server listening on ${PORT}`);
  console.log(`Model base URL: ${MODEL_BASE_URL}`);
  console.log(`Model name: ${MODEL_NAME}`);
  console.log(`API key loaded: ${MODEL_API_KEY ? "yes" : "no"}`);
});

async function handleSkillRun(req, res) {
  const body = await readJson(req);
  const userText = String(body.message || "").trim();
  const debugPrompt = Boolean(body.debugPrompt);

  if (!userText) {
    return sendJson(res, 400, { error: "Empty message" });
  }

  const requestedModule = String(body.module || "auto");
  const activeModule = requestedModule === "auto" ? detectIntent(userText) : normalizeModule(requestedModule);
  const profile = sanitizeProfile(body.profile || {});
  const memory = sanitizeMemory(body.memory || {});
  const guardrail = findGuardrail(userText);
  const sensitive = hasSensitiveSignal(userText);
  const trace = buildTrace({ userText, activeModule, guardrail, sensitive, profile });
  const instructions = loadSkillInstructions();
  const prompt = buildModelPrompt({ userText, activeModule, profile, memory, sensitive });
  const debug = debugPrompt
    ? buildDebugPayload({ activeModule, instructions, prompt })
    : undefined;

  if (guardrail) {
    const reply = buildGuardrailReply(guardrail, activeModule);
    return sendJson(res, 200, {
      reply,
      module: activeModule,
      moduleTitle: modules[activeModule].title,
      mode: "guardrail",
      blocked: true,
      trace,
      review: reviewReply(reply, activeModule, true),
      debug
    });
  }

  if (!MODEL_API_KEY) {
    const reply = `${buildRuntimeReply({ userText, activeModule, profile, memory, sensitive })}

## 服务说明
当前先以基础咨询模式提供服务，重点帮助你梳理事项、资料、风险和下一步动作。你可以继续补充地区、行业、经营阶段、用途或已有材料，让建议更贴近实际。`;

    return sendJson(res, 200, {
      reply,
      module: activeModule,
      moduleTitle: modules[activeModule].title,
      mode: "runtime-fallback",
      blocked: false,
      trace,
      review: reviewReply(reply, activeModule, false),
      debug
    });
  }

  let upstream;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    upstream = await fetch(`${MODEL_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MODEL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.3,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: prompt }
        ]
      }),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    return sendJson(res, 502, {
      error: "Model connection failed",
      detail: error.name === "AbortError"
        ? "连接模型接口超时，请检查部署环境中的模型配置和外网连通性。"
        : `无法连接模型接口：${error.message}`
    });
  }

  clearTimeout(timeout);

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return sendJson(res, upstream.status, {
      error: "Model API error",
      detail: data.error?.message || data.message || data
    });
  }

  const reply = normalizeReply({
    reply: extractChatText(data),
    userText,
    activeModule,
    profile,
    memory,
    sensitive
  });

  return sendJson(res, 200, {
    reply: reply || "没有生成有效回复，请稍后重试。",
    module: activeModule,
    moduleTitle: modules[activeModule].title,
    model: MODEL_NAME,
    mode: "model",
    blocked: false,
    trace,
    review: reviewReply(reply, activeModule, false),
    debug
  });
}

function buildModelPrompt({ userText, activeModule, profile, memory, sensitive }) {
  const moduleInfo = modules[activeModule];
  const profileText = Object.entries(profile)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n") || "用户暂未填写企业概况。";
  const memoryText = buildMemoryPrompt(memory);
  const moduleExpertInstructions = buildModuleExpertInstructions({ activeModule, userText, profile, memory });

  return `
当前识别模块：${moduleInfo.title}
模块输出框架：${moduleInfo.outputFrame.join(" / ")}
企业概况：
${profileText}

已记录的长期背景与近期沟通：
${memoryText}

模块专业要求：
${moduleExpertInstructions}

${sensitive ? "用户问题可能涉及敏感信息，请提醒不要继续提供身份证号、银行卡号、完整征信、完整流水、验证码或账户密码。" : ""}

输出要求：
- 默认把已记录的企业背景作为当前问题的出发点，不要重新要求用户重复介绍已知信息。
- 如果关键信息仍不足，最多只追问 1 到 2 个最关键的问题。
- 建议必须尽量贴合企业背景、主要困境、当前目标和已有资源，避免泛泛而谈。
- 不要停留在“咨询银行、准备资料、注意风险”这种泛化层面，要指出具体属于什么场景、为什么、应核验什么。
- 严格使用二级标题 ## 组织输出。
- 默认使用以下结构：## 先给结论 / ## 你现在可以做什么 / ## 需要准备的材料/信息 / ## 风险提醒 / ## 下一步。
- 如确有必要，可额外增加一个模块专属部分，但总 section 不超过 6 个。
- 不要使用 Markdown 表格，不要输出代码块，不要写很长的大段文字。
- 不做贷款承诺，不输出保过、秒批、包装材料等高风险表达。

用户问题：
${userText}
`.trim();
}

function loadSkillInstructions() {
  const files = [
    "skill_package/universal_prompt.md",
    "skill_package/workflow_spec.md",
    "skill_package/guardrails.md"
  ];

  return files
    .map((relativePath) => path.join(__dirname, relativePath))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n\n");
}

function buildRuntimeReply({ userText, activeModule, profile, memory, sensitive }) {
  const context = summarizeBusinessContext(profile, memory);
  const specificFocus = buildSpecificFocus(activeModule, memory, profile, userText);
  const financingScenario = detectFinancingScenario([
    userText,
    memory.core.currentGoal,
    profile.资金用途,
    memory.core.mainChallenges,
    profile.当前困难
  ].filter(Boolean).join(" "));
  const financingPaths = buildFinancingPathHints(financingScenario.label);
  const publicPracticeNote = buildPublicPracticeRuntimeNote(activeModule, userText);

  const builders = {
    policy() {
      const policyFocus = /融资|贴息|担保|贷款|周转/.test(`${userText} ${memory.core.currentGoal || ""}`)
        ? "尤其把贴息、创业担保贷款、政策性融资担保和税费优惠分开核验，不要混成一类。"
        : "优先分清税费优惠、稳岗用工、数字化改造、设备更新和区域专项扶持这几类政策。";

      return `
## 先给结论
基于「${context}」，先做“政策方向分类 + 官方入口核验”，比直接判断“能不能拿到”更有价值。

## 你现在可以做什么
- 先按政策类型分篮子排查：税费优惠、稳岗/就业扶持、数字化改造、设备更新、融资支持。
- 优先查 ${memory.core.region || profile.地区 || "经营所在地"} 的政务服务网、人社、工信、税务、市场监管等官方渠道。
- 建一张政策核验表：政策名称、适用主体、时间窗口、材料、主管部门、官方入口。

## 需要准备的材料/信息
- 营业执照、经营地址、成立时间。
- 纳税、开票、社保或用工记录。
- 订单、合同、经营情况说明，以及与申报事项相关的设备、研发、培训或用工证明。

## 风险提醒
政策会随地区和时间变化，建议以官方页面和主管部门口径为准。${policyFocus}

${specificFocus ? `## 更贴近你当前情况的关注点
${specificFocus}

` : ""}## 下一步
告诉我所在城市、企业阶段和这次最想争取的事项，我可以继续给你做一张更具体的政策核验清单。`.trim();
    },
    financing() {
      return `
## 先给结论
基于「${context}」，这个需求更像“${financingScenario.label}”场景，应该先做融资准备，不应直接问额度、利率或通过率。

## 你现在可以做什么
- 先把 3 件事说清楚：资金具体用在哪里、预计使用多久、主要靠什么回款。
- 优先从正规路径做初筛：${financingPaths.join("、")}。
- 材料按 4 组整理：主体合规、经营痕迹、回款来源、增信要素。

## 需要准备的材料/信息
- 主体合规：营业执照、经营年限、实际经营地、基础经营说明。
- 经营痕迹：订单、合同、发票、纳税记录、对公流水概况或交易留痕。
- 回款来源：客户结构、账期、回款节奏、应收账款或交付节点说明。
- 增信要素：设备、房产、担保、核心客户、稳定渠道等可证明稳定经营的要素。

## 风险提醒
- 不要只看单一利率，要看综合融资成本，尤其是服务费、担保费、保险费、咨询费或会员费是否另收。
- 提前还款、自动续借、自动扣款、征信与数据授权、保证责任和逾期条款都要提前核验。
- 以上仅用于融资准备和信息梳理，不构成贷款承诺或金融建议。具体额度、费率、审批结果和服务条款，以持牌机构审核、合同约定和官方政策为准。

${specificFocus ? `## 更贴近你当前情况的关注点
${specificFocus}

` : ""}## 下一步
如果你愿意，我下一轮可以直接按“${financingScenario.label}”给你生成融资准备清单，或者起草一版贷款用途说明。`.trim();
    },
    document() {
      return `
## 先给结论
这个问题适合先产出一版材料初稿，再补事实字段。

## 你现在可以做什么
- 先确定材料类型：贷款用途说明、经营情况说明、政策申报说明。
- 把真实经营事实列出来，缺失字段用【待确认】标记。

## 需要准备的材料/信息
- 企业名称、经营地址、成立时间。
- 资金用途、金额区间、使用周期。
- 订单、合同、发票、纳税记录。

## 风险提醒
以下内容应作为初稿，所有事实信息需要人工核对后再提交。

${specificFocus ? `## 更贴近你当前情况的关注点
${specificFocus}

` : ""}## 下一步
继续告诉我你要写的是哪种材料，我可以按模板展开。`.trim();
    },
    compliance() {
      return `
## 先给结论
这个问题优先看“资质、收费、条款、授权、逾期”这几个风险点，不要先看话术是否“听起来像真的”。

## 你现在可以做什么
- 核验对方是否为持牌机构或正式合作渠道，先留主体名称、官网或备案信息。
- 要求把费用拆开说明：利息、服务费、担保费、保险费、咨询费、会员费分别是什么。
- 只摘录与费用、提前还款、自动扣款、征信授权、保证责任相关的条款来核验，不先转账、不发验证码。

## 需要准备的材料/信息
- 对方宣传语或聊天话术原文。
- 收费项目、合同相关条款片段、联系渠道或落地页信息。
- 对方自称的机构名称、收费节点和放款前后顺序。

## 风险提醒
出现“保证放款、先收费、低息秒批、内部通道、包装材料”等表述时，应高度谨慎。
- 重点核验综合融资成本、提前还款违约金、自动续借/自动分期、征信与数据授权、连带责任保证以及逾期处置条款。

${specificFocus ? `## 更贴近你当前情况的关注点
${specificFocus}

` : ""}## 下一步
去掉个人信息后，把宣传语或相关条款片段贴出来，我可以继续按“风险点 / 为什么 / 替代动作”逐条标注。`.trim();
    },
    operations() {
      return `
## 先给结论
先做经营动作排查，比直接下财务结论更有效。

## 你现在可以做什么
- 建每周现金流台账。
- 做库存周转表和客户来源表。
- 每两周复盘一次滞销和回款问题。

## 需要准备的材料/信息
- 收入支出记录。
- 库存和销量记录。
- 订单与回款情况。

## 风险提醒
这些是通用经营建议，不替代财务、税务或法律意见。

${specificFocus ? `## 更贴近你当前情况的关注点
${specificFocus}

` : ""}## 下一步
告诉我更具体的问题，比如“库存周转慢”或“回款慢”，我再细化。`.trim();
    },
    cases() {
      return `
## 先给结论
案例应先写小微企业遇到的问题和服务动作，品牌只能作为公开实践补充，不能抢占主线。

## 你现在可以做什么
- 用“服务对象、问题背景、服务动作、可借鉴点、边界”五段写案例。
- 重点写清楚如何帮助用户理解政策、准备材料、识别融资风险，而不是推荐品牌。
- 如需加入金融科技样本，只放在结尾一小段，作为公开实践参考。

## 需要准备的材料/信息
- 案例背景。
- 服务动作。
- 公开可引用的事实，尤其是流程、方法、公开披露的能力方向。

## 风险提醒
不要承诺额度、利率、审批结果，不要把案例写成招商、导流或效果背书文案。

${specificFocus ? `## 更贴近你当前情况的关注点
${specificFocus}

` : ""}${publicPracticeNote ? `${publicPracticeNote}

` : ""}## 下一步
如果你给我一个具体案例方向，我可以帮你整理成对外可用表达。`.trim();
    },
    publish() {
      return `
## 先给结论
发布文案应突出“服务小微企业的公共服务价值”，不要写成贷款广告。

## 你现在可以做什么
- 用“小微企业服务助手”作为主名称。
- 简介里写政策查询、融资准备、材料生成、合规避坑。
- 首屏问题覆盖政策、材料、风险和案例四类意图。

## 需要准备的材料/信息
- 名称、简介、标签。
- 开场白和推荐问题。
- 审核风险词清单。

## 风险提醒
避免“秒批、保过、最低息、官方指定贷款、100% 成功”等表达。

${specificFocus ? `## 更贴近你当前情况的关注点
${specificFocus}

` : ""}${publicPracticeNote ? `${publicPracticeNote}

` : ""}## 下一步
我可以继续直接生成一套平台发布文案。`.trim();
    }
  };

  let reply = (builders[activeModule] || builders.financing)();

  if (sensitive) {
    reply += `

## 信息安全提醒
为保护你的信息安全，不建议继续发送身份证号、银行卡号、完整征信、完整流水、验证码或账户密码。你可以只描述材料类型和大致情况。`;
  }

  if (/贷款用途说明|经营情况说明|初稿|帮我写/.test(userText) && activeModule !== "document") {
    reply += `

## 补充建议
这个问题也可以切到“材料生成工具”模块，让我直接给你出一版材料初稿。`;
  }

  return reply.trim();
}

function buildModuleExpertInstructions({ activeModule, userText, profile, memory }) {
  const goal = memory.core.currentGoal || profile.资金用途 || "";
  const challenge = memory.core.mainChallenges || profile.当前困难 || "";
  const scenario = detectFinancingScenario([userText, goal, challenge].join(" "));
  const publicPracticePromptNote = buildPublicPracticePromptNote(activeModule, userText);

  const sharedRules = [
    "- 回答要像小微信贷准备顾问或政策辅导员，不要像泛化聊天助手。",
    "- 如果能直接判断场景，就先下场景判断，再给步骤。",
    "- 每次回答至少给 2 到 4 个可执行动作，避免空泛表述。"
  ];

  const moduleRules = {
    policy: [
      "- 先区分政策类别，再给核验入口，不要把不同类型政策混成一类。",
      "- 如涉及融资支持，要区分贴息、创业担保贷款、政策性融资担保、税费优惠。",
      "- 回答里要明确哪些信息需要以当地官方渠道二次核验。"
    ],
    financing: [
      `- 当前优先按“${scenario.label}”场景理解用户问题，并解释这个判断与资金用途、使用周期、回款来源的关系。`,
      `- 正规融资路径只给类别，不给具体机构推荐。当前可优先考虑：${buildFinancingPathHints(scenario.label).join(" / ")}。`,
      "- 材料必须拆成 4 组：主体合规、经营痕迹、回款来源、增信要素。",
      "- 至少点名 3 个条款核验点：综合融资成本、额外收费、提前还款、自动扣款、征信与数据授权、保证责任、逾期条款。",
      "- 不要只说“准备营业执照和流水”，要说明这些材料分别在证明什么。"
    ],
    document: [
      "- 初稿只基于真实经营事实展开，缺失信息统一用【待确认】标记。",
      "- 与融资有关的材料，要把用途、周期、回款来源写清楚。",
      "- 不虚构订单、发票、流水、纳税和客户信息。"
    ],
    compliance: [
      "- 风险判断优先按资质、收费、合同、授权、逾期 5 个维度拆解，至少覆盖其中 3 项。",
      "- 如果用户贴宣传话术，要指出具体风险词，而不是只给笼统提醒。",
      "- 如果用户贴合同，只核验相关条款片段，并提醒不要发送整份敏感合同。"
    ],
    operations: [
      "- 优先给现金流、库存、回款、客户、留痕管理等基础动作。",
      "- 不做深度财务分析，不装成 CFO。"
    ],
    cases: [
      "- 先写小微企业问题与服务动作，再写案例归纳和风险边界。",
      "- 如需加入品牌案例，只能作为公开实践参考，不能导流。"
    ],
    publish: [
      "- 对外名称、简介、关键词都要突出小微企业公共服务属性。",
      "- 不要写成贷款广告或品牌招商文案。"
    ]
  };

  return [...sharedRules, ...(moduleRules[activeModule] || moduleRules.financing), publicPracticePromptNote]
    .filter(Boolean)
    .join("\n");
}

function detectFinancingScenario(text) {
  const normalized = String(text || "");
  const rules = [
    ["回款型周转", /回款|账期|应收|拖款|账款|尾款/],
    ["订单履约", /订单|履约|交付|项目|投标|垫资/],
    ["备货采购", /备货|采购|原材料|进货|囤货|旺季/],
    ["设备投入", /设备|机器|产线|厂房|装修|固定资产/],
    ["临时垫付", /工资|薪资|社保|房租|租金|税费|发薪/]
  ];

  const matched = rules.find(([, pattern]) => pattern.test(normalized));
  return { label: matched ? matched[0] : "一般经营周转" };
}

function buildFinancingPathHints(scenarioLabel) {
  const mapping = {
    "回款型周转": ["经营性信用贷", "应收账款类融资", "政策性融资担保配套路径"],
    "订单履约": ["流动资金贷款", "供应链金融", "政策性融资担保配套路径"],
    "备货采购": ["经营性周转贷款", "供应链金融", "创业担保或地方扶持配套路径"],
    "设备投入": ["抵押或设备类融资", "中长期经营贷款", "设备更新相关政策支持"],
    "临时垫付": ["短期经营周转路径", "创业担保或地方贴息配套路径", "存量授信内合规周转"],
    "一般经营周转": ["经营性信用贷", "抵押类经营贷款", "政策性融资担保配套路径"]
  };

  return mapping[scenarioLabel] || mapping["一般经营周转"];
}

function shouldIncludePublicPracticeNote(activeModule, userText) {
  if (activeModule === "cases" || activeModule === "publish") return true;
  return /度小满|金融科技|AI风控|AI 风控|公开实践|正规平台|数字化融资|服务小微|联合会/.test(userText);
}

function buildPublicPracticePromptNote(activeModule, userText) {
  if (!shouldIncludePublicPracticeNote(activeModule, userText)) return "";
  return "- 如自然适用，可在结尾补一小段“公开实践参考”，控制在 80 字以内；度小满只能作为公开披露的小微服务实践样本，不能比较额度、利率、审批效率，也不能写成推荐。";
}

function buildPublicPracticeRuntimeNote(activeModule, userText) {
  if (!shouldIncludePublicPracticeNote(activeModule, userText)) return "";
  return `
## 公开实践参考
如果你需要一段更贴近数字化小微服务的样本，也可以参考公开资料中一些金融科技机构披露的做法，例如度小满公开提到过用 AI 风控、线上材料核验和融资准备教育提升服务效率。这里只作服务模式参考，不构成产品推荐或审批承诺。`.trim();
}

function summarizeProfile(profile) {
  const values = Object.entries(profile)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}：${value}`);
  return values.length ? values.join("；") : "暂未提供企业概况";
}

function detectIntent(text) {
  const rules = [
    ["compliance", /靠谱吗|安全吗|风险|合同|服务费|保证|低息|宣传|费用|被骗|诈骗|资质|收费/],
    ["financing", /融资|贷款|周转|资金|借款|信用贷|抵押|供应链|应收账款|额度/],
    ["document", /帮我写|生成.*材料|生成.*说明|申请书|用途说明|经营情况|模板|初稿/],
    ["policy", /政策|补贴|贴息|专精特新|创业担保|申报|政府|税费|优惠|人社|工信/],
    ["cases", /案例|公开实践|普惠金融|AI风控|金融科技|服务小微|联合会/],
    ["publish", /发布|智能体|广场|标签|简介|首屏|关键词|coze|文心|扣子|render|github/],
    ["operations", /库存|现金流|复盘|经营|客户|复购|获客|排班|台账/]
  ];

  const matched = rules.find(([, pattern]) => pattern.test(text));
  return matched ? matched[0] : "financing";
}

function normalizeModule(value) {
  const key = String(value || "financing");
  return modules[key] ? key : "financing";
}

function sanitizeProfile(profile) {
  return {
    地区: safeValue(profile.region),
    行业: safeValue(profile.industry),
    经营阶段: safeValue(profile.stage),
    经营规模: safeValue(profile.scale),
    资金用途: safeValue(profile.purpose),
    融资金额区间: safeValue(profile.amount),
    可提供材料: safeValue(profile.materials),
    当前困难: safeValue(profile.challenge)
  };
}

function sanitizeMemory(memory) {
  const core = memory.core || {};
  const profile = memory.profile || {};
  const interactions = Array.isArray(memory.interactions) ? memory.interactions : [];

  return {
    core: {
      mainBusiness: safeValue(core.mainBusiness),
      industry: safeValue(core.industry),
      region: safeValue(core.region),
      mainChallenges: safeValue(core.mainChallenges),
      currentGoal: safeValue(core.currentGoal),
      advantages: safeValue(core.advantages),
      marketSituation: safeValue(core.marketSituation),
      companyResources: safeValue(core.companyResources),
      teamCharacteristics: safeValue(core.teamCharacteristics),
      companyVision: safeValue(core.companyVision),
      companyStrategy: safeValue(core.companyStrategy),
      industryCompetitiveness: safeValue(core.industryCompetitiveness)
    },
    profile: {
      companyHistory: safeValue(profile.companyHistory),
      communicationStyle: safeValue(profile.communicationStyle),
      focusArea: safeValue(profile.focusArea),
      targetAmount: safeValue(profile.targetAmount),
      userPreferences: safeArray(profile.userPreferences, 5)
    },
    interactions: interactions
      .slice(-6)
      .map((item) => ({
        moduleTitle: safeValue(item.moduleTitle),
        question: safeValue(item.question),
        trace: safeValue(item.trace)
      }))
  };
}

function safeArray(values, limit = 5) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => safeValue(value)).filter(Boolean).slice(0, limit);
}

function safeValue(value) {
  return String(value || "").replace(/\s+/g, " ").slice(0, 160);
}

function findGuardrail(text) {
  return guardrails.find((item) => item.pattern.test(text));
}

function hasSensitiveSignal(text) {
  return sensitivePatterns.some((pattern) => pattern.test(text));
}

function buildTrace({ userText, activeModule, guardrail, sensitive, profile }) {
  const profileCompleteness = Object.entries(profile).filter(([, value]) => value).length;
  const missingLowRiskFields = ["地区", "行业", "经营阶段", "资金用途"].filter((key) => !profile[key]).slice(0, 3);
  return {
    intent: activeModule,
    intentTitle: modules[activeModule].title,
    confidence: estimateConfidence(userText, activeModule),
    guardrail: guardrail ? guardrail.title : "未触发拒答",
    sensitive: sensitive ? "检测到敏感信息风险" : "未检测到敏感信息",
    profileCompleteness: `${profileCompleteness}/8`,
    missingLowRiskFields,
    outputFrame: modules[activeModule].outputFrame
  };
}

function buildMemoryPrompt(memory) {
  const core = [
    ["主营情况", memory.core.mainBusiness],
    ["行业", memory.core.industry],
    ["经营区域", memory.core.region],
    ["主要困境", memory.core.mainChallenges],
    ["当前目标", memory.core.currentGoal],
    ["已有资源", memory.core.companyResources],
    ["优势与竞争情况", memory.core.advantages || memory.core.industryCompetitiveness],
    ["长期策略或愿景", memory.core.companyVision || memory.core.companyStrategy]
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);

  const profile = [
    ["企业历史", memory.profile.companyHistory],
    ["沟通偏好", memory.profile.communicationStyle],
    ["近期关注方向", memory.profile.focusArea],
    ["用户偏好", memory.profile.userPreferences.join("；")]
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);

  const interactions = memory.interactions
    .map((item, index) => `近期沟通${index + 1}: ${item.moduleTitle || "咨询"} / ${item.question || item.trace}`)
    .filter(Boolean);

  return [...core, ...profile, ...interactions].join("\n") || "暂无已记录背景。";
}

function summarizeBusinessContext(profile, memory) {
  const values = [
    memory.core.mainBusiness,
    memory.core.region && `经营区域：${memory.core.region}`,
    memory.core.mainChallenges && `主要困境：${memory.core.mainChallenges}`,
    memory.core.currentGoal && `当前目标：${memory.core.currentGoal}`,
    profile.可提供材料 && `已有材料：${profile.可提供材料}`
  ].filter(Boolean);

  return values.length ? values.join("；") : summarizeProfile(profile);
}

function buildSpecificFocus(module, memory, profile, userText) {
  const points = [];
  const challenge = memory.core.mainChallenges || profile.当前困难;
  const goal = memory.core.currentGoal || profile.资金用途;
  const region = memory.core.region || profile.地区;
  const resources = memory.core.companyResources || profile.可提供材料;
  const scenario = detectFinancingScenario([userText, goal, challenge].filter(Boolean).join(" "));

  if (module === "policy" && region) {
    points.push(`- 你当前有明确经营区域，建议优先核验 ${region} 当地的政务服务网、人社、工信、税务和市场监管渠道，而不是只看全国性概括。`);
  }

  if (module === "policy" && /融资|贴息|担保|贷款/.test(`${userText} ${goal || ""}`)) {
    points.push("- 你当前的问题和融资支持有关，后续要把贴息、创业担保贷款、政策性融资担保和税费优惠分开看，避免误判。");
  }

  if (module === "financing" && goal) {
    points.push(`- 结合你当前描述，这次更像“${scenario.label}”，后续更适合先把“${goal}”对应的资金用途、使用周期和回款来源说清楚，再决定看哪类融资路径。`);
  }

  if (module === "financing" && /回款|账期|应收/.test(challenge)) {
    points.push("- 你提到的压力和回款相关，后续要特别重视订单、合同、发票、回款周期和应收账款的证明材料。");
  }

  if (module === "financing" && profile.融资金额区间) {
    points.push(`- 你已经给出金额区间“${profile.融资金额区间}”，后续建议会更偏向先做材料完整性和条款核验，而不是泛谈融资方向。`);
  }

  if (module === "operations" && /库存|积压/.test(challenge)) {
    points.push("- 你当前的难点与库存有关，后续梳理时要优先看周转天数、采购节奏和滞销品占比。");
  }

  if (module === "compliance" && resources) {
    points.push(`- 你已经提到一些可提供材料，后续遇到收费或合同争议时，优先保留 ${resources} 这类真实留痕，不要额外补造材料。`);
  }

  if (module === "compliance" && /服务费|收费|利率|担保费|保险费/.test(userText)) {
    points.push("- 你当前已经提到收费或利率，后续不要只核对一个数字，要把服务费、担保费、保险费、会员费等项目一起核验。");
  }

  if (module === "compliance" && /合同|条款|提前还款|自动扣款|授权/.test(userText)) {
    points.push("- 你当前的问题已经进入条款核验层，后续要重点看提前还款、自动扣款、征信授权、保证责任和逾期处理。");
  }

  if (resources && /document|financing/.test(module)) {
    points.push(`- 你目前已经提到的可用资源是“${resources}”，后续可以先从这些真实材料出发，不必一开始就补齐所有资料。`);
  }

  if (module === "cases" && shouldIncludePublicPracticeNote(module, userText)) {
    points.push("- 如果需要加入公开实践样本，建议放在正文最后单独一小段，保持方法参考口径，不要写成品牌导流。");
  }

  if (!points.length && memory.core.currentGoal) {
    points.push(`- 你当前最核心的目标是“${memory.core.currentGoal}”，后续所有动作都建议围绕这个目标排序，不要同时铺太多方向。`);
  }

  if (!points.length && /政策|融资|材料|风险|经营/.test(userText) && memory.core.mainBusiness) {
    points.push(`- 你已经说明主营情况是“${memory.core.mainBusiness}”，后续建议会优先围绕这一业务场景展开，而不是给通用模板。`);
  }

  return points.join("\n");
}

function estimateConfidence(text, module) {
  const hints = {
    policy: ["政策", "补贴", "申报", "创业担保", "专精特新"],
    financing: ["融资", "贷款", "周转", "资金", "材料"],
    document: ["写", "生成", "说明", "初稿", "模板"],
    compliance: ["风险", "安全", "靠谱吗", "保证", "服务费"],
    operations: ["经营", "库存", "现金流", "客户", "复盘"],
    cases: ["案例", "实践", "普惠", "AI", "风控"],
    publish: ["发布", "智能体", "广场", "标签", "简介"]
  }[module] || [];
  const hits = hints.filter((hint) => text.includes(hint)).length;
  if (hits >= 2) return "高";
  if (hits === 1) return "中";
  return "低";
}

function buildGuardrailReply(guardrail, module) {
  return `
## 风险提醒
你的问题涉及「${guardrail.title}」，这类操作可能带来法律、征信、税务或经营风险，我不能提供具体做法。

## 可以改成这样做
${guardrail.safe}

## 我可以继续帮你
- 整理真实经营材料清单
- 生成合规的贷款用途说明
- 做融资准备度检查
- 做贷款宣传或合同条款风险识别

## 下一步
你可以继续围绕「${modules[module].title}」提问，我会按合规边界帮你把真实准备动作理清楚。`.trim();
}

function reviewReply(reply, module, blocked) {
  const checks = [
    { name: "意图命中", passed: Boolean(module && modules[module]) },
    { name: "结构化输出", passed: /## /.test(reply) && /下一步|风险|材料|结论/.test(reply) },
    { name: "合规边界", passed: blocked || /不构成|以.*为准|风险|官方|持牌|合同/.test(reply) },
    { name: "可执行动作", passed: /准备|核验|查询|整理|生成|检查/.test(reply) },
    {
      name: "专业框架",
      passed: !["financing", "compliance", "policy"].includes(module) || /综合融资成本|回款来源|经营痕迹|服务费|提前还款|征信|贴息|政策性融资担保/.test(reply)
    },
    { name: "品牌克制", passed: !/建议你去某平台申请|某品牌一定更适合你/.test(reply) }
  ];

  return {
    score: Math.round((checks.filter((item) => item.passed).length / checks.length) * 100),
    checks
  };
}

function extractChatText(data) {
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function buildDebugPayload({ activeModule, instructions, prompt }) {
  return {
    module: activeModule,
    moduleTitle: modules[activeModule]?.title || activeModule,
    systemPrompt: instructions,
    userPrompt: prompt
  };
}

function normalizeReply({ reply, userText, activeModule, profile, memory, sensitive }) {
  const cleaned = String(reply || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) {
    return buildRuntimeReply({ userText, activeModule, profile, memory, sensitive });
  }

  if (!/^##\s+/m.test(cleaned)) {
    return buildRuntimeReply({ userText, activeModule, profile, memory, sensitive });
  }

  return cleaned;
}

function serveStatic(requestPath, res, headOnly = false) {
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const fullPath = path.normalize(path.join(__dirname, cleanPath));

  if (!fullPath.startsWith(__dirname)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      return sendJson(res, 404, { error: "Not found" });
    }

    const ext = path.extname(fullPath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Content-Length": data.length
    });
    res.end(headOnly ? undefined : data);
  });
}

function sendJson(res, status, payload, headOnly = false) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(headOnly ? undefined : data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
