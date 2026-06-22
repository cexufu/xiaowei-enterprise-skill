const MEMORY_KEY = "xiaowei-enterprise-memory-v3";
const MAX_INTERACTIONS = 8;

const onboardingFlow = [
  {
    id: "business",
    question: "先简单说一下：你们主要做什么产品或服务？服务谁？大致属于什么行业？",
    isComplete(memory) {
      return Boolean(memory.core.mainBusiness);
    },
    apply(memory, answer) {
      memory.core.mainBusiness = answer;
      const industry = inferIndustry(answer);
      if (industry && !memory.core.industry) {
        memory.core.industry = industry;
      }
    }
  },
  {
    id: "region",
    question: "主要在哪些城市或区域经营？现在最核心的市场在哪里？",
    isComplete(memory) {
      return Boolean(memory.core.region);
    },
    apply(memory, answer) {
      memory.core.region = answer;
      if (!memory.core.marketSituation) {
        memory.core.marketSituation = answer;
      }
    }
  },
  {
    id: "challengeGoal",
    question: "现阶段最现实的困难是什么？这次最想优先解决的问题又是什么？可以放在一句话里说。",
    isComplete(memory) {
      return Boolean(memory.core.mainChallenges) && Boolean(memory.core.currentGoal);
    },
    apply(memory, answer) {
      const { challenge, goal } = splitChallengeAndGoal(answer);
      memory.core.mainChallenges = challenge || answer;
      memory.core.currentGoal = goal || answer;
    }
  },
  {
    id: "resources",
    question: "你们现在已有的资源、材料或优势是什么？比如订单、客户、发票、设备、渠道、团队经验等。",
    isComplete(memory) {
      return Boolean(memory.core.companyResources) && Boolean(memory.core.advantages);
    },
    apply(memory, answer) {
      memory.core.companyResources = answer;
      memory.core.teamCharacteristics = answer;
      memory.core.advantages = answer;
      if (!memory.core.industryCompetitiveness) {
        memory.core.industryCompetitiveness = answer;
      }
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
  memoryProgressBar: document.querySelector("#memoryProgressBar"),
  memoryProgressText: document.querySelector("#memoryProgressText"),
  refreshMemoryButton: document.querySelector("#refreshMemoryButton"),
  traceIntent: document.querySelector("#traceIntent"),
  traceMode: document.querySelector("#traceMode"),
  traceGuardrail: document.querySelector("#traceGuardrail"),
  traceSensitive: document.querySelector("#traceSensitive"),
  traceProfile: document.querySelector("#traceProfile"),
  traceMissing: document.querySelector("#traceMissing"),
  coreMemory: document.querySelector("#coreMemory"),
  profileMemory: document.querySelector("#profileMemory"),
  interactionMemory: document.querySelector("#interactionMemory"),
  resultCards: document.querySelector("#resultCards"),
  boardHint: document.querySelector("#boardHint"),
  followupSuggestions: document.querySelector("#followupSuggestions")
};

const state = {
  health: null,
  memory: loadMemory(),
  onboardingIndex: null,
  pendingModule: "auto",
  lastResponse: null
};

init();

async function init() {
  bindEvents();
  renderMemoryPanels();
  renderHero();
  renderTrace(null);
  renderResultBoard(null);
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

  nodes.followupSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prompt]");
    if (!button) return;
    nodes.questionInput.value = button.dataset.prompt || "";
    nodes.questionInput.focus();
    nodes.questionInput.setSelectionRange(nodes.questionInput.value.length, nodes.questionInput.value.length);
  });
}

function startConversation() {
  if (needsOnboarding()) {
    addMessage(
      "assistant",
      "你好。这里会先用 4 个必要问题建立企业档案。后面无论你问政策、融资准备、材料还是经营问题，我都会默认带入这份背景，不再反复让你重讲。"
    );
    ensureOnboarding(false);
    return;
  }

  addMessage(
    "assistant",
    "你好，企业档案已经建立。你现在可以直接提具体问题，我会优先整理事项、材料、风险和下一步动作。"
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
    renderResultBoard(state.lastResponse);
    return;
  }

  renderHero();
  renderResultBoard(state.lastResponse);

  if (forcePrompt) {
    addMessage("assistant", "先把企业档案补到可用状态。这样后面的建议才会真正贴着你的企业情况走。");
  }

  askCurrentOnboardingQuestion();
}

