const PROVIDER_INFO = {
  openrouter: {
    label: "OpenRouter",
    keyHelp: "Get a key at openrouter.ai/keys. One key reaches models from OpenAI, Anthropic, Google, Meta, and more.",
    defaultModel: "openai/gpt-4o-mini"
  },
  openai: {
    label: "OpenAI",
    keyHelp: "Get a key at platform.openai.com/api-keys. It is used only for OpenAI models.",
    defaultModel: "gpt-4o-mini"
  }
};

const form = document.querySelector("#settings-form");
const providerOptions = [...document.querySelectorAll(".provider-option")];
const apiKey = document.querySelector("#api-key");
const keyHelp = document.querySelector("#key-help");
const showKey = document.querySelector("#show-key");
const modelInput = document.querySelector("#model");
const modelList = document.querySelector("#model-list");
const loadModels = document.querySelector("#load-models");
const modelHelp = document.querySelector("#model-help");
const twoPass = document.querySelector("#two-pass");
const keepHistory = document.querySelector("#keep-history");
const historyList = document.querySelector("#history-list");
const clearHistory = document.querySelector("#clear-history");
const testButton = document.querySelector("#test");
const status = document.querySelector("#status");

// Held in memory so switching providers keeps each one's key and model.
const state = {
  provider: "openrouter",
  keys: { openai: "", openrouter: "" },
  models: { openai: PROVIDER_INFO.openai.defaultModel, openrouter: PROVIDER_INFO.openrouter.defaultModel },
  lists: { openai: null, openrouter: null }, // fetched model lists
  highlight: -1,
  filtered: []
};

init();

async function init() {
  const saved = await chrome.storage.local.get([
    "provider", "openaiKey", "openrouterKey", "openaiModel", "openrouterModel", "twoPass", "keepHistory"
  ]);
  state.provider = PROVIDER_INFO[saved.provider] ? saved.provider : "openrouter";
  state.keys.openai = saved.openaiKey || "";
  state.keys.openrouter = saved.openrouterKey || "";
  state.models.openai = saved.openaiModel || PROVIDER_INFO.openai.defaultModel;
  state.models.openrouter = saved.openrouterModel || PROVIDER_INFO.openrouter.defaultModel;
  twoPass.checked = saved.twoPass !== false;
  keepHistory.checked = saved.keepHistory !== false;
  applyProvider();
  renderHistory();
}

keepHistory.addEventListener("change", async () => {
  await chrome.storage.local.set({ keepHistory: keepHistory.checked });
  if (!keepHistory.checked) await chrome.storage.local.remove("history");
  renderHistory();
});

clearHistory.addEventListener("click", async () => {
  await chrome.storage.local.remove("history");
  renderHistory();
});

async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get(["history"]);
  const show = keepHistory.checked && history.length > 0;
  historyList.hidden = !show;
  clearHistory.hidden = !show;
  if (!show) { historyList.innerHTML = ""; return; }
  historyList.innerHTML = history.map((item, i) => `
    <div class="history-item">
      <p class="history-text">${escapeHtml(item.p)}</p>
      <button class="history-copy" type="button" data-i="${i}" aria-label="Copy">Copy</button>
    </div>`).join("");
  historyList.querySelectorAll(".history-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(history[Number(btn.dataset.i)].p);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });
  });
}

providerOptions.forEach((btn) => {
  btn.addEventListener("click", () => {
    stashCurrent();
    state.provider = btn.dataset.provider;
    closeList();
    applyProvider();
  });
});

showKey.addEventListener("click", () => {
  const show = apiKey.type === "password";
  apiKey.type = show ? "text" : "password";
  showKey.textContent = show ? "Hide" : "Show";
});

loadModels.addEventListener("click", fetchModels);

