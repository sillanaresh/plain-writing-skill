(async function mountPlainWriting() {
  if (window.top !== window) return; // one launcher per page, top frame only
  if (document.getElementById("plain-writing-extension-host")) return;

  const CAT = chrome.runtime.getURL("icons/launcher-256.png");
  const cat = `<img class="pw-cat" src="${CAT}" alt="" draggable="false">`;
  const caret = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg>`;

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
    <button class="pw-launcher" type="button" aria-label="Open Plain Writing" title="Plain Writing">${cat}</button>

    <section class="pw-panel" role="dialog" aria-label="Plain Writing" hidden>
      <header class="pw-header">
        <div class="pw-brand">
          <span class="pw-brand-mark">${cat}</span>
          <span class="pw-wordmark">Plain Writing</span>
        </div>
        <div class="pw-header-actions">
          <button class="pw-icon-btn pw-settings" type="button" aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8 2 2 0 1 1-2.8 2.8 1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0 1.6 1.6 0 0 0-2.6-1.1 2 2 0 1 1-2.8-2.8A1.6 1.6 0 0 0 4 13a2 2 0 0 1 0-4 1.6 1.6 0 0 0 1.5-2.6 2 2 0 1 1 2.8-2.8A1.6 1.6 0 0 0 11 4.6V4a2 2 0 0 1 4 0 1.6 1.6 0 0 0 2.7 1.1 2 2 0 1 1 2.8 2.8A1.6 1.6 0 0 0 20 11Z"></path></svg>
          </button>
          <button class="pw-icon-btn pw-close" type="button" aria-label="Close" title="Close">
            <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg>
          </button>
        </div>
      </header>

      <div class="pw-body">
        <div class="pw-views" hidden>
          <button class="pw-view is-active" type="button" data-view="plain">Plain</button>
          <button class="pw-view" type="button" data-view="original">Original</button>
          <span class="pw-views-gap"></span>
          <button class="pw-copy" type="button">
            <svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>
            <span>Copy</span>
          </button>
        </div>

        <textarea class="pw-text" placeholder="Paste what you wrote."></textarea>
        <input class="pw-note" type="text" hidden placeholder="Add a note, e.g. keep it casual">
        <p class="pw-status" role="status" aria-live="polite"></p>

        <div class="pw-actionbar">
          <button class="pw-note-toggle" type="button" aria-label="Add a note" title="Add a note">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>
          </button>
          <div class="pw-run">
            <button class="pw-run-go" type="button"><span class="pw-run-label">Rewrite</span></button>
            <button class="pw-run-menu" type="button" aria-label="Change action" aria-haspopup="true">${caret}</button>
          </div>
          <div class="pw-menu" hidden role="menu">
            <button class="pw-menu-item is-active" type="button" role="menuitem" data-mode="rewrite">Rewrite clearly</button>
            <button class="pw-menu-item" type="button" role="menuitem" data-mode="shorten">Make it shorter</button>
            <button class="pw-menu-item" type="button" role="menuitem" data-mode="clean">Light cleanup</button>
          </div>
        </div>
      </div>

      <footer class="pw-footer"><span class="pw-provider">No provider set</span></footer>
    </section>
  `;
  shadow.appendChild(shell);

  const $ = (s) => shadow.querySelector(s);
  const launcher = $(".pw-launcher");
  const panel = $(".pw-panel");
  const textEl = $(".pw-text");
  const noteEl = $(".pw-note");
  const noteToggle = $(".pw-note-toggle");
  const status = $(".pw-status");
  const runGo = $(".pw-run-go");
  const runLabel = $(".pw-run-label");
  const runMenu = $(".pw-run-menu");
  const menu = $(".pw-menu");
  const menuItems = [...shadow.querySelectorAll(".pw-menu-item")];
  const views = $(".pw-views");
  const viewBtns = [...shadow.querySelectorAll(".pw-view")];
  const copyBtn = $(".pw-copy");
  const provider = $(".pw-provider");

  const MODE_LABEL = { rewrite: "Rewrite", shorten: "Shorten", clean: "Clean up" };

  let open = false;
  let busy = false;
  let dragged = false;
  let menuOpen = false;
  let mode = "rewrite";
  let view = "plain";
  let hasResult = false;
  let original = "";
  let plain = "";
  let activePort = null;

  const saved = await chrome.storage.local.get([
    "provider", "openaiModel", "openrouterModel", "rememberDraft", "draft", "launcherPosition"
  ]);
  showProvider(saved);
  if (saved.rememberDraft && saved.draft) textEl.value = saved.draft;
  autoGrow(textEl);
  restoreLauncher(saved.launcherPosition);

  launcher.addEventListener("click", () => { if (dragged) { dragged = false; return; } setOpen(!open); });
  $(".pw-close").addEventListener("click", () => setOpen(false));
  $(".pw-settings").addEventListener("click", () => chrome.runtime.sendMessage({ type: "plain-writing:open-options" }));
  runGo.addEventListener("click", () => (busy ? cancel() : run()));
  runMenu.addEventListener("click", toggleMenu);
  menuItems.forEach((b) => b.addEventListener("click", () => selectMode(b.dataset.mode)));
  viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  copyBtn.addEventListener("click", copyResult);
  noteToggle.addEventListener("click", toggleNote);
  textEl.addEventListener("input", onInput);
  textEl.addEventListener("keydown", onEditorKeydown);
  noteEl.addEventListener("keydown", onEditorKeydown);
  shadow.addEventListener("click", (e) => { if (menuOpen && !e.target.closest(".pw-run")) closeMenu(); });

  chrome.runtime.onMessage.addListener((m) => { if (m?.type === "plain-writing:toggle") setOpen(!open); });
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
    if (open) setTimeout(() => textEl.focus(), 40);
    else closeMenu();
  }

  function selectMode(next) {
    mode = next;
    runLabel.textContent = MODE_LABEL[mode];
    menuItems.forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
    closeMenu();
  }

  function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }
  function openMenu() { menu.hidden = false; menuOpen = true; runMenu.setAttribute("aria-expanded", "true"); }
  function closeMenu() { menu.hidden = true; menuOpen = false; runMenu.setAttribute("aria-expanded", "false"); }

  function toggleNote() {
    const show = noteEl.hidden;
    noteEl.hidden = !show;
    noteToggle.classList.toggle("is-on", show || !!noteEl.value.trim());
    if (show) noteEl.focus();
  }

  function run() {
    const text = textEl.value.trim();
    if (!text) { showStatus("Paste some text first.", "error"); textEl.focus(); return; }

    original = textEl.value;
    setBusy(true, "rewriting");
    let streamed = "";
    let cleared = false;

    activePort = chrome.runtime.connect({ name: "pw-rewrite" });
    activePort.onMessage.addListener((m) => {
      if (m.type === "phase") {
        runLabel.textContent = m.phase === "refining" ? "Tightening" : "Rewriting";
      } else if (m.type === "delta") {
        if (!cleared) { textEl.value = ""; cleared = true; }
        streamed += m.text;
        textEl.value = streamed;
        autoGrow(textEl);
      } else if (m.type === "done") {
        plain = m.text;
        original = original || text;
        hasResult = true;
        view = "plain";
        textEl.value = plain;
        autoGrow(textEl);
        showViews();
        finishRun("Done. Edit if you like, then copy.", "success");
        textEl.focus();
      } else if (m.type === "error") {
        if (cleared) textEl.value = original;
        finishRun(m.error, "error");
      }
    });
    activePort.onDisconnect.addListener(() => { if (busy) { if (cleared) textEl.value = original; finishRun("The rewrite stopped.", "error"); } });
    activePort.postMessage({ type: "start", text, mode, instruction: noteEl.value });
  }

  function cancel() {
    if (activePort) activePort.disconnect();
    activePort = null;
    textEl.value = original || textEl.value;
    autoGrow(textEl);
    setBusy(false);
    showStatus("Stopped.", "");
  }

  function finishRun(message, state) {
    if (activePort) { activePort.disconnect(); activePort = null; }
    setBusy(false);
    showStatus(message, state);
  }

  function setBusy(next, phase) {
    busy = next;
    textEl.readOnly = next;
    runMenu.disabled = next;
    noteToggle.disabled = next;
    viewBtns.forEach((b) => (b.disabled = next));
    runGo.classList.toggle("is-busy", next);
    runLabel.textContent = next ? (phase === "refining" ? "Tightening" : "Rewriting") : MODE_LABEL[mode];
    if (next) showStatus("", "");
  }

  function showViews() {
    views.hidden = false;
    viewBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  }

  function setView(next) {
    if (next === view) return;
    if (view === "plain") plain = textEl.value; else original = textEl.value;
    view = next;
    textEl.value = view === "plain" ? plain : original;
    autoGrow(textEl);
    viewBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
  }

  async function copyResult() {
    if (!textEl.value) return;
    try {
      await navigator.clipboard.writeText(textEl.value);
      const span = copyBtn.querySelector("span");
      span.textContent = "Copied";
      showStatus("Copied to the clipboard.", "success");
      setTimeout(() => (span.textContent = "Copy"), 1500);
    } catch {
      textEl.focus(); textEl.select();
      showStatus("Press Command C to copy.", "error");
    }
  }

  function showStatus(message, state) { status.textContent = message; status.dataset.state = state || ""; }

  function showProvider(values) {
    const name = values.provider === "openai" ? "OpenAI" : "OpenRouter";
    const model = values.provider === "openai" ? values.openaiModel : values.openrouterModel;
    provider.textContent = model ? `${name} · ${model}` : name;
  }

  async function onInput() {
    autoGrow(textEl);
    if (hasResult) { if (view === "plain") plain = textEl.value; else original = textEl.value; }
    const { rememberDraft } = await chrome.storage.local.get(["rememberDraft"]);
    if (rememberDraft && !hasResult) chrome.storage.local.set({ draft: textEl.value });
  }

  function onEditorKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!busy) run(); }
    if (e.key === "Escape") {
      if (menuOpen) { closeMenu(); return; }
      setOpen(false); launcher.focus();
    }
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 340)}px`;
  }

  function restoreLauncher(position) {
    if (!position || !Number.isFinite(position.top) || !position.side) { shell.dataset.side = "right"; return; }
    launcher.style.top = `${clampTop(position.top)}px`;
    launcher.style.bottom = "auto";
    launcher.style[position.side] = "18px";
    launcher.style[position.side === "right" ? "left" : "right"] = "auto";
    shell.dataset.side = position.side;
  }
  function clampTop(v) { return Math.max(12, Math.min(window.innerHeight - 64, v)); }

  function makeDraggable() {
    let sx = 0, sy = 0, st = 0, pid = null;
    launcher.addEventListener("pointerdown", (e) => { pid = e.pointerId; sx = e.clientX; sy = e.clientY; st = launcher.getBoundingClientRect().top; launcher.setPointerCapture(pid); });
    launcher.addEventListener("pointermove", (e) => {
      if (pid !== e.pointerId) return;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return;
      dragged = true;
      launcher.style.top = `${clampTop(st + e.clientY - sy)}px`;
      launcher.style.bottom = "auto";
    });
    launcher.addEventListener("pointerup", (e) => {
      if (pid !== e.pointerId) return;
      launcher.releasePointerCapture(pid); pid = null;
      if (!dragged) return;
      const rect = launcher.getBoundingClientRect();
      const side = e.clientX < window.innerWidth / 2 ? "left" : "right";
      launcher.style[side] = "18px";
      launcher.style[side === "right" ? "left" : "right"] = "auto";
      shell.dataset.side = side;
      chrome.storage.local.set({ launcherPosition: { top: rect.top, side } });
    });
  }
})();