function askCurrentOnboardingQuestion() {
  const step = onboardingFlow[state.onboardingIndex];
  if (!step) return;
  addMessage("assistant", step.question);
  nodes.composerTip.textContent = `当前正在建立企业档案，第 ${state.onboardingIndex + 1}/${onboardingFlow.length} 轮。`;
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

  const nextIndex = nextOnboardingIndex();
  if (nextIndex !== null) {
    state.onboardingIndex = nextIndex;
    addMessage("assistant", "记下了。继续下一项。");
    askCurrentOnboardingQuestion();
    return;
  }

  state.onboardingIndex = null;
  state.memory.meta.intakeComplete = true;
  state.memory.meta.updatedAt = new Date().toISOString();
  persistMemory();
  renderMemoryPanels();
  renderHero();
  renderResultBoard(state.lastResponse);
  nodes.composerTip.textContent = "企业档案已建立。后续可以直接进入具体咨询。";
  nodes.askButton.textContent = "获取建议";

  addMessage(
    "assistant",
    "基础情况已记录。接下来你可以直接说具体问题，我会默认以这些企业背景为出发点来整理结果。"
  );
}

function restartOnboarding() {
  state.memory.core.mainBusiness = "";
  state.memory.core.industry = "";
  state.memory.core.region = "";
  state.memory.core.mainChallenges = "";
  state.memory.core.currentGoal = "";
  state.memory.core.advantages = "";
  state.memory.core.marketSituation = "";
  state.memory.core.companyResources = "";
  state.memory.core.teamCharacteristics = "";
  state.memory.core.industryCompetitiveness = "";
  state.onboardingIndex = 0;
  state.memory.meta.intakeComplete = false;
  persistMemory();
  renderMemoryPanels();
  renderHero();
  renderResultBoard(state.lastResponse);
  addMessage("assistant", "我们重新更新一遍企业档案。每一轮都尽量只说必要信息，不需要长篇介绍。");
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
    nodes.healthHint.textContent = "你可以先建立企业档案，再直接进入具体咨询。";
    return;
  }

  nodes.statusBadge.textContent = "服务已就绪";
  nodes.statusBadge.className = data.hasApiKey ? "status-badge live" : "status-badge";
  nodes.healthHint.textContent = needsOnboarding()
    ? "建议先完成 4 轮企业档案。这样结果看板里的内容会明显更具体。"
    : "企业档案已就绪。接下来可以直接提问题，系统会自动整理结构化结果。";
}

function renderHero() {
  renderHealth(state.health);

  if (needsOnboarding() || isOnboardingActive()) {
    nodes.heroTitle.textContent = "先用 4 个问题建立企业档案，后续建议会从你的实际经营情况出发";
    nodes.composerTip.textContent = isOnboardingActive()
      ? `当前正在建立企业档案，第 ${state.onboardingIndex + 1}/${onboardingFlow.length} 轮。`
      : "先建立企业档案，后续问题就不需要重复介绍背景。";
    nodes.askButton.textContent = isOnboardingActive() ? "记录并继续" : "继续";
    return;
  }

  nodes.heroTitle.textContent = "企业背景已经记住了。接下来直接说问题，我会给你结构化的事项、材料、风险和下一步";
  nodes.composerTip.textContent = "你可以直接说场景、用途、已有材料和顾虑，我会按结构化方式替你整理。";
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

    state.lastResponse = data;
    addMessage("assistant", data.reply);
    renderTrace(data);
    renderResultBoard(data);
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
  if (!data) {
    const tips = buildMissingFieldTips();
    nodes.traceIntent.textContent = "待开始";
    nodes.traceMode.textContent = "待开始";
    nodes.traceGuardrail.textContent = "-";
    nodes.traceSensitive.textContent = "-";
    nodes.traceProfile.textContent = needsOnboarding() ? `${getOnboardingCompletionCount()}/${onboardingFlow.length}` : "-";
    if (tips.length) {
      nodes.traceMissing.className = "tag-list";
      nodes.traceMissing.innerHTML = renderTags(tips);
    } else {
      nodes.traceMissing.className = "tag-list empty";
      nodes.traceMissing.textContent = "当前基础背景已较完整，可继续补充更具体的问题。";
    }
    return;
  }

  nodes.traceIntent.textContent = data.trace?.intentTitle || data.moduleTitle || "待识别";
  nodes.traceMode.textContent = modeLabel(data.mode);
  nodes.traceGuardrail.textContent = data.trace?.guardrail || "-";
  nodes.traceSensitive.textContent = data.trace?.sensitive || "-";
  nodes.traceProfile.textContent = data.trace?.profileCompleteness || "-";
  if (data.trace?.missingLowRiskFields?.length) {
    nodes.traceMissing.className = "tag-list";
    nodes.traceMissing.innerHTML = renderTags(data.trace.missingLowRiskFields);
  } else {
    nodes.traceMissing.className = "tag-list empty";
    nodes.traceMissing.textContent = "当前基础背景已较完整，可继续补充金额区间、材料类型或更具体目标。";
  }
}

