const nodes = {
  moduleSelect: document.querySelector("#moduleSelect"),
  region: document.querySelector("#region"),
  industry: document.querySelector("#industry"),
  stage: document.querySelector("#stage"),
  scale: document.querySelector("#scale"),
  purpose: document.querySelector("#purpose"),
  amount: document.querySelector("#amount"),
  materials: document.querySelector("#materials"),
  challenge: document.querySelector("#challenge"),
  messages: document.querySelector("#messages"),
  askForm: document.querySelector("#askForm"),
  questionInput: document.querySelector("#questionInput"),
  askButton: document.querySelector("#askButton"),
  healthHint: document.querySelector("#healthHint"),
  statusBadge: document.querySelector("#statusBadge"),
  traceIntent: document.querySelector("#traceIntent"),
  traceMode: document.querySelector("#traceMode"),
  traceGuardrail: document.querySelector("#traceGuardrail"),
  traceSensitive: document.querySelector("#traceSensitive"),
  traceProfile: document.querySelector("#traceProfile"),
  traceMissing: document.querySelector("#traceMissing"),
  traceFrame: document.querySelector("#traceFrame"),
  profileSummary: document.querySelector("#profileSummary"),
  reviewMeta: document.querySelector("#reviewMeta"),
  reviewChecks: document.querySelector("#reviewChecks")
};

const state = {
  health: null
};

init();

async function init() {
  bindEvents();
  renderProfileSummary();
  await loadHealth();
  addWelcomeMessage();
}

function bindEvents() {
  nodes.askForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = nodes.questionInput.value.trim();
    if (!question) return;
    nodes.questionInput.value = "";
    await runSkill(question);
  });

  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.module) {
        nodes.moduleSelect.value = button.dataset.module;
      }
      runSkill(button.dataset.prompt);
    });
  });

  [
    nodes.region,
    nodes.industry,
    nodes.stage,
    nodes.scale,
    nodes.purpose,
    nodes.amount,
    nodes.materials,
    nodes.challenge
  ].forEach((node) => {
    node.addEventListener("input", renderProfileSummary);
  });
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
    nodes.healthHint.textContent = "你可以直接描述当前遇到的问题，我们会先帮你梳理事项、资料和风险。";
    return;
  }

  if (data.hasApiKey) {
    nodes.statusBadge.textContent = "服务已就绪";
    nodes.statusBadge.className = "status-badge live";
    nodes.healthHint.textContent = "适合继续咨询政策方向、融资准备、资料整理、风险识别和经营问题。";
    return;
  }

  nodes.statusBadge.textContent = "服务已就绪";
  nodes.statusBadge.className = "status-badge";
  nodes.healthHint.textContent = "你可以先梳理政策方向、资料清单、风险提醒和下一步动作，再逐步补充情况。";
}

function addWelcomeMessage() {
  const opening = state.health?.hasApiKey
    ? "你好，这里是面向小微企业的服务助手。你可以直接描述经营、政策、融资准备、材料起草或风险识别问题，我们会先帮你把事实、路径和边界理清楚。"
    : "你好，这里是面向小微企业的服务助手。你可以先描述经营情况、用途、已有材料和顾虑，我们会先帮你梳理事项方向、资料清单、风险提醒和下一步动作。";

  addMessage("assistant", `${opening}\n\n你不需要先准备完整材料，也不需要提交敏感信息。只要把业务场景、用途、已有材料和当前困难说清楚，就可以开始。`);
}

