const MEMORY_KEY = "xiaowei-enterprise-memory-v3";
const MAX_INTERACTIONS = 8;

const onboardingFlow = [
  {
    key: "mainBusiness",
    question: "先用两三句话介绍一下：你们主要做什么产品或服务？大致属于什么行业？主要客户是谁？",
    apply(memory, answer) {
      memory.core.mainBusiness = answer;
      const industry = inferIndustry(answer);
      if (industry && !memory.core.industry) {
        memory.core.industry = industry;
      }
    }
  },
  {
    key: "region",
    question: "主要在哪些城市或区域经营？目前最核心的市场在哪里？",
    apply(memory, answer) {
      memory.core.region = answer;
    }
  },
  {
    key: "mainChallenges",
    question: "现阶段最大的经营压力或困难是什么？可以直接说最困扰你的那一件事。",
    apply(memory, answer) {
      memory.core.mainChallenges = answer;
    }
  },
  {
    key: "currentGoal",
    question: "这次你最想优先解决什么问题？比如融资准备、政策查询、合同风险、回款压力、库存问题等。",
    apply(memory, answer) {
      memory.core.currentGoal = answer;
    }
  },
  {
    key: "resources",
    question: "目前你们手里已有的资源或材料有哪些？比如营业执照、订单、发票、固定客户、渠道、设备、团队经验等。",
    apply(memory, answer) {
      memory.core.companyResources = answer;
      memory.core.teamCharacteristics = answer;
    }
  },
  {
    key: "advantages",
    question: "相比同行，你觉得自己现在最大的优势是什么？市场上又面临哪些竞争压力？",
    apply(memory, answer) {
      memory.core.advantages = answer;
      memory.core.marketSituation = answer;
      memory.core.industryCompetitiveness = answer;
    }
  },
  {
    key: "vision",
    question: "如果看未来 1 到 2 年，你最希望把公司做成什么样？为了实现这个目标，现在主要在坚持什么做法？",
    apply(memory, answer) {
      memory.core.companyVision = answer;
      memory.core.companyStrategy = answer;
    }
  }
];

const sceneModules = {
  policy: "policy",
  financing: "financing",
  document: "document",
  compliance: "compliance",
  operations: "operations",
  cases: "cases"
};

const nodes = {
  messages: document.querySelector("#messages"),
  askForm: document.querySelector("#askForm"),
  questionInput: document.querySelector("#questionInput"),
  askButton: document.querySelector("#askButton"),
  healthHint: document.querySelector("#healthHint"),
  heroTitle: document.querySelector("#heroTitle"),
  statusBadge: document.querySelector("#statusBadge"),
  composerTip: document.querySelector("#composerTip"),
  memorySummary: document.querySelector("#memorySummary"),
  memoryStatus: document.querySelector("#memoryStatus"),
  refreshMemoryButton: document.querySelector("#refreshMemoryButton"),
  traceIntent: document.querySelector("#traceIntent"),
  traceMode: document.querySelector("#traceMode"),
  traceGuardrail: document.querySelector("#traceGuardrail"),
  traceSensitive: document.querySelector("#traceSensitive"),
  traceProfile: document.querySelector("#traceProfile"),
  traceMissing: document.querySelector("#traceMissing"),
  coreMemory: document.querySelector("#coreMemory"),
  profileMemory: document.querySelector("#profileMemory"),
  interactionMemory: document.querySelector("#interactionMemory")
};

const state = {
  health: null,
  memory: loadMemory(),
  onboardingIndex: null,
  pendingModule: "auto"
};

init();

async function init() {
  bindEvents();
  renderMemoryPanels();
  renderHero();
  await loadHealth();
  startConversation();
}

function bindEvents() {
  nodes.askForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = nodes.questionInput.value.trim();
    if (!text) return;
    nodes.questionInput.value = "";

    if (isOnboardingActive()) {
      handleOnboardingAnswer(text);
      return;
    }

    await runSkill(text, state.pendingModule);
    state.pendingModule = "auto";
  });

  document.querySelectorAll("[data-scene]").forEach((button) => {
    button.addEventListener("click", () => {
      if (needsOnboarding()) {
        ensureOnboarding(true);
        return;
      }

      const scene = button.dataset.scene;
      state.pendingModule = sceneModules[scene] || "auto";
      nodes.questionInput.value = buildSceneDraft(scene, state.memory);
      nodes.questionInput.focus();
      nodes.questionInput.setSelectionRange(nodes.questionInput.value.length, nodes.questionInput.value.length);
    });
  });

  nodes.refreshMemoryButton.addEventListener("click", () => {
    restartOnboarding();
  });
}

