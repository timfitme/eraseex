(() => {
    const domain = location.hostname;

    function getRules(cb) {
      chrome.storage.local.get(["hiddenRules"], (data) => {
        const all = data.hiddenRules || {};
        cb(all[domain] || [], all["__global__"] || []);
      });
    }

    const _hiddenEls = new Set();
    let _showingAll = false;

    function hideEl(el) {
      if (_hiddenEls.has(el)) return;
      el.style.setProperty("display", "none", "important");
      _hiddenEls.add(el);
    }

    function applySelector(selector) {
      if (selector.startsWith("__regex__")) { applyRegexRule(selector.slice(9)); return; }
      try { document.querySelectorAll(selector).forEach(hideEl); } catch (_) {}
    }

    function applyRegexRule(pattern) {
      if (!document.body) return;
      try {
        const regex = new RegExp(pattern, "i");
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode: n => regex.test((n.textContent || "").trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        });
        const toHide = new Set();
        let node;
        while ((node = walker.nextNode())) {
          let p = node.parentElement;
          while (p && p !== document.body) {
            if (p.offsetHeight > 20 && p.offsetWidth > 80) { toHide.add(p); break; }
            p = p.parentElement;
          }
        }
        toHide.forEach(hideEl);
      } catch (_) {}
    }

    function applyAllRules() {
      getRules((domainRules, globalRules) => {
        domainRules.forEach(applySelector);
        globalRules.forEach(applySelector);
      });
    }

    // ── Cleaners ────────────────────────────────────────────────────────────
    function applyCleaners() {
      chrome.runtime.sendMessage({ type: "GET_CLEANERS_FOR_TAB", domain }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        (res.selectors || []).forEach(applySelector);
      });
    }

    let debTimer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(debTimer);
      debTimer = setTimeout(() => { applyAllRules(); applyCleaners(); }, 250);
    });

    function init() {
      applyAllRules();
      applyCleaners();
      const root = document.documentElement || document.body;
      if (root) observer.observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else { init(); }

    // ── Selector generation ─────────────────────────────────────────────────
    function isStableClass(c) {
      if (c.length <= 1 || /^\d/.test(c)) return false;
      if (/__[A-Za-z0-9]{4,}$/.test(c)) return false;
      if (/--[A-Za-z0-9]{6,}$/.test(c)) return false;
      if (/^[A-Za-z0-9]{8,}$/.test(c) && /[0-9]/.test(c) && /[A-Z]/.test(c)) return false;
      return true;
    }
    function stableAttr(el) {
      for (const attr of ["data-testid","data-cy","data-qa","data-id","name"]) {
        const v = el.getAttribute(attr);
        if (v) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(v)}"]`;
      }
      const aria = el.getAttribute("aria-label");
      if (aria && aria.length < 60) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
      return null;
    }
    function getSelector(el) {
      if (el.id && !/^\d/.test(el.id)) return `#${CSS.escape(el.id)}`;
      const a = stableAttr(el);
      if (a) return a;
      const path = [];
      let cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        if (cur.id && !/^\d/.test(cur.id)) { path.unshift(`#${CSS.escape(cur.id)}`); break; }
        const as = stableAttr(cur);
        if (as) { path.unshift(as); break; }
        let seg = cur.tagName.toLowerCase();
        const classes = Array.from(cur.classList).filter(isStableClass).slice(0,2).map(c => `.${CSS.escape(c)}`).join("");
        if (classes) { seg += classes; } else {
          const par = cur.parentElement;
          if (par) { const sibs = Array.from(par.children).filter(s => s.tagName === cur.tagName); if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(cur)+1})`; }
        }
        path.unshift(seg);
        cur = cur.parentElement;
      }
      return path.join(" > ");
    }

    // ── Pick mode ───────────────────────────────────────────────────────────
    let pickMode = false;
    let hoveredEl = null;
    let overlay = null;
    let hlBox = null;
    const MINE = new Set(["__eh_overlay__","__eh_hl__","__eh_toast__","__eh_counter__"]);
    const selected = new Map();
    const selectedBoxes = new Map();

    function enterPickMode() {
      if (pickMode) return;
      if (!document.body) { document.addEventListener("DOMContentLoaded", enterPickMode, { once: true }); return; }
      pickMode = true;
      selected.clear();
      selectedBoxes.forEach(b => b.remove());
      selectedBoxes.clear();
      document.body.style.cursor = "crosshair";
      overlay = document.createElement("div");
      overlay.id = "__eh_overlay__";
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;cursor:crosshair;";
      document.body.appendChild(overlay);
      hlBox = document.createElement("div");
      hlBox.id = "__eh_hl__";
      hlBox.style.cssText = "position:fixed;border:2px solid #3b82f6;background:rgba(59,130,246,.07);pointer-events:none;z-index:2147483645;border-radius:3px;display:none;box-sizing:border-box;";
      document.body.appendChild(hlBox);
      document.addEventListener("mouseover", onOver, true);
      document.addEventListener("mouseout",  onOut,  true);
      document.addEventListener("click",     onPick, true);
      document.addEventListener("keydown",   onKey,  true);
      showToast("Click elements to select • Enter or button to hide • Esc to cancel");
      updateCounter();
    }

    function exitPickMode() {
      if (!pickMode) return;
      pickMode = false;
      document.body.style.cursor = "";
      overlay?.remove();  overlay = null;
      hlBox?.remove();    hlBox = null;
      document.getElementById("__eh_counter__")?.remove();
      selectedBoxes.forEach(b => b.remove());
      selectedBoxes.clear();
      selected.clear();
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout",  onOut,  true);
      document.removeEventListener("click",     onPick, true);
      document.removeEventListener("keydown",   onKey,  true);
    }

    function onOver(e) {
      if (!pickMode || MINE.has(e.target.id)) return;
      hoveredEl = e.target;
      const r = e.target.getBoundingClientRect();
      const alreadySelected = selected.has(getSelector(e.target));
      Object.assign(hlBox.style, {
        display:"block",
        top:r.top+"px",left:r.left+"px",width:r.width+"px",height:r.height+"px",
        borderColor: alreadySelected ? "#ef4444" : "#3b82f6",
        background:  alreadySelected ? "rgba(239,68,68,.07)" : "rgba(59,130,246,.07)",
      });
    }
    function onOut() { hoveredEl = null; if (hlBox) hlBox.style.display = "none"; }

    function onPick(e) {
      if (!pickMode) return;
      const target = e.target;
      if (MINE.has(target.id) || MINE.has(target.closest?.("[id]")?.id)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = hoveredEl || target;
      if (!el) return;
      const selector = getSelector(el);
      if (selected.has(selector)) {
        selected.delete(selector);
        selectedBoxes.get(selector)?.remove();
        selectedBoxes.delete(selector);
      } else {
        selected.set(selector, el);
        const r = el.getBoundingClientRect();
        const box = document.createElement("div");
        box.style.cssText = `position:fixed;border:2px solid #22c55e;background:rgba(34,197,94,.08);pointer-events:none;z-index:2147483644;border-radius:3px;box-sizing:border-box;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;`;
        document.body.appendChild(box);
        selectedBoxes.set(selector, box);
      }
      const n = selected.size;
      showToast(n === 0 ? "Click elements to select • Enter or button to hide • Esc to cancel"
                        : `Selected ${n} element${n > 1 ? "s" : ""} • Enter or button to hide • Esc to cancel`);
      updateCounter();
    }

    function saveAll() {
      if (selected.size === 0) { exitPickMode(); return; }
      const selectors = Array.from(selected.keys());
      const elements  = Array.from(selected.values());
      exitPickMode();
      let saved = 0, failed = false;
      const next = (i) => {
        if (i >= selectors.length) {
          if (saved > 0) {
            elements.forEach(hideEl);
            showToastWithUndo(`Hidden ${saved} element${saved > 1 ? "s" : ""}`, domain, selectors.slice(0, saved), elements.slice(0, saved));
          }
          return;
        }
        chrome.runtime.sendMessage({ type: "ADD_RULE", domain, selector: selectors[i] }, (res) => {
          if (chrome.runtime.lastError) { next(i + 1); return; }
          if (res?.success) { saved++; }
          else if (res?.reason === "limit_reached" && !failed) {
            failed = true;
            showToast("Free limit reached (30) — open the extension to upgrade", true);
          }
          next(i + 1);
        });
      };
      next(0);
    }

    function onKey(e) {
      if (e.key === "Escape") exitPickMode();
      if (e.key === "Enter")  saveAll();
    }

    function updateCounter() {
      let counter = document.getElementById("__eh_counter__");
      if (!counter) {
        counter = document.createElement("button");
        counter.id = "__eh_counter__";
        counter.style.cssText = "position:fixed;top:14px;right:14px;background:#1a1a1a;color:#fff;border:none;padding:6px 13px;border-radius:6px;font:600 12px/1 system-ui,sans-serif;z-index:2147483647;cursor:pointer;outline:none;";
        counter.addEventListener("click", (e) => { e.stopPropagation(); saveAll(); }, true);
        document.body.appendChild(counter);
      }
      if (selected.size === 0) {
        counter.textContent = "0 selected";
        counter.style.background = "#1a1a1a";
      } else {
        counter.textContent = `✓ Hide ${selected.size} element${selected.size > 1 ? "s" : ""}`;
        counter.style.background = "#16a34a";
      }
    }

    // ── Toast ───────────────────────────────────────────────────────────────
    let toastStyleDone = false;
    function injectToastStyle() {
      if (toastStyleDone) return;
      const s = document.createElement("style");
      s.textContent = "@keyframes __eh_in{from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}";
      (document.head || document.documentElement).appendChild(s);
      toastStyleDone = true;
    }

    function showToast(text, isErr = false) {
      document.getElementById("__eh_toast__")?.remove();
      injectToastStyle();
      const t = document.createElement("div");
      t.id = "__eh_toast__";
      t.textContent = text;
      t.style.cssText = `position:fixed;bottom:18px;left:50%;transform:translateX(-50%);
        background:${isErr?"#1c0a0a":"#1a1a1a"};color:${isErr?"#fca5a5":"#d4d4d4"};
        border:1px solid ${isErr?"#7f1d1d":"#333"};padding:8px 16px;border-radius:6px;
        font:500 13px/1 system-ui,sans-serif;z-index:2147483647;
        box-shadow:0 4px 14px rgba(0,0,0,.5);max-width:420px;text-align:center;
        animation:__eh_in .15s ease;white-space:nowrap;`;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3500);
    }

    function showToastWithUndo(text, undoDomain, undoSelectors, undoElements) {
      document.getElementById("__eh_toast__")?.remove();
      injectToastStyle();
      let dismissed = false;
      const t = document.createElement("div");
      t.id = "__eh_toast__";
      t.style.cssText = `position:fixed;bottom:18px;left:50%;transform:translateX(-50%);
        background:#1a1a1a;color:#d4d4d4;border:1px solid #333;
        padding:8px 14px;border-radius:6px;font:500 13px/1 system-ui,sans-serif;
        z-index:2147483647;box-shadow:0 4px 14px rgba(0,0,0,.5);
        display:flex;align-items:center;gap:12px;animation:__eh_in .15s ease;`;
      const span = document.createElement("span");
      span.textContent = text + " — will stay hidden";
      const undoBtn = document.createElement("button");
      undoBtn.textContent = "Undo";
      undoBtn.style.cssText = "background:none;border:1px solid #555;color:#fff;padding:2px 10px;border-radius:4px;cursor:pointer;font:600 12px/1.4 system-ui,sans-serif;white-space:nowrap;flex-shrink:0;";
      undoBtn.addEventListener("click", () => {
        if (dismissed) return;
        dismissed = true;
        t.remove();
        chrome.runtime.sendMessage({ type: "UNDO_RULES", domain: undoDomain, selectors: undoSelectors }, () => {
          undoElements.forEach(el => {
            _hiddenEls.delete(el);
            el.style.removeProperty("display");
          });
          showToast("Undo done — elements are visible again");
        });
      });
      t.appendChild(span);
      t.appendChild(undoBtn);
      document.body.appendChild(t);
      setTimeout(() => { if (!dismissed) t.remove(); }, 6000);
    }

    // ── Message listener ────────────────────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === "ENTER_PICK_MODE") { enterPickMode(); sendResponse({ ok: true }); }
      if (msg.type === "EXIT_PICK_MODE")  { exitPickMode();  sendResponse({ ok: true }); }
      if (msg.type === "REAPPLY_RULES")   { applyAllRules(); applyCleaners(); sendResponse({ ok: true }); }
      if (msg.type === "REAPPLY_CLEANERS") { applyCleaners(); sendResponse({ ok: true }); }
      if (msg.type === "TOGGLE_VISIBILITY") {
        _showingAll = msg.show;
        _hiddenEls.forEach(el => {
          if (_showingAll) {
            el.style.removeProperty("display");
            el.style.setProperty("outline", "2px dashed #f59e0b", "important");
            el.style.setProperty("opacity", "0.55", "important");
          } else {
            el.style.removeProperty("outline");
            el.style.removeProperty("opacity");
            el.style.setProperty("display", "none", "important");
          }
        });
        sendResponse({ ok: true, count: _hiddenEls.size });
      }
      return false;
    });
  })();