modelInput.addEventListener("input", () => {
  state.lists[state.provider] ? renderList(modelInput.value) : closeList();
});
modelInput.addEventListener("focus", () => {
  if (state.lists[state.provider]) renderList(modelInput.value);
});
modelInput.addEventListener("keydown", onComboKeydown);
modelInput.addEventListener("blur", () => setTimeout(closeList, 150));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  stashCurrent();
  setBusy(true);
  try {
    await save();
    showStatus("Settings saved.", "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

testButton.addEventListener("click", async () => {
  stashCurrent();
  setBusy(true);
  showStatus("Testing the connection.", "");
  try {
    await save();
    const response = await chrome.runtime.sendMessage({
      type: "plain-writing:test",
      settings: { provider: state.provider, key: state.keys[state.provider], model: state.models[state.provider] }
    });
    if (!response?.ok) throw new Error(response?.error || "The test failed.");
    showStatus(`Connected. Sample rewrite: ${response.text}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
});

function applyProvider() {
  providerOptions.forEach((btn) => {
    const on = btn.dataset.provider === state.provider;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", String(on));
  });
  const info = PROVIDER_INFO[state.provider];
  apiKey.value = state.keys[state.provider];
  keyHelp.textContent = info.keyHelp;
  modelInput.value = state.models[state.provider];
  modelHelp.textContent = state.lists[state.provider]
    ? `${state.lists[state.provider].length} models loaded. Type to search.`
    : "Type a model name, or load the list and search it.";
}

function stashCurrent() {
  state.keys[state.provider] = apiKey.value.trim();
  state.models[state.provider] = modelInput.value.trim();
}

async function save() {
  const model = state.models[state.provider];
  if (!model) throw new Error("Choose or type a model.");
  if (!state.keys[state.provider]) throw new Error(`Enter your ${PROVIDER_INFO[state.provider].label} API key.`);

  await chrome.storage.local.set({
    provider: state.provider,
    openaiKey: state.keys.openai,
    openrouterKey: state.keys.openrouter,
    openaiModel: state.models.openai || PROVIDER_INFO.openai.defaultModel,
    openrouterModel: state.models.openrouter || PROVIDER_INFO.openrouter.defaultModel,
    twoPass: twoPass.checked,
    keepHistory: keepHistory.checked
  });
}

async function fetchModels() {
  stashCurrent();
  loadModels.disabled = true;
  loadModels.textContent = "Loading";
  showStatus("", "");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "plain-writing:list-models",
      provider: state.provider,
      key: state.keys[state.provider]
    });
    if (!response?.ok) throw new Error(response?.error || "Could not load models.");
    state.lists[state.provider] = response.models;
    modelHelp.textContent = `${response.models.length} models loaded. Type to search.`;
    renderList(modelInput.value);
    modelInput.focus();
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    loadModels.disabled = false;
    loadModels.textContent = "Load models";
  }
}

function renderList(query) {
  const list = state.lists[state.provider];
  if (!list) return;
  const q = query.trim().toLowerCase();
  state.filtered = q
    ? list.filter((m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)).slice(0, 60)
    : list.slice(0, 60);
  state.highlight = -1;

  if (!state.filtered.length) {
    modelList.innerHTML = `<li class="combo-empty" aria-disabled="true">No match</li>`;
    openList();
    return;
  }

  modelList.innerHTML = state.filtered.map((m, i) => `
    <li role="option" data-id="${escapeAttr(m.id)}" data-index="${i}">
      <span class="combo-id">${escapeHtml(m.id)}</span>
      ${m.label && m.label !== m.id ? `<span class="combo-label">${escapeHtml(m.label)}</span>` : ""}
    </li>`).join("");

  modelList.querySelectorAll("li[role=option]").forEach((li) => {
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      choose(li.dataset.id);
    });
  });
  openList();
}

function onComboKeydown(event) {
  const options = modelList.querySelectorAll("li[role=option]");
  if (event.key === "ArrowDown" && state.lists[state.provider]) {
    event.preventDefault();
    if (modelList.hidden) renderList(modelInput.value);
    move(1, options);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1, options);
  } else if (event.key === "Enter" && !modelList.hidden && state.highlight >= 0) {
    event.preventDefault();
    choose(state.filtered[state.highlight].id);
  } else if (event.key === "Escape") {
    closeList();
  }
}

function move(step, options) {
  if (!options.length) return;
  state.highlight = (state.highlight + step + options.length) % options.length;
  options.forEach((li, i) => li.classList.toggle("is-active", i === state.highlight));
  options[state.highlight].scrollIntoView({ block: "nearest" });
}

function choose(id) {
  modelInput.value = id;
  state.models[state.provider] = id;
  closeList();
}

function openList() {
  modelList.hidden = false;
  modelInput.setAttribute("aria-expanded", "true");
}
function closeList() {
  modelList.hidden = true;
  modelInput.setAttribute("aria-expanded", "false");
  state.highlight = -1;
}

function setBusy(busy) {
  form.querySelectorAll("button").forEach((b) => (b.disabled = busy));
}

function showStatus(message, state) {
  status.textContent = message;
  status.dataset.state = state || "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