async function runSkill(question) {
  addMessage("user", question);
  setLoading(true);
  const loading = addMessage("assistant", "正在梳理问题、检查边界并组织建议，请稍等。");

  try {
    const response = await fetch("/api/skill-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        module: nodes.moduleSelect.value,
        message: question,
        profile: getProfile()
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
  } catch (error) {
    loading.remove();
    addMessage("assistant", `当前无法完成处理：${error.message}`);
  } finally {
    setLoading(false);
  }
}

function getProfile() {
  return {
    region: nodes.region.value.trim(),
    industry: nodes.industry.value.trim(),
    stage: nodes.stage.value.trim(),
    scale: nodes.scale.value.trim(),
    purpose: nodes.purpose.value.trim(),
    amount: nodes.amount.value.trim(),
    materials: nodes.materials.value.trim(),
    challenge: nodes.challenge.value.trim()
  };
}

function renderTrace(data) {
  const checks = data.review?.checks || [];
  const notes = buildServiceNotes(data, checks);

  nodes.traceIntent.textContent = data.trace?.intentTitle || data.moduleTitle || "待识别";
  nodes.traceMode.textContent = modeLabel(data.mode, data.model);
  nodes.traceGuardrail.textContent = data.trace?.guardrail || "-";
  nodes.traceSensitive.textContent = data.trace?.sensitive || "-";
  nodes.traceProfile.textContent = data.trace?.profileCompleteness || "-";
  nodes.traceMissing.innerHTML = renderTagList(
    data.trace?.missingLowRiskFields?.length
      ? data.trace.missingLowRiskFields
      : ["基础概况已较完整，可继续补充金额区间、材料类型或当前困难。"]
  );
  nodes.traceFrame.innerHTML = renderTagList(data.trace?.outputFrame || []);
  nodes.reviewMeta.textContent = data.mode === "guardrail" ? "本次问题已触发风险保护" : "以下内容供你理解本次服务边界";
  nodes.reviewChecks.innerHTML = notes.map((item) => (
    `<div class="check"><span>${escapeHtml(item.name)}</span><strong class="${item.passed ? "pass" : "warn"}">${item.passed ? "已覆盖" : "需留意"}</strong></div>`
  )).join("");
}

function renderProfileSummary() {
  const entries = [
    ["地区", nodes.region.value.trim()],
    ["行业", nodes.industry.value.trim()],
    ["经营阶段", nodes.stage.value.trim()],
    ["经营规模", nodes.scale.value.trim()],
    ["资金用途", nodes.purpose.value.trim()],
    ["金额区间", nodes.amount.value.trim()],
    ["已有材料", nodes.materials.value.trim()],
    ["当前困难", nodes.challenge.value.trim()]
  ].filter(([, value]) => value);

  if (!entries.length) {
    nodes.profileSummary.className = "profile-summary empty";
    nodes.profileSummary.textContent = "还没有填写企业概况。";
    return;
  }

  nodes.profileSummary.className = "profile-summary";
  nodes.profileSummary.innerHTML = entries
    .map(([label, value]) => `<div class="profile-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderTagList(items) {
  return items
    .map((item) => `<span class="tag">${escapeHtml(item)}</span>`)
    .join("");
}

function modeLabel(mode, model) {
  if (mode === "model") return "综合咨询整理";
  if (mode === "runtime-fallback") return "基础事项梳理";
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

function setLoading(isLoading) {
  nodes.askButton.disabled = isLoading;
  nodes.askButton.textContent = isLoading ? "整理中..." : "获取建议";
}

function buildServiceNotes(data, checks) {
  const hasNextStep = checks.find((item) => item.name === "可执行动作")?.passed;
  const hasBoundary = checks.find((item) => item.name === "合规边界")?.passed;
  const hasStructure = checks.find((item) => item.name === "结构化输出")?.passed;
  const blocked = data.mode === "guardrail";

  return [
    {
      name: blocked ? "已识别到高风险请求，并给出可替代的安全方向" : "本次回答已尽量围绕你的问题给出下一步动作",
      passed: blocked || hasNextStep
    },
    {
      name: "本次回答已提示哪些内容需要以正式机构、合同或官方口径为准",
      passed: hasBoundary
    },
    {
      name: "本次建议按事项、材料、风险和后续动作进行了整理",
      passed: hasStructure
    }
  ];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
