importScripts("plain-writing-prompt.js");

const DEFAULTS = {
  provider: "openrouter",
  openaiKey: "",
  openrouterKey: "",
  openaiModel: "gpt-4o-mini",
  openrouterModel: "openai/gpt-4o-mini",
  twoPass: true,
  rememberDraft: true
};

const PROVIDERS = {
  openai: {
    chat: "https://api.openai.com/v1/chat/completions",
    models: "https://api.openai.com/v1/models",
    keyField: "openaiKey",
    modelField: "openaiModel"
  },
  openrouter: {
    chat: "https://openrouter.ai/api/v1/chat/completions",
    models: "https://openrouter.ai/api/v1/models",
    keyField: "openrouterKey",
    modelField: "openrouterModel"
  }
};

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  if (reason === "install") chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener((tab) => toggleOnTab(tab?.id));

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-panel") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggleOnTab(tab?.id);
});

async function toggleOnTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "plain-writing:toggle" });
  } catch {
    // Browser internal pages block content scripts. Nothing to toggle there.
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "plain-writing:open-options") {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (message?.type === "plain-writing:list-models") {
    listModels(message.provider, message.key).then(sendResponse);
    return true;
  }
  if (message?.type === "plain-writing:test") {
    testConnection(message.settings).then(sendResponse);
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "pw-rewrite") return;
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());
  port.onMessage.addListener((message) => {
    if (message?.type !== "start") return;
    runPasses(message, port, controller.signal).catch((error) => {
      safePost(port, { type: "error", error: readableError(error) });
    });
  });
});

function safePost(port, payload) {
  try {
    port.postMessage(payload);
  } catch {
    // The page navigated or closed and the port is gone. Drop the message.
  }
}

async function resolveConfig() {
  const settings = { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
  const provider = PROVIDERS[settings.provider] ? settings.provider : "openrouter";
  const meta = PROVIDERS[provider];
  return {
    provider,
    endpoint: meta.chat,
    apiKey: settings[meta.keyField]?.trim() || "",
    model: settings[meta.modelField]?.trim() || DEFAULTS[meta.modelField],
    twoPass: settings.twoPass !== false
  };
}

function firstPassMessages({ text, mode = "rewrite", instruction = "" }) {
  const task = [
    MODE_PROMPTS[mode] || MODE_PROMPTS.rewrite,
    instruction.trim() ? `Extra request from the writer: ${instruction.trim()}` : "",
    "",
    "Text to revise:",
    text
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: PLAIN_WRITING_PROMPT },
    { role: "user", content: task }
  ];
}

function secondPassMessages(draft) {
  return [
    { role: "system", content: PLAIN_WRITING_PROMPT },
    { role: "user", content: `${REFINE_LEAD}\n${draft}` }
  ];
}

function requestHeaders(config) {
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json"
  };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/plain-writing";
    headers["X-Title"] = "Plain Writing";
  }
  return headers;
}

// The two-pass flow. Pass one applies the rules. Pass two re-reads the draft and
// cuts what does not earn its place. Pass one is not streamed, so the reader sees
// one clean stream of the final text in pass two.
async function runPasses(payload, port, signal) {
  const text = String(payload.text || "").trim();
  if (!text) {
    safePost(port, { type: "error", error: "Paste some text first." });
    return;
  }

  const config = await resolveConfig();
  if (!config.apiKey) {
    safePost(port, { type: "error", error: "Add your API key in settings first." });
    return;
  }

  if (!config.twoPass) {
    safePost(port, { type: "phase", phase: "rewriting" });
    const full = await streamCompletion(config, firstPassMessages({ ...payload, text }), port, signal);
    finish(port, full);
    return;
  }

  safePost(port, { type: "phase", phase: "rewriting" });
  const draft = await completeOnce(config, firstPassMessages({ ...payload, text }), signal);
  if (!draft.trim()) throw new Error("The model returned no text. Try another model.");

  safePost(port, { type: "phase", phase: "refining" });
  const full = await streamCompletion(config, secondPassMessages(draft.trim()), port, signal);
  finish(port, full);
}

function finish(port, full) {
  if (!full.trim()) throw new Error("The model returned no text. Try another model.");
  safePost(port, { type: "done", text: full.trim() });
}

async function completeOnce(config, messages, signal) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    signal,
    headers: requestHeaders(config),
    body: JSON.stringify({ model: config.model, messages, stream: false })
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function streamCompletion(config, messages, port, signal) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    signal,
    headers: requestHeaders(config),
    body: JSON.stringify({ model: config.model, messages, stream: true })
  });
  if (!response.ok) throw new Error(await errorMessage(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        safePost(port, { type: "delta", text: delta });
      }
      if (parsed.error?.message) throw new Error(parsed.error.message);
    }
  }
  return full;
}

async function testConnection(formSettings) {
  try {
    const provider = PROVIDERS[formSettings?.provider] ? formSettings.provider : "openrouter";
    const meta = PROVIDERS[provider];
    const config = {
      provider,
      endpoint: meta.chat,
      apiKey: String(formSettings?.key || "").trim(),
      model: String(formSettings?.model || DEFAULTS[meta.modelField]).trim()
    };
    if (!config.apiKey) return { ok: false, error: "Enter an API key first." };
    const output = await completeOnce(
      config,
      firstPassMessages({ text: "It is worth noting that this is really very clear." }),
      undefined
    );
    if (!output.trim()) return { ok: false, error: "The model returned no text. Try another model." };
    return { ok: true, text: output.trim() };
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}

async function listModels(providerName, key) {
  try {
    const provider = PROVIDERS[providerName] ? providerName : "openrouter";
    const meta = PROVIDERS[provider];
    const headers = {};
    const trimmedKey = String(key || "").trim();
    if (trimmedKey) headers.Authorization = `Bearer ${trimmedKey}`;
    if (provider === "openai" && !trimmedKey) {
      return { ok: false, error: "Enter your OpenAI key to load its model list." };
    }
    const response = await fetch(meta.models, { headers });
    if (!response.ok) return { ok: false, error: await errorMessage(response) };
    const data = await response.json();
    const raw = Array.isArray(data.data) ? data.data : [];
    let models = raw.map((item) => ({ id: item.id, label: item.name || item.id }));
    if (provider === "openai") {
      models = models
        .filter((m) => /^(gpt|o\d|chatgpt)/i.test(m.id))
        .filter((m) => !/(embedding|whisper|tts|audio|image|realtime|moderation|dall-e|transcribe|search)/i.test(m.id));
    }
    models.sort((a, b) => a.id.localeCompare(b.id));
    if (!models.length) return { ok: false, error: "No models were returned." };
    return { ok: true, models };
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}

async function errorMessage(response) {
  const data = await response.json().catch(() => ({}));
  const message = data.error?.message || data.message;
  if (message) return message;
  if (response.status === 401) return "The API key was rejected. Check the key in settings.";
  if (response.status === 402) return "The provider reports no credit on this key.";
  if (response.status === 404) return "The model was not found. Pick another model in settings.";
  if (response.status === 429) return "The provider is rate limiting this key. Wait and try again.";
  return `Request failed with status ${response.status}.`;
}

function readableError(error) {
  if (error?.name === "AbortError") return "The rewrite was cancelled.";
  if (error instanceof TypeError) return "Could not reach the provider. Check your internet connection.";
  return error?.message || "Something went wrong.";
}
