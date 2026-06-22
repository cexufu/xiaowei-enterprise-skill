const nodes = {
  moduleSelect: document.querySelector("#moduleSelect"),
  region: document.querySelector("#region"),
  industry: document.querySelector("#industry"),
  stage: document.querySelector("#stage"),
  purpose: document.querySelector("#purpose"),
  messages: document.querySelector("#messages"),
  askForm: document.querySelector("#askForm"),
  questionInput: document.querySelector("#questionInput"),
  askButton: document.querySelector("#askButton"),
  healthHint: document.querySelector("#healthHint"),
  traceIntent: document.querySelector("#traceIntent"),
  traceMode: document.querySelector("#traceMode"),
  traceConfidence: document.querySelector("#traceConfidence"),
  traceGuardrail: document.querySelector("#traceGuardrail"),
  traceSensitive: document.querySelector("#traceSensitive"),
  traceProfile: document.querySelector("#traceProfile"),
  reviewScore: document.querySelector("#reviewScore"),
  reviewChecks: document.querySelector("#reviewChecks")
};

init();

async function init() {
  bindEvents();
  addMessage("system", "这是独立仓库里的 Skill 试用页。配置好 DeepSeek API key 后会走真实模型；未配置时使用规则兜底，仍可测试意图、护栏和输出结构。");
  await loadHealth();
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
    button.addEventListener("click", () => runSkill(button.dataset.prompt));
  });
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    if (data.hasApiKey) {
      nodes.healthHint.textContent = `当前已配置模型：${data.modelName}，接口：${data.modelBaseUrl}`;
    } else {
      nodes.healthHint.textContent = `当前未配置 DEEPSEEK_API_KEY。Render 上配置后会调用 ${data.modelName}；现在会先走规则兜底。`;
    }
  } catch {
    nodes.healthHint.textContent = "无法读取服务状态。";
  }
}

async function runSkill(question) {
  addMessage("user", question);
  setLoading(true);
  const loading = addMessage("assistant", "Skill 正在运行：识别意图、检查护栏、组织输出。");

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
      addMessage("assistant", data.detail || data.message || data.error || "Skill 运行失败。");
      return;
    }

    addMessage("assistant", data.reply);
    renderTrace(data);
  } catch (error) {
    loading.remove();
    addMessage("assistant", `Skill 运行失败：${error.message}`);
  } finally {
    setLoading(false);
  }
}

function getProfile() {
  return {
    region: nodes.region.value.trim(),
    industry: nodes.industry.value.trim(),
    stage: nodes.stage.value.trim(),
    purpose: nodes.purpose.value.trim()
  };
}

function renderTrace(data) {
  nodes.traceIntent.textContent = data.trace?.intentTitle || data.moduleTitle || "-";
  nodes.traceMode.textContent = modeLabel(data.mode, data.model);
  nodes.traceConfidence.textContent = data.trace?.confidence || "-";
  nodes.traceGuardrail.textContent = data.trace?.guardrail || "-";
  nodes.traceSensitive.textContent = data.trace?.sensitive || "-";
  nodes.traceProfile.textContent = data.trace?.profileCompleteness || "-";
  nodes.reviewScore.textContent = data.review?.score ?? "-";
  nodes.reviewChecks.innerHTML = (data.review?.checks || []).map((item) => (
    `<div class="check"><span>${escapeHtml(item.name)}</span><strong class="${item.passed ? "pass" : "fail"}">${item.passed ? "通过" : "未过"}</strong></div>`
  )).join("");
}

function modeLabel(mode, model) {
  if (mode === "model") return `真实模型 · ${model || "已配置"}`;
  if (mode === "runtime-fallback") return "规则兜底";
  if (mode === "guardrail") return "护栏拒答";
  return mode || "-";
}

function addMessage(role, text) {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  item.innerHTML = role === "assistant" ? formatMarkdown(text) : escapeHtml(text);
  nodes.messages.appendChild(item);
  nodes.messages.scrollTop = nodes.messages.scrollHeight;
  return item;
}

function formatMarkdown(text) {
  return escapeHtml(text)
    .replace(/^## (.*)$/gm, "<h3>$1</h3>")
    .replace(/^- (.*)$/gm, "• $1")
    .replace(/\n/g, "<br>");
}

function setLoading(isLoading) {
  nodes.askButton.disabled = isLoading;
  nodes.askButton.textContent = isLoading ? "运行中" : "运行 Skill";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
