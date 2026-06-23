(async function mountPlainWriting() {
  if (window.top !== window) return; // Skip iframes; one launcher per page.
  if (document.getElementById("plain-writing-extension-host")) return;

  const CAT = chrome.runtime.getURL("icons/launcher-256.png");
  const catImg = `<img class="pw-cat" src="${CAT}" alt="" draggable="false">`;

  const host = document.createElement("div");
  host.id = "plain-writing-extension-host";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = await fetch(chrome.runtime.getURL("content.css")).then((r) => r.text());
  shadow.appendChild(style);

  const shell = document.createElement("div");
  shell.className = "pw-shell";
  shell.innerHTML = `
    <button class="pw-launcher" type="button" aria-label="Open Plain Writing" title="Plain Writing">
      ${catImg}
    </button>

    <section class="pw-panel" aria-label="Plain Writing" role="dialog" hidden>
      <header class="pw-header">
        <div class="pw-brand">
          <span class="pw-brand-mark">${catImg}</span>
          <h2>Plain Writing</h2>
        </div>
        <div class="pw-header-actions">
          <button class="pw-icon-btn pw-settings" type="button" aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 13a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 5.6 7L5.5 7a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"></path></svg>
          </button>
          <button class="pw-icon-btn pw-close" type="button" aria-label="Close" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"></path></svg>
          </button>
        </div>
      </header>

      <div class="pw-body">
        <label class="pw-label" for="pw-input">Your text</label>
        <textarea id="pw-input" class="pw-textarea" rows="6" placeholder="Paste what you wrote here, then rewrite it."></textarea>
        <div class="pw-count" aria-live="polite">0 words</div>

        <div class="pw-controls">
          <div class="pw-segmented" role="tablist" aria-label="Action">
            <button class="pw-seg is-active" type="button" data-mode="rewrite" role="tab" aria-selected="true">Rewrite</button>
            <button class="pw-seg" type="button" data-mode="shorten" role="tab" aria-selected="false">Shorten</button>
            <button class="pw-seg" type="button" data-mode="clean" role="tab" aria-selected="false">Clean up</button>
          </div>
          <input class="pw-instruction" id="pw-instruction" type="text" placeholder="Optional: an extra request, e.g. keep it casual">
        </div>

        <button class="pw-primary" type="button">
          <span class="pw-primary-label">Rewrite</span>
        </button>
        <p class="pw-status" role="status" aria-live="polite"></p>

        <div class="pw-result" hidden>
          <div class="pw-result-head">
            <span>Plain version</span>
            <button class="pw-copy" type="button">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>
              <span>Copy</span>
            </button>
          </div>
          <textarea class="pw-output" rows="6" aria-label="Plain version"></textarea>
        </div>
      </div>

      <footer class="pw-footer">
        <span class="pw-provider">No provider set</span>
        <span class="pw-privacy">Text is sent only when you rewrite.</span>
      </footer>
    </section>
  `;
  shadow.appendChild(shell);

  const $ = (sel) => shadow.querySelector(sel);
  const launcher = $(".pw-launcher");
  const panel = $(".pw-panel");
  const input = $("#pw-input");
  const instruction = $("#pw-instruction");
  const segButtons = [...shadow.querySelectorAll(".pw-seg")];
  const primary = $(".pw-primary");
  const primaryLabel = $(".pw-primary-label");
  const status = $(".pw-status");
  const result = $(".pw-result");
  const output = $(".pw-output");
  const copyBtn = $(".pw-copy");
  const count = $(".pw-count");
  const provider = $(".pw-provider");

  let open = false;
  let busy = false;
  let dragged = false;
  let mode = "rewrite";
  let activePort = null;

  const saved = await chrome.storage.local.get([
    "provider", "openaiModel", "openrouterModel", "rememberDraft", "draft", "launcherPosition"
  ]);
  showProvider(saved);
  if (saved.rememberDraft && saved.draft) {
    input.value = saved.draft;
  }
  updateCount();
  autoGrow(input);
  restoreLauncher(saved.launcherPosition);

  launcher.addEventListener("click", () => {
    if (dragged) { dragged = false; return; }
    setOpen(!open);
  });
  $(".pw-close").addEventListener("click", () => setOpen(false));
  $(".pw-settings").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "plain-writing:open-options" });
  });
  primary.addEventListener("click", () => (busy ? cancel() : rewrite()));
  copyBtn.addEventListener("click", copyResult);
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onEditorKeydown);
  instruction.addEventListener("keydown", onEditorKeydown);
  segButtons.forEach((btn) => btn.addEventListener("click", () => selectMode(btn)));

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "plain-writing:toggle") setOpen(!open);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.provider || changes.openaiModel || changes.openrouterModel) {
      chrome.storage.local.get(["provider", "openaiModel", "openrouterModel"]).then(showProvider);
    }
  });

  makeDraggable();

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    shell.classList.toggle("is-open", open);
    if (open) setTimeout(() => input.focus(), 40);
  }

  function selectMode(btn) {
    mode = btn.dataset.mode;
    segButtons.forEach((b) => {
      const on = b === btn;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    primaryLabel.textContent = mode === "shorten" ? "Shorten" : mode === "clean" ? "Clean up" : "Rewrite";
  }

  function rewrite() {
    const text = input.value.trim();
    if (!text) {
      showStatus("Paste some text first.", "error");
      input.focus();
      return;
    }

    setBusy(true);
    showStatus("", "");
    result.hidden = false;
    output.value = "";

    autoGrow(output);
    let streamed = "";
    activePort = chrome.runtime.connect({ name: "pw-rewrite" });
    activePort.onMessage.addListener((message) => {
      if (message.type === "delta") {
        streamed += message.text;
        output.value = streamed;
        autoGrow(output);
      } else if (message.type === "done") {
        output.value = message.text;
        autoGrow(output);
        finishStream("Done. Edit if you like, then copy.", "success");
      } else if (message.type === "error") {
        if (!streamed) result.hidden = true;
        finishStream(message.error, "error");
      }
    });
    activePort.onDisconnect.addListener(() => {
      if (busy) finishStream("The rewrite stopped.", "error");
    });
    activePort.postMessage({ type: "start", text, mode, instruction: instruction.value });
  }

  function cancel() {
    if (activePort) activePort.disconnect();
    activePort = null;
    setBusy(false);
    showStatus("Stopped.", "");
  }

  function finishStream(message, state) {
    if (activePort) { activePort.disconnect(); activePort = null; }
    setBusy(false);
    showStatus(message, state);
    if (state === "success") {
      autoGrow(output);
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      output.focus();
      output.select();
    }
  }

  // Resize a textarea to fit its content, up to a cap, then scroll inside.
  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`;
  }

  async function copyResult() {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      flashCopy("Copied");
      showStatus("Copied to the clipboard.", "success");
    } catch {
      output.focus();
      output.select();
      showStatus("Press Command C to copy.", "error");
    }
  }

  function flashCopy(label) {
    const span = copyBtn.querySelector("span");
    span.textContent = label;
    setTimeout(() => (span.textContent = "Copy"), 1500);
  }

  function setBusy(next) {
    busy = next;
    input.disabled = next;
    instruction.disabled = next;
    segButtons.forEach((b) => (b.disabled = next));
    primary.classList.toggle("is-busy", next);
    primaryLabel.textContent = next
      ? "Stop"
      : mode === "shorten" ? "Shorten" : mode === "clean" ? "Clean up" : "Rewrite";
  }

  function showStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state || "";
  }

  function showProvider(values) {
    const name = values.provider === "openai" ? "OpenAI" : "OpenRouter";
    const model = values.provider === "openai" ? values.openaiModel : values.openrouterModel;
    provider.textContent = model ? `${name} · ${model}` : name;
  }

  function updateCount() {
    const text = input.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = input.value.length;
    count.textContent = `${words.toLocaleString()} ${words === 1 ? "word" : "words"} · ${chars.toLocaleString()} ${chars === 1 ? "character" : "characters"}`;
  }

  async function onInput() {
    updateCount();
    autoGrow(input);
    const { rememberDraft } = await chrome.storage.local.get(["rememberDraft"]);
    if (rememberDraft) chrome.storage.local.set({ draft: input.value });
  }

  function onEditorKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!busy) rewrite();
    }
    if (event.key === "Escape") {
      setOpen(false);
      launcher.focus();
    }
  }

  function restoreLauncher(position) {
    if (!position || !Number.isFinite(position.top) || !position.side) {
      shell.dataset.side = "right";
      return;
    }
    launcher.style.top = `${clampTop(position.top)}px`;
    launcher.style.bottom = "auto";
    launcher.style[position.side] = "18px";
    launcher.style[position.side === "right" ? "left" : "right"] = "auto";
    shell.dataset.side = position.side;
  }

  function clampTop(value) {
    return Math.max(12, Math.min(window.innerHeight - 64, value));
  }

  function makeDraggable() {
    let startX = 0, startY = 0, startTop = 0, pointerId = null;

    launcher.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startTop = launcher.getBoundingClientRect().top;
      launcher.setPointerCapture(pointerId);
    });

    launcher.addEventListener("pointermove", (event) => {
      if (pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < 5) return;
      dragged = true;
      launcher.style.top = `${clampTop(startTop + event.clientY - startY)}px`;
      launcher.style.bottom = "auto";
    });

    launcher.addEventListener("pointerup", (event) => {
      if (pointerId !== event.pointerId) return;
      launcher.releasePointerCapture(pointerId);
      pointerId = null;
      if (!dragged) return;
      const rect = launcher.getBoundingClientRect();
      const side = event.clientX < window.innerWidth / 2 ? "left" : "right";
      launcher.style[side] = "18px";
      launcher.style[side === "right" ? "left" : "right"] = "auto";
      shell.dataset.side = side;
      chrome.storage.local.set({ launcherPosition: { top: rect.top, side } });
    });
  }
})();
