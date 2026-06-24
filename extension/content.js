(async function mountPlainWriting() {
  if (window.top !== window) return; // one launcher per page, top frame only
  if (document.getElementById("plain-writing-extension-host")) return;

  const CAT = chrome.runtime.getURL("icons/launcher-256.png");
  const cat = `<img class="pw-cat" src="${CAT}" alt="" draggable="false">`;
  const caret = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg>`;
  const mac = /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent);
  const modKey = mac ? "⌘" : "Ctrl";

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
          <button class="pw-icon-btn pw-new" type="button" aria-label="New" title="New">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
          </button>
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
          <button class="pw-view" type="button" data-view="diff">Changes</button>
          <span class="pw-views-gap"></span>
          <button class="pw-copy" type="button" aria-label="Copy" title="Copy">
            <svg class="pw-copy-icon" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>
            <svg class="pw-check-icon" viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"></path></svg>
          </button>
        </div>

        <textarea class="pw-text" placeholder="Paste what you wrote."></textarea>
        <div class="pw-diff" hidden></div>
        <input class="pw-note" type="text" placeholder="Add a note to steer it, optional">
        <p class="pw-status" role="status" aria-live="polite"></p>

        <div class="pw-actionbar">
          <div class="pw-run">
            <button class="pw-run-go" type="button"><span class="pw-run-label">Rewrite</span></button>
            <button class="pw-run-menu" type="button" aria-label="Choose action" aria-haspopup="true">${caret}</button>
          </div>
          <div class="pw-menu" hidden role="menu">
            <button class="pw-menu-item is-active" type="button" role="menuitem" data-mode="rewrite">Rewrite clearly</button>
            <button class="pw-menu-item" type="button" role="menuitem" data-mode="shorten">Make it shorter</button>
            <button class="pw-menu-item" type="button" role="menuitem" data-mode="clean">Light cleanup</button>
          </div>
        </div>
      </div>

      <footer class="pw-footer">
        <span class="pw-hint"><kbd>${modKey}</kbd><kbd>⏎</kbd> to rewrite</span>
        <span class="pw-provider">No provider set</span>
      </footer>
    </section>
  `;
  shadow.appendChild(shell);

  const $ = (s) => shadow.querySelector(s);
  const launcher = $(".pw-launcher");
  const panel = $(".pw-panel");
  const textEl = $(".pw-text");
  const diffEl = $(".pw-diff");
  const noteEl = $(".pw-note");
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

  const saved = await chrome.storage.local.get(["provider", "openaiModel", "openrouterModel", "launcherPosition"]);
  showProvider(saved);
  autoGrow(textEl);
  restoreLauncher(saved.launcherPosition);

  launcher.addEventListener("click", () => { if (dragged) { dragged = false; return; } setOpen(!open); });
  $(".pw-close").addEventListener("click", () => setOpen(false));
  $(".pw-new").addEventListener("click", clearAll);
  $(".pw-settings").addEventListener("click", () => chrome.runtime.sendMessage({ type: "plain-writing:open-options" }));
  runGo.addEventListener("click", () => (busy ? cancel() : run()));
  runMenu.addEventListener("click", toggleMenu);
  menuItems.forEach((b) => b.addEventListener("click", () => selectMode(b.dataset.mode)));
  viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  copyBtn.addEventListener("click", copyResult);
  textEl.addEventListener("input", onInput);
  textEl.addEventListener("keydown", onEditorKeydown);
  noteEl.addEventListener("keydown", onEditorKeydown);
  shadow.addEventListener("click", (e) => { if (menuOpen && !e.target.closest(".pw-actionbar")) closeMenu(); });

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

  function clearAll() {
    if (busy) cancel();
    textEl.value = "";
    noteEl.value = "";
    plain = "";
    original = "";
    hasResult = false;
    view = "plain";
    views.hidden = true;
    diffEl.hidden = true;
    textEl.hidden = false;
    showStatus("", "");
    autoGrow(textEl);
    textEl.focus();
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

  function run() {
    if (view !== "plain") setView("plain");
    const text = textEl.value.trim();
    if (!text) { showStatus("Paste some text first.", "error"); textEl.focus(); return; }

    closeMenu();
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
        crossfade(textEl);
        revealViews();
        finishRun("Done. Edit if you like, then copy.", "success");
        saveHistory(original, plain);
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
    viewBtns.forEach((b) => (b.disabled = next));
    runGo.classList.toggle("is-busy", next);
    runLabel.textContent = next ? (phase === "refining" ? "Tightening" : "Rewriting") : MODE_LABEL[mode];
    if (next) showStatus("", "");
  }

  function revealViews() {
    const wasHidden = views.hidden;
    views.hidden = false;
    viewBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    if (wasHidden) views.animate(
      [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }],
      { duration: 220, easing: "cubic-bezier(0.16,1,0.3,1)" }
    );
  }

  function setView(next) {
    if (next === view) return;
    if (view === "plain") plain = textEl.value;
    view = next;
    viewBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    if (view === "diff") {
      renderDiff(original, plain);
      textEl.hidden = true;
      diffEl.hidden = false;
      crossfade(diffEl);
    } else {
      diffEl.hidden = true;
      textEl.hidden = false;
      textEl.value = plain;
      autoGrow(textEl);
      crossfade(textEl);
    }
  }

  function crossfade(el) {
    el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }

  async function copyResult() {
    const out = view === "plain" ? textEl.value : plain;
    if (!out) return;
    try {
      await navigator.clipboard.writeText(out);
      copyBtn.classList.add("is-copied");
      copyBtn.animate([{ transform: "scale(0.9)" }, { transform: "scale(1)" }], { duration: 180, easing: "ease-out" });
      showStatus("Copied to the clipboard.", "success");
      setTimeout(() => copyBtn.classList.remove("is-copied"), 1600);
    } catch {
      showStatus("Could not copy. Select the text and press Command C.", "error");
    }
  }

  function showStatus(message, state) { status.textContent = message; status.dataset.state = state || ""; }

  function showProvider(values) {
    const name = values.provider === "openai" ? "OpenAI" : "OpenRouter";
    const model = values.provider === "openai" ? values.openaiModel : values.openrouterModel;
    provider.textContent = model ? `${name} · ${model}` : name;
  }

  function onInput() {
    autoGrow(textEl);
    if (hasResult && view === "plain") plain = textEl.value;
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

  // Word-level diff between the original and the plain version.
  function renderDiff(a, b) {
    const parts = diffWords(a, b);
    if (!parts) {
      diffEl.innerHTML = `<span class="pw-diff-note">The text is long, so the change view is off. The Plain tab shows the result.</span>`;
      return;
    }
    diffEl.innerHTML = parts.map((seg) => {
      const t = escapeHtml(seg.v);
      if (/^\s+$/.test(seg.v) || seg.type === "same") return t;
      return seg.type === "del" ? `<del class="pw-del">${t}</del>` : `<ins class="pw-add">${t}</ins>`;
    }).join("");
  }

  function diffWords(a, b) {
    const A = a.split(/(\s+)/).filter((s) => s !== "");
    const B = b.split(/(\s+)/).filter((s) => s !== "");
    const n = A.length, m = B.length;
    if (n * m > 4000000) return null; // too large to diff comfortably
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push({ type: "same", v: A[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", v: A[i] }); i++; }
      else { out.push({ type: "add", v: B[j] }); j++; }
    }
    while (i < n) out.push({ type: "del", v: A[i++] });
    while (j < m) out.push({ type: "add", v: B[j++] });
    return out;
  }

  function escapeHtml(v) { return String(v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  async function saveHistory(o, p) {
    const { keepHistory, history = [] } = await chrome.storage.local.get(["keepHistory", "history"]);
    if (keepHistory === false) return;
    history.unshift({ o, p, at: Date.now() });
    if (history.length > 20) history.length = 20;
    chrome.storage.local.set({ history });
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