function startConversation() {
  if (needsOnboarding()) {
    addMessage(
      "assistant",
      "你好，这里会先用几轮简短对话建立企业档案。后续无论你问政策、融资准备、材料起草还是经营问题，我都会默认以这份背景作为出发点，不需要你每次重复介绍。"
    );
    ensureOnboarding(false);
    return;
  }

  addMessage(
    "assistant",
    "你好，企业档案已经建立。你可以直接提具体问题，我会结合你已有的企业背景继续往下分析，不再从零开始问。"
  );
}

function ensureOnboarding(forcePrompt) {
  if (state.onboardingIndex === null) {
    state.onboardingIndex = nextOnboardingIndex();
  }

  if (state.onboardingIndex === null) {
    state.memory.meta.intakeComplete = true;
    persistMemory();
    renderMemoryPanels();
    renderHero();
    return;
  }

  renderHero();

  if (forcePrompt) {
    addMessage("assistant", "先把企业档案补到可用状态。这样后面的建议才会更具体。");
  }

  askCurrentOnboardingQuestion();
}

function askCurrentOnboardingQuestion() {
  const step = onboardingFlow[state.onboardingIndex];
  if (!step) return;
  addMessage("assistant", step.question);
  nodes.composerTip.textContent = `当前正在建立企业档案，第 ${state.onboardingIndex + 1}/${onboardingFlow.length} 轮。回答尽量按实际情况说清楚即可。`;
  nodes.askButton.textContent = "记录并继续";
}

function handleOnboardingAnswer(answer) {
  const step = onboardingFlow[state.onboardingIndex];
  if (!step) return;

  addMessage("user", answer);
  step.apply(state.memory, answer);
  applyConversationHeuristics(answer, state.memory);
  state.memory.meta.updatedAt = new Date().toISOString();
  persistMemory();
  renderMemoryPanels();

  const nextIndex = state.onboardingIndex + 1;
  if (nextIndex < onboardingFlow.length) {
    state.onboardingIndex = nextIndex;
    addMessage("assistant", "记下了。我们继续下一项。");
    askCurrentOnboardingQuestion();
    return;
  }

  state.onboardingIndex = null;
  state.memory.meta.intakeComplete = true;
  state.memory.meta.updatedAt = new Date().toISOString();
  persistMemory();
  renderMemoryPanels();
  renderHero();
  nodes.composerTip.textContent = "企业档案已建立。后续可以直接进入具体咨询。";
  nodes.askButton.textContent = "获取建议";

  addMessage(
    "assistant",
    "基础情况已记录。后续我会默认以这些企业背景来理解你的问题，不再重复做同样的背景收集。现在你可以直接进入具体咨询。"
  );
}

function restartOnboarding() {
  state.onboardingIndex = 0;
  state.memory.meta.intakeComplete = false;
  persistMemory();
  renderMemoryPanels();
  renderHero();
  addMessage("assistant", "我们重新更新一遍企业档案。你只需要按实际情况简短回答即可。");
  askCurrentOnboardingQuestion();
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    state.health = data;
    renderHealth(data);
  } catch {
    renderHealth(null);
  }
}

function renderHealth(data) {
  if (!data) {
    nodes.statusBadge.textContent = "服务已开启";
    nodes.statusBadge.className = "status-badge muted";
    nodes.healthHint.textContent = "你可以直接开始建立企业档案或进入具体咨询。";
    return;
  }

  nodes.statusBadge.textContent = "服务已就绪";
  nodes.statusBadge.className = data.hasApiKey ? "status-badge live" : "status-badge";
  nodes.healthHint.textContent = needsOnboarding()
    ? "建议先建立企业档案，后续建议会更具体。"
    : "企业背景已建立，后续问题会默认基于这份背景继续处理。";
}

