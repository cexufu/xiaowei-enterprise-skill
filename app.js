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
  traceConfidence: document.querySelector("#traceConfidence"),
  traceGuardrail: document.querySelector("#traceGuardrail"),
  traceSensitive: document.querySelector("#traceSensitive"),
  traceProfile: document.querySelector("#traceProfile"),
  traceMissing: document.querySelector("#traceMissing"),
  traceFrame: document.querySelector("#traceFrame"),
  profileSummary: document.querySelector("#profileSummary"),
  reviewScore: document.querySelector("#reviewScore"),
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
    nodes.statusBadge.textContent = "状态暂不可读";
    nodes.statusBadge.className = "status-badge muted";
    nodes.healthHint.textContent = "服务已启动，但当前无法读取模型状态。你仍然可以先试提问。";
    return;
  }

  if (data.hasApiKey) {
    nodes.statusBadge.textContent = "智能分析已启用";
    nodes.statusBadge.className = "status-badge live";
    nodes.healthHint.textContent = `当前已连接 ${data.modelName}。适合继续做复杂问题梳理、材料初稿和结构化建议输出。`;
    return;
  }

  nodes.statusBadge.textContent = "基础模式";
  nodes.statusBadge.className = "status-badge";
  nodes.healthHint.textContent = `当前处于基础模式，仍可先梳理政策方向、材料清单、合规风险和下一步动作。`;
}

function addWelcomeMessage() {
  const opening = state.health?.hasApiKey
    ? "你好，这里是面向小微企业的服务助手。你可以直接描述经营、政策、融资准备、材料起草或风险识别问题，我会先帮你把事实、路径和边界理清楚。"
    : "你好，这里是面向小微企业的服务助手。当前处于基础模式，但仍然可以先帮你梳理事项方向、资料清单、风险提醒和下一步动作。";

  addMessage("assistant", `${opening}\n\n你不需要先懂金融术语，也不需要提交敏感信息。只要把业务场景、用途、已有材料和当前困难说清楚，就能开始。`);
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
  const passedCount = checks.filter((item) => item.passed).length;

  nodes.traceIntent.textContent = data.trace?.intentTitle || data.moduleTitle || "待识别";
  nodes.traceMode.textContent = modeLabel(data.mode, data.model);
  nodes.traceConfidence.textContent = data.trace?.confidence || "-";
  nodes.traceGuardrail.textContent = data.trace?.guardrail || "-";
  nodes.traceSensitive.textContent = data.trace?.sensitive || "-";
  nodes.traceProfile.textContent = data.trace?.profileCompleteness || "-";
  nodes.traceMissing.innerHTML = renderTagList(
    data.trace?.missingLowRiskFields?.length
      ? data.trace.missingLowRiskFields
      : ["基础概况已较完整，可继续补充金额区间、材料类型或当前困难。"]
  );
  nodes.traceFrame.innerHTML = renderTagList(data.trace?.outputFrame || []);
  nodes.reviewScore.textContent = data.review?.score ? `${data.review.score} 分` : "-";
  nodes.reviewMeta.textContent = checks.length ? `通过 ${passedCount}/${checks.length} 项` : "暂无检查结果";
  nodes.reviewChecks.innerHTML = checks.map((item) => (
    `<div class="check"><span>${escapeHtml(item.name)}</span><strong class="${item.passed ? "pass" : "warn"}">${item.passed ? "通过" : "待补强"}</strong></div>`
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
  if (mode === "model") return `智能分析 · ${model || "已连接模型"}`;
  if (mode === "runtime-fallback") return "基础模式 · 规则梳理";
  if (mode === "guardrail") return "合规保护 · 已拦截高风险请求";
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
  nodes.askButton.textContent = isLoading ? "整理中..." : "开始梳理";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