function renderMemoryPanels() {
  renderMemorySummary();
  renderMemoryProgress();
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
    nodes.memorySummary.textContent = "先回答 4 个必要问题，后续建议就会默认结合你的企业背景，不再重复从零开始。";
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

function renderMemoryProgress() {
  const completed = getOnboardingCompletionCount();
  const ratio = `${Math.round((completed / onboardingFlow.length) * 100)}%`;
  nodes.memoryProgressBar.style.width = ratio;
  nodes.memoryProgressText.textContent = `${completed} / ${onboardingFlow.length}`;
}

function renderCoreMemory() {
  const tags = [
    state.memory.core.industry,
    state.memory.core.region,
    state.memory.core.mainChallenges,
    state.memory.core.currentGoal,
    state.memory.core.advantages
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

function renderResultBoard(data) {
  if (!data) {
    nodes.boardHint.textContent = needsOnboarding()
      ? "先完成 4 轮企业档案，再发起咨询，这里的结果会明显更像工具而不是通用问答。"
      : "发起一次咨询后，这里会自动整理结构化结果。";
    nodes.resultCards.className = "result-cards empty";
    nodes.resultCards.innerHTML = `
      <article class="empty-card">
        <strong>还没有咨询结果</strong>
        <p>先建立企业档案，再提一个具体问题。系统会自动把回答拆成可执行卡片，而不是只返回一段大模型文字。</p>
      </article>
    `;
    renderFollowupSuggestions(null, []);
    return;
  }

  const sections = parseReplySections(data.reply);
  const visibleSections = pickBoardSections(sections);
  nodes.boardHint.textContent = `${data.moduleTitle} · ${modeLabel(data.mode)}`;
  nodes.resultCards.className = visibleSections.length ? "result-cards" : "result-cards empty";
  nodes.resultCards.innerHTML = visibleSections.length
    ? visibleSections.map((section) => renderResultCard(section)).join("")
    : `
      <article class="empty-card">
        <strong>这次回答没有成功结构化</strong>
        <p>你可以继续追问更具体的问题，或者直接让我生成清单、初稿或风险标注。</p>
      </article>
    `;
  renderFollowupSuggestions(data, sections);
}

function renderResultCard(section) {
  const tone = cardToneForTitle(section.title);
  const content = section.body ? formatMarkdown(section.body) : "<p>—</p>";
  return `
    <article class="result-card ${tone}">
      <h3>${escapeHtml(section.title)}</h3>
      <div class="result-card-body">${content}</div>
    </article>
  `;
}

function renderFollowupSuggestions(data, sections) {
  const suggestions = buildFollowupSuggestions(data, sections);
  if (!suggestions.length) {
    nodes.followupSuggestions.className = "action-list empty";
    nodes.followupSuggestions.textContent = "发起一次咨询后，这里会给出下一轮可直接发送的建议动作。";
    return;
  }

  nodes.followupSuggestions.className = "action-list";
  nodes.followupSuggestions.innerHTML = suggestions
    .map((item) => `<button class="suggestion-chip" type="button" data-prompt="${escapeAttribute(item.prompt)}">${escapeHtml(item.label)}</button>`)
    .join("");
}

function buildFollowupSuggestions(data, sections) {
  if (!data) {
    return buildMissingFieldPrompts().slice(0, 3);
  }

  const prompts = [];
  const nextStep = extractSectionBody(sections, /下一步/);
  if (nextStep) {
    prompts.push({ label: "按当前结果继续追问", prompt: nextStep.replace(/\n+/g, " ").trim() });
  }

  const modulePrompts = {
    policy: [
      { label: "生成政策核验清单", prompt: "请基于我们当前情况，帮我做一张政策核验清单，按渠道、适用条件、材料和核验动作来写。" },
      { label: "补充官方入口", prompt: "请继续补充和我们情况相关的官方入口，优先列出本地化核验路径。" }
    ],
    financing: [
      { label: "生成融资准备清单", prompt: "请基于我们当前情况，生成一张融资准备清单，按用途、材料、风险和下一步展开。" },
      { label: "起草贷款用途说明", prompt: "请结合我们当前情况，先起草一版贷款用途说明，缺失字段用【待确认】标注。" }
    ],
    document: [
      { label: "继续补全初稿", prompt: "请继续把这份材料初稿展开得更完整一些，并标出还需要我补充的字段。" },
      { label: "列出待确认字段", prompt: "请把这份材料里所有待确认字段单独列出来，按优先级排序。" }
    ],
    compliance: [
      { label: "逐条标注风险", prompt: "我接下来贴一段宣传话术或合同表述，请你逐条标注风险和替代表达。" },
      { label: "生成核验清单", prompt: "请给我一份收费、合同和资质核验清单，适合小微企业自己先做初筛。" }
    ],
    operations: [
      { label: "生成排查清单", prompt: "请基于我们当前情况，生成一份经营排查清单，优先围绕库存、回款和现金流。" },
      { label: "给两周复盘框架", prompt: "请给我一个适合小微企业的两周经营复盘框架，尽量简单可执行。" }
    ],
    cases: [
      { label: "整理成案例写法", prompt: "请把这个方向整理成案例写法，按背景、服务动作、可借鉴点和边界来写。" },
      { label: "改成克制表达", prompt: "请把这段案例表达改得更克制、更像公共服务，而不是营销导流。" }
    ]
  }[data.module] || [];

  prompts.push(...modulePrompts);

  const missingPrompts = buildMissingFieldPrompts(data.trace?.missingLowRiskFields || []);
  prompts.push(...missingPrompts);

  return dedupeSuggestions(prompts).slice(0, 4);
}

function buildMissingFieldPrompts(fields = buildMissingFieldTips()) {
  const mapping = {
    地区: { label: "补充经营地区", prompt: "补充一下我们的经营地区、核心市场和主要客户分布：" },
    行业: { label: "补充主营与行业", prompt: "补充一下我们的主营业务、行业和客户类型：" },
    经营阶段: { label: "补充经营阶段", prompt: "补充一下我们的经营年限、团队情况和发展阶段：" },
    资金用途: { label: "补充资金用途", prompt: "补充一下这次资金或事项的具体用途、周期和目标：" }
  };

  return fields
    .map((field) => mapping[field])
    .filter(Boolean);
}

function dedupeSuggestions(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || !item.prompt) return false;
    if (seen.has(item.prompt)) return false;
    seen.add(item.prompt);
    return true;
  });
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
    policy: `结合我们目前的情况：${context.business}，主要在${context.region}经营。想围绕“${context.goal}”先做政策方向和官方核验，应该从哪些入口开始？`,
    financing: `结合我们目前的情况：${context.business}。当前最大的压力是“${context.challenge}”，想围绕“${context.goal}”做融资准备，应该先整理哪些真实材料和风险点？`,
    document: `请结合我们的情况：${context.business}，当前想解决“${context.goal}”。先帮我起草一份基础说明材料，并标出待确认字段。`,
    compliance: `结合我们当前准备处理的问题“${context.goal}”，如果遇到收费、合同、宣传话术或材料要求，哪些表述最值得警惕？`,
    operations: `我们目前的经营情况是：${context.business}。现在最大的困难是“${context.challenge}”，如果先做经营梳理，应该从哪些动作开始排查？`,
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

function splitChallengeAndGoal(text) {
  const normalized = text.replace(/。/g, "，");
  const marker = normalized.match(/(想|希望|优先|目标是|打算|计划)/);
  if (!marker) {
    return { challenge: text, goal: text };
  }

  const index = marker.index || 0;
  return {
    challenge: normalized.slice(0, index).replace(/^[，,\s]+|[，,\s]+$/g, ""),
    goal: normalized.slice(index).replace(/^[，,\s]+|[，,\s]+$/g, "")
  };
}

function nextOnboardingIndex() {
  const index = onboardingFlow.findIndex((step) => !step.isComplete(state.memory));
  return index === -1 ? null : index;
}

function getOnboardingCompletionCount() {
  return onboardingFlow.filter((step) => step.isComplete(state.memory)).length;
}

function buildMissingFieldTips() {
  const tips = [];
  if (!state.memory.core.region) tips.push("地区");
  if (!state.memory.core.industry && !state.memory.core.mainBusiness) tips.push("行业");
  if (!state.memory.profile.companyHistory) tips.push("经营阶段");
  if (!state.memory.core.currentGoal) tips.push("资金用途");
  return tips.slice(0, 3);
}

function needsOnboarding() {
  return !state.memory.meta.intakeComplete || getOnboardingCompletionCount() < onboardingFlow.length;
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
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const chunks = [];
  let listType = null;
  let listItems = [];
  let blockquoteLines = [];
  let tableRows = [];

  function flushList() {
    if (!listType || !listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    chunks.push(`<${tag}>${listItems.join("")}</${tag}>`);
    listType = null;
    listItems = [];
  }

  function flushBlockquote() {
    if (!blockquoteLines.length) return;
    const body = blockquoteLines.map((line) => `<p>${formatInline(line)}</p>`).join("");
    chunks.push(`<blockquote>${body}</blockquote>`);
    blockquoteLines = [];
  }

  function flushTable() {
    if (!tableRows.length) return;
    const parsed = parseTable(tableRows);
    if (parsed) {
      chunks.push(parsed);
    } else {
      chunks.push(...tableRows.map((row) => `<p>${formatInline(row)}</p>`));
    }
    tableRows = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      flushBlockquote();
      flushTable();
      continue;
    }

    if (isTableRow(line)) {
      flushList();
      flushBlockquote();
      tableRows.push(line);
      continue;
    }

    flushTable();

    if (/^###\s+/.test(line)) {
      flushList();
      flushBlockquote();
      chunks.push(`<h4>${formatInline(line.replace(/^###\s+/, ""))}</h4>`);
      continue;
    }

    if (/^##\s+/.test(line)) {
      flushList();
      flushBlockquote();
      chunks.push(`<h3>${formatInline(line.replace(/^##\s+/, ""))}</h3>`);
      continue;
    }

    if (/^(---|\*\*\*)+$/.test(line)) {
      flushList();
      flushBlockquote();
      chunks.push("<hr />");
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushList();
      blockquoteLines.push(line.replace(/^>\s?/, ""));
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      flushBlockquote();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(`<li>${formatInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      flushBlockquote();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(`<li>${formatInline(line.replace(/^[-*•]\s+/, ""))}</li>`);
      continue;
    }

    flushList();
    flushBlockquote();
    chunks.push(`<p>${formatInline(line)}</p>`);
  }

  flushList();
  flushBlockquote();
  flushTable();
  return chunks.join("");
}

function parseTable(rows) {
  const parsedRows = rows
    .map((row) => splitTableRow(row))
    .filter((cells) => cells.length >= 2 && cells.some((cell) => cell));

  if (parsedRows.length < 2) return "";

  const dividerIndex = rows.findIndex((row) => isTableDivider(row));
  const headerCells = parsedRows[0];
  const bodyRows = dividerIndex === 1 ? parsedRows.slice(1) : parsedRows.slice(1);

  const body = bodyRows
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .map((cells) => `<tr>${cells.map((cell) => `<td>${formatInline(cell)}</td>`).join("")}</tr>`)
    .join("");

  if (!body) return "";

  return `
    <table>
      <thead><tr>${headerCells.map((cell) => `<th>${formatInline(cell)}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function isTableRow(line) {
  return (/^\|.+\|$/.test(line) || isTableDivider(line)) && splitTableRow(line).length >= 2;
}

function isTableDivider(line) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function splitTableRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function parseReplySections(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      if (current) {
        current.body = current.body.join("\n").trim();
        sections.push(current);
      }
      current = { title: heading[1].trim(), body: [] };
      continue;
    }

    if (!current) {
      current = { title: "回答", body: [] };
    }
    current.body.push(rawLine);
  }

  if (current) {
    current.body = current.body.join("\n").trim();
    sections.push(current);
  }

  return sections.filter((section) => section.title && section.body);
}

function pickBoardSections(sections) {
  const excluded = /下一步|服务说明|信息安全提醒/;
  const preferred = [
    /先给结论|现状判断|风险等级|案例背景|名称\/简介|文档初稿/,
    /你现在可以做什么|改进动作|服务动作|核验动作|可借鉴点|官方入口|可了解路径|工具模板|首屏问题/,
    /需要准备的材料\/信息|材料清单|待确认字段|标签|审核风险/,
    /风险提醒|风险点|边界提醒|风险边界/
  ];

  const selected = [];
  const used = new Set();

  for (const rule of preferred) {
    const match = sections.find((section, index) => !used.has(index) && rule.test(section.title));
    if (match) {
      const index = sections.indexOf(match);
      used.add(index);
      selected.push(match);
    }
  }

  const fallback = sections.filter((section, index) => !used.has(index) && !excluded.test(section.title));
  return [...selected, ...fallback].slice(0, 4);
}

function extractSectionBody(sections, pattern) {
  const section = sections.find((item) => pattern.test(item.title));
  return section ? section.body : "";
}

function cardToneForTitle(title) {
  if (/风险|边界/.test(title)) return "tone-risk";
  if (/材料|字段|标签/.test(title)) return "tone-material";
  if (/下一步|动作|入口|清单|结论/.test(title)) return "tone-action";
  return "";
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
    version: 4,
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

function escapeAttribute(value) {
  return escapeHtml(value);
}
