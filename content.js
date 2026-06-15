(() => {
  const domain = location.hostname;

  // ── Read rules directly from storage ──────────────────────────────────
  function getRules(cb) {
    chrome.storage.local.get(["hiddenRules"], (data) => {
      cb((data.hiddenRules || {})[domain] || []);
    });
  }

  // ── Apply rules ────────────────────────────────────────────────────────
  function hideEl(el) {
    el.style.setProperty("display", "none", "important");
  }

  function applyRule(selector) {
    if (selector.startsWith("__regex__")) {
      applyRegexRule(selector.slice(9));
      return;
    }
    try {
      document.querySelectorAll(selector).forEach(hideEl);
    } catch (_) {}
  }

  function applyRegexRule(pattern) {
    if (!document.body) return;
    try {
      const regex = new RegExp(pattern, "i");
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        { acceptNode: (n) => regex.test((n.textContent || "").trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
      );
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
    getRules((rules) => rules.forEach(applyRule));
  }

  // ── Debounced observer (re-apply on dynamic DOM changes) ───────────────
  let debTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debTimer);
    debTimer = setTimeout(applyAllRules, 250);
  });

  function init() {
    applyAllRules();
    const root = document.documentElement || document.body;
    if (root) observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // ── Selector generation ────────────────────────────────────────────────
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
      if (classes) {
        seg += classes;
      } else {
        const par = cur.parentElement;
        if (par) {
          const sibs = Array.from(par.children).filter(s => s.tagName === cur.tagName);
          if (sibs.length > 1) seg += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
        }
      }
      path.unshift(seg);
      cur = cur.parentElement;
    }
    return path.join(" > ");
  }

  // ── Pick mode ──────────────────────────────────────────────────────────
  let pickMode = false;
  let hoveredEl = null;
  let overlay = null;
  let hlBox = null;
  const MINE = new Set(["__eh_overlay__","__eh_hl__","__eh_toast__"]);

  function enterPickMode() {
    if (pickMode) return;
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", enterPickMode, { once: true });
      return;
    }
    pickMode = true;
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

    showToast("Click any element to hide it — Esc to cancel");
  }

  function exitPickMode() {
    if (!pickMode) return;
    pickMode = false;
    document.body.style.cursor = "";
    overlay?.remove();  overlay = null;
    hlBox?.remove();    hlBox   = null;
    document.removeEventListener("mouseover", onOver, true);
    document.removeEventListener("mouseout",  onOut,  true);
    document.removeEventListener("click",     onPick, true);
    document.removeEventListener("keydown",   onKey,  true);
  }

  function onOver(e) {
    if (!pickMode || MINE.has(e.target.id)) return;
    hoveredEl = e.target;
    const r = e.target.getBoundingClientRect();
    Object.assign(hlBox.style, {
      display: "block", top: r.top+"px", left: r.left+"px",
      width: r.width+"px", height: r.height+"px"
    });
  }

  function onOut(e) {
    if (!pickMode) return;
    hoveredEl = null;
    if (hlBox) hlBox.style.display = "none";
  }

  function onPick(e) {
    if (!pickMode) return;
    e.preventDefault();
    e.stopPropagation();
    const el = hoveredEl || e.target;
    if (!el || MINE.has(el.id)) return;
    const selector = getSelector(el);
    exitPickMode();

    chrome.runtime.sendMessage({ type: "ADD_RULE", domain, selector }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.success) {
        hideEl(el);
        showToast("Saved — element will stay hidden on future visits");
      } else if (res?.reason === "limit_reached") {
        showToast("Free limit (5) reached — open the extension to upgrade", true);
      }
    });
  }

  function onKey(e) {
    if (e.key === "Escape") exitPickMode();
  }

  // ── Toast ──────────────────────────────────────────────────────────────
  let toastStyleDone = false;
  function showToast(text, isErr = false) {
    document.getElementById("__eh_toast__")?.remove();
    if (!toastStyleDone) {
      const s = document.createElement("style");
      s.textContent = "@keyframes __eh_in{from{opacity:0;transform:translateX(-50%) translateY(6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}";
      (document.head || document.documentElement).appendChild(s);
      toastStyleDone = true;
    }
    const t = document.createElement("div");
    t.id = "__eh_toast__";
    t.textContent = text;
    t.style.cssText = `position:fixed;bottom:18px;left:50%;transform:translateX(-50%);
      background:${isErr?"#1c0a0a":"#1a1a1a"};color:${isErr?"#fca5a5":"#d4d4d4"};
      border:1px solid ${isErr?"#7f1d1d":"#333"};padding:8px 16px;border-radius:6px;
      font:500 13px/1 system-ui,sans-serif;z-index:2147483647;
      box-shadow:0 4px 14px rgba(0,0,0,.5);max-width:400px;text-align:center;
      animation:__eh_in .15s ease;white-space:nowrap;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ── Messages from background (relayed by SW) ───────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === "ENTER_PICK_MODE") { enterPickMode(); respond({ ok: true }); }
    if (msg.type === "EXIT_PICK_MODE")  { exitPickMode();  respond({ ok: true }); }
    if (msg.type === "REAPPLY_RULES")   { applyAllRules(); respond({ ok: true }); }
    return false;
  });
})();