function renderHero() {
  if (needsOnboarding() || isOnboardingActive()) {
    nodes.heroTitle.textContent = "先用几轮简短对话建立企业档案，后续建议都会基于你的企业背景来理解";
    nodes.composerTip.textContent = isOnboardingActive()
      ? `当前正在建立企业档案，第 ${state.onboardingIndex + 1}/${onboardingFlow.length} 轮。`
      : "先建立企业档案，后续问题就不需要重复介绍背景。";
    nodes.askButton.textContent = isOnboardingActive() ? "记录并继续" : "继续";
    return;
  }

  nodes.heroTitle.textContent = "企业背景已经记住了。接下来请直接说问题，我会从你的实际情况出发给建议";
  nodes.composerTip.textContent = "你可以直接说场景、用途、已有材料和顾虑，我会按事项、资料、风险和下一步动作为你整理。";
  nodes.askButton.textContent = "获取建议";
}

async function runSkill(question, module = "auto") {
  addMessage("user", question);
  setLoading(true);
  const loading = addMessage("assistant", "正在结合你的企业背景整理问题、资料、风险和下一步动作，请稍等。");

  applyConversationHeuristics(question, state.memory);

  try {
    const response = await fetch("/api/skill-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        module,
        message: question,
        profile: buildProfileFromMemory(state.memory),
        memory: state.memory
      })
    });

    const data = await response.json();
    loading.remove();

    if (!response.ok) {
      addMessage("assistant", data.detail || data.message || data.error || "当前无法完成处理，请稍后再试。");
      return;
    }

    addMessage("assistant", data.reply);
    renderTrace(data);
    appendInteractionMemory(question, data);
    persistMemory();
    renderMemoryPanels();
  } catch (error) {
    loading.remove();
    addMessage("assistant", `当前无法完成处理：${error.message}`);
  } finally {
    setLoading(false);
  }
}

function renderTrace(data) {
  nodes.traceIntent.textContent = data.trace?.intentTitle || data.moduleTitle || "待识别";
  nodes.traceMode.textContent = modeLabel(data.mode);
  nodes.traceGuardrail.textContent = data.trace?.guardrail || "-";
  nodes.traceSensitive.textContent = data.trace?.sensitive || "-";
  nodes.traceProfile.textContent = data.trace?.profileCompleteness || "-";
  nodes.traceMissing.innerHTML = renderTags(
    data.trace?.missingLowRiskFields?.length
      ? data.trace.missingLowRiskFields
      : ["当前基础背景已较完整，可继续补充金额区间、材料类型或更具体目标。"]
  );
}

function renderMemoryPanels() {
  renderMemorySummary();
  renderCoreMemory();
  renderProfileMemory();
  renderInteractionMemory();
}

function renderMemorySummary() {
  const summaryItems = [
    ["主营情况", state.memory.core.mainBusiness],
    ["经营区域", state.memory.core.region],
    ["主要困境", state.memory.core.mainChallenges],
    ["当前目标", state.memory.core.currentGoal]
  ].filter(([, value]) => value);

  if (!summaryItems.length) {
    nodes.memorySummary.className = "memory-summary empty";
    nodes.memorySummary.textContent = "还没有记录企业背景。开始几轮简短对话后，后续问题会默认基于你的企业情况来理解。";
    nodes.memoryStatus.textContent = "首次使用建议先建立企业档案";
    return;
  }

  nodes.memorySummary.className = "memory-summary";
  nodes.memorySummary.innerHTML = summaryItems
    .map(([label, value]) => `<div class="memory-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
  nodes.memoryStatus.textContent = state.memory.meta.intakeComplete
    ? "企业档案已建立，后续咨询会默认带入"
    : "企业档案未完成，建议继续补充";
}

function renderCoreMemory() {
  const tags = [
    state.memory.core.industry,
    state.memory.core.region,
    state.memory.core.mainChallenges,
    state.memory.core.currentGoal,
    state.memory.core.advantages,
    state.memory.core.companyResources
  ].filter(Boolean);

  nodes.coreMemory.innerHTML = tags.length ? renderTags(tags) : "建立企业档案后，会在这里显示长期背景。";
  nodes.coreMemory.className = tags.length ? "tag-list" : "tag-list empty";
}

function renderProfileMemory() {
  const tags = [
    state.memory.profile.companyHistory,
    state.memory.profile.communicationStyle,
    ...(state.memory.profile.userPreferences || []).slice(0, 4),
    state.memory.profile.focusArea
  ].filter(Boolean);

  nodes.profileMemory.innerHTML = tags.length ? renderTags(tags) : "例如企业历史、沟通偏好、重点关注方向等。";
  nodes.profileMemory.className = tags.length ? "tag-list" : "tag-list empty";
}

function renderInteractionMemory() {
  const items = (state.memory.interactions || []).slice(-3).reverse();
  if (!items.length) {
    nodes.interactionMemory.textContent = "还没有近期沟通记录。";
    nodes.interactionMemory.className = "history-list empty";
    return;
  }

  nodes.interactionMemory.className = "history-list";
  nodes.interactionMemory.innerHTML = items
    .map((item) => (
      `<div class="history-item"><strong>${escapeHtml(item.moduleTitle || "咨询记录")}</strong><p>${escapeHtml(item.question)}</p></div>`
    ))
    .join("");
}

function buildProfileFromMemory(memory) {
  return {
    region: memory.core.region,
    industry: memory.core.industry || memory.core.mainBusiness,
    stage: memory.profile.companyHistory,
    scale: memory.core.teamCharacteristics || memory.core.companyResources,
    purpose: memory.core.currentGoal,
    amount: memory.profile.targetAmount,
    materials: memory.core.companyResources,
    challenge: memory.core.mainChallenges
  };
}

function buildSceneDraft(scene, memory) {
  const context = {
    business: memory.core.mainBusiness || "我们企业的实际情况",
    region: memory.core.region || "所在地区",
    challenge: memory.core.mainChallenges || "当前经营压力",
    goal: memory.core.currentGoal || "当前最想解决的问题",
    resources: memory.core.companyResources || "已有材料和资源"
  };

  const drafts = {
    policy: `结合我们目前的情况：${context.business}，主要在${context.region}经营。想先了解和“${context.goal}”相关的政策、补贴或支持方向，应该从哪些官方渠道开始核验？`,
    financing: `结合我们目前的情况：${context.business}。当前最大的压力是“${context.challenge}”，想围绕“${context.goal}”做融资准备，应该先整理哪些真实材料和风险点？`,
    document: `请结合我们的情况：${context.business}，当前想解决“${context.goal}”。帮我起草一份基础说明材料，优先写贷款用途说明或经营情况说明。`,
    compliance: `结合我们当前准备处理的问题“${context.goal}”，如果遇到收费、合同、宣传话术或材料要求，哪些表述最值得警惕？`,
    operations: `我们目前的经营情况是：${context.business}。现在最大的困难是“${context.challenge}”，想先做经营梳理，应该从哪些动作开始排查？`,
    cases: `请基于“${context.goal}”这个方向，给我一个服务小微企业的案例写法，重点写背景、服务动作、可借鉴点和边界。`
  };

  return drafts[scene] || "";
}

function appendInteractionMemory(question, data) {
  const item = {
    at: new Date().toISOString(),
    module: data.module,
    moduleTitle: data.moduleTitle,
    question: question.slice(0, 140),
    trace: data.trace?.intentTitle || data.moduleTitle || ""
  };

  state.memory.interactions = [...(state.memory.interactions || []), item].slice(-MAX_INTERACTIONS);
  state.memory.meta.updatedAt = new Date().toISOString();

  if (data.moduleTitle) {
    state.memory.profile.focusArea = data.moduleTitle;
  }
}

function applyConversationHeuristics(text, memory) {
  if (!memory.profile.companyHistory && /(成立|创立|经营|做了)\S{0,8}(\d+年|多年)/.test(text)) {
    memory.profile.companyHistory = text.slice(0, 80);
  }

  if (/简洁|直接一点|别太长/.test(text)) {
    memory.profile.communicationStyle = "偏好简洁直接";
    upsertPreference(memory, "偏好简洁直接");
  }

  if (/多给案例|举例/.test(text)) {
    upsertPreference(memory, "偏好案例说明");
  }

  if (/不要太营销|克制一点|别像广告/.test(text)) {
    upsertPreference(memory, "偏好克制表达");
  }

  if (/金额|万|融资/.test(text) && !memory.profile.targetAmount) {
    const amountMatch = text.match(/(\d+\s*(万|万元|w))/);
    if (amountMatch) {
      memory.profile.targetAmount = amountMatch[1].replace(/\s+/g, "");
    }
  }
}

function upsertPreference(memory, value) {
  const list = new Set(memory.profile.userPreferences || []);
  list.add(value);
  memory.profile.userPreferences = Array.from(list).slice(-5);
}

function inferIndustry(text) {
  const rules = [
    ["制造", /制造|工厂|设备|配件|加工/],
    ["餐饮", /餐饮|门店|饭店|餐厅|咖啡|烘焙/],
    ["零售", /零售|商超|便利店|电商|批发/],
    ["科技服务", /软件|SaaS|科技|技术服务|开发/],
    ["物流运输", /物流|货运|仓储|运输/],
    ["农业", /农业|养殖|种植|农产品/]
  ];

  const matched = rules.find(([, pattern]) => pattern.test(text));
  return matched ? matched[0] : "";
}

function nextOnboardingIndex() {
  const index = onboardingFlow.findIndex((step) => {
    if (step.key === "resources") {
      return !state.memory.core.companyResources;
    }
    if (step.key === "advantages") {
      return !state.memory.core.advantages;
    }
    if (step.key === "vision") {
      return !state.memory.core.companyVision;
    }
    return !state.memory.core[step.key];
  });

  return index === -1 ? null : index;
}

function needsOnboarding() {
  const requiredCount = [
    state.memory.core.mainBusiness,
    state.memory.core.region,
    state.memory.core.mainChallenges,
    state.memory.core.currentGoal
  ].filter(Boolean).length;

  return !state.memory.meta.intakeComplete || requiredCount < 4;
}

function isOnboardingActive() {
  return state.onboardingIndex !== null;
}

function modeLabel(mode) {
  if (mode === "model") return "结合企业背景整理";
  if (mode === "runtime-fallback") return "基础咨询模式";
  if (mode === "guardrail") return "风险保护提示";
  return mode || "-";
}

function addMessage(role, text) {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  item.innerHTML = role === "assistant" ? formatMarkdown(text) : `<p>${escapeHtml(text)}</p>`;
  nodes.messages.appendChild(item);
  nodes.messages.scrollTop = nodes.messages.scrollHeight;
  return item;
}

function formatMarkdown(text) {
  const lines = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .split(/\n/);

  const chunks = [];
  let listType = null;
  let listItems = [];

  function flushList() {
    if (!listType || !listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    chunks.push(`<${tag}>${listItems.join("")}</${tag}>`);
    listType = null;
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    if (/^##\s+/.test(line)) {
      flushList();
      chunks.push(`<h3>${line.replace(/^##\s+/, "")}</h3>`);
      continue;
    }

    if (/^###\s+/.test(line)) {
      flushList();
      chunks.push(`<h4>${line.replace(/^###\s+/, "")}</h4>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(`<li>${line.replace(/^\d+\.\s+/, "")}</li>`);
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(`<li>${line.replace(/^[-*•]\s+/, "")}</li>`);
      continue;
    }

    flushList();
    chunks.push(`<p>${line}</p>`);
  }

  flushList();
  return chunks.join("");
}

function renderTags(items) {
  return items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");
}

function setLoading(isLoading) {
  nodes.askButton.disabled = isLoading;
  if (isLoading) {
    nodes.askButton.textContent = "整理中...";
    return;
  }
  nodes.askButton.textContent = isOnboardingActive() ? "记录并继续" : "获取建议";
}

function createDefaultMemory() {
  return {
    version: 3,
    core: {
      mainBusiness: "",
      industry: "",
      region: "",
      mainChallenges: "",
      currentGoal: "",
      advantages: "",
      marketSituation: "",
      companyResources: "",
      teamCharacteristics: "",
      companyVision: "",
      companyStrategy: "",
      industryCompetitiveness: ""
    },
    profile: {
      companyHistory: "",
      communicationStyle: "",
      userPreferences: [],
      focusArea: "",
      targetAmount: ""
    },
    interactions: [],
    meta: {
      intakeComplete: false,
      updatedAt: ""
    }
  };
}

function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return createDefaultMemory();
    return mergeMemory(createDefaultMemory(), JSON.parse(raw));
  } catch {
    return createDefaultMemory();
  }
}

function persistMemory() {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(state.memory));
}

function mergeMemory(base, patch) {
  return {
    ...base,
    ...patch,
    core: { ...base.core, ...(patch.core || {}) },
    profile: { ...base.profile, ...(patch.profile || {}) },
    interactions: Array.isArray(patch.interactions) ? patch.interactions : base.interactions,
    meta: { ...base.meta, ...(patch.meta || {}) }
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
