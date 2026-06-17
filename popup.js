let currentDomain = "";
  let isPremium = false;
  let totalCount = 0;
  let globalCount = 0;
  let freeLimit = 15;
  let canAddMore = true;
  let currentDomainRules = [];
  let allRules = {};
  let elementsShowing = false;

  const $ = id => document.getElementById(id);
  const pickBtn            = $("pick-btn");
  const counterText        = $("counter-text");
  const progressFill       = $("progress-fill");
  const limitBanner        = $("limit-banner");
  const upgradeBtn         = $("upgrade-btn");
  const rulesList          = $("rules-list");
  const badge              = $("badge");
  const domainLabel        = $("domain-label");
  const upgradeModal       = $("upgrade-modal");
  const confirmModal       = $("confirm-modal");
  const confirmTitle       = $("confirm-title");
  const confirmDesc        = $("confirm-desc");
  const confirmOk          = $("confirm-ok");
  const confirmCancel      = $("confirm-cancel");
  const themeSection       = $("theme-section");
  const statsSection       = $("stats-section");
  const cleanersSection    = $("cleaners-section");
  const cleanersList       = $("cleaners-list");
  const autoCleanBtn       = $("auto-clean-btn");
  const focusSection       = $("focus-section");
  const focusToggle        = $("focus-toggle");
  const focusStatus        = $("focus-status");
  const textmatchSection   = $("textmatch-section");
  const textmatchInput     = $("textmatch-input");
  const textmatchAdd       = $("textmatch-add");
  const scheduleEnabled    = $("schedule-enabled");
  const scheduleConfig     = $("schedule-config");
  const scheduleStart      = $("schedule-start");
  const scheduleEnd        = $("schedule-end");
  const scheduleWeekdays   = $("schedule-weekdays");
  const statsSitesList     = $("stats-sites-list");
  const statsTotalLabel    = $("stats-total-label");
  const premiumCodeInput   = $("premium-code");
  const confirmUpgradeBtn  = $("confirm-upgrade");
  const cancelUpgradeBtn   = $("cancel-upgrade");
  const buyBtn             = $("buy-btn");
  const codeError          = $("code-error");
  const reapplyBtn         = $("reapply-btn");
  const exportBtn          = $("export-btn");
  const importInput        = $("import-input");
  const clearAllBtn        = $("clear-all-btn");
  const clearSiteBtn       = $("clear-site-btn");
  const inlineNotice       = $("inline-notice");
  const noticeText         = $("notice-text");
  const noticeUpgrade      = $("notice-upgrade");
  const statsBar           = $("stats-bar");
  const statsText          = $("stats-text");
  const statsDetail        = $("stats-detail");
  const clearAllBtnPremium = $("clear-all-btn-premium");
  const toggleVisBtn       = $("toggle-visibility-btn");
  const toggleVisPremBtn   = $("toggle-visibility-premium-btn");
  const upgradeHint        = $("upgrade-hint");
  const upgradeHintBtn     = $("upgrade-hint-btn");

  // ── Theme ──────────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    document.querySelectorAll(".theme-swatch").forEach(el =>
      el.classList.toggle("active", el.dataset.theme === theme));
  }
  function loadTheme() {
    chrome.storage.local.get(["selectedTheme"], d => applyTheme(d.selectedTheme || "light"));
  }
  document.querySelectorAll(".theme-swatch").forEach(btn => {
    btn.addEventListener("click", () => {
      applyTheme(btn.dataset.theme);
      chrome.storage.local.set({ selectedTheme: btn.dataset.theme });
    });
  });

  // ── Notice ─────────────────────────────────────────────────────────────────
  function showNotice(text, { showUpgrade = false } = {}) {
    if (!inlineNotice) return;
    noticeText.textContent = text;
    noticeUpgrade.style.display = showUpgrade ? "inline" : "none";
    inlineNotice.classList.remove("hidden");
    setTimeout(() => inlineNotice.classList.add("hidden"), 3500);
  }

  // ── Render stats breakdown ─────────────────────────────────────────────────
  function renderStatsSites(rules) {
    if (!statsSitesList) return;
    const sites = Object.entries(rules)
      .filter(([d]) => d !== "__global__")
      .map(([domain, sels]) => ({ domain, count: sels.length }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count);
    const total = sites.reduce((s, x) => s + x.count, 0);
    if (statsTotalLabel) statsTotalLabel.textContent = total + " total";
    if (sites.length === 0) {
      statsSitesList.innerHTML = '<div class="empty-state">No hidden elements yet</div>';
      return;
    }
    const maxCount = sites[0].count;
    statsSitesList.innerHTML = sites.map(s => `
      <div class="site-stat-row">
        <span class="site-stat-name" title="${s.domain}">${s.domain}</span>
        <div class="site-stat-bar"><div class="site-stat-fill" style="width:${Math.round(s.count/maxCount*100)}%"></div></div>
        <span class="site-stat-count">${s.count}</span>
        <button class="site-stat-del" data-domain="${s.domain}" title="Clear rules for this site">✕</button>
      </div>
    `).join('');
    statsSitesList.querySelectorAll(".site-stat-del").forEach(btn => {
      btn.addEventListener("click", () =>
        chrome.runtime.sendMessage({ type: "CLEAR_DOMAIN_RULES", domain: btn.dataset.domain }, () => loadState()));
    });
  }

  // ── Focus Mode toggle ──────────────────────────────────────────────────────
  let _focusMode = false;

  function updateFocusUI() {
    if (!focusToggle) return;
    focusToggle.classList.toggle("active", _focusMode);
    if (focusStatus) focusStatus.textContent = _focusMode ? "ON" : "OFF";
  }

  focusToggle?.addEventListener("click", () => {
    const newState = !_focusMode;
    chrome.runtime.sendMessage({ type: "TOGGLE_FOCUS_MODE", enabled: newState }, (res) => {
      if (res?.success) {
        _focusMode = newState;
        updateFocusUI();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "REAPPLY_CLEANERS" }, () => {});
        });
        showNotice(_focusMode ? "Focus Mode ON — distractions hidden everywhere." : "Focus Mode OFF.");
      } else {
        showNotice("Focus Mode is a Premium feature.", { showUpgrade: true });
      }
    });
  });

  // ── Focus Hours schedule ───────────────────────────────────────────────────
  let _focusSchedule = { enabled: false, startHour: 9, endHour: 18, weekdaysOnly: true };

  function saveSchedule() {
    const s = {
      enabled:      scheduleEnabled?.checked || false,
      startHour:    parseInt(scheduleStart?.value || "9",  10),
      endHour:      parseInt(scheduleEnd?.value   || "18", 10),
      weekdaysOnly: scheduleWeekdays?.checked !== false,
    };
    chrome.runtime.sendMessage({ type: "SAVE_FOCUS_SCHEDULE", schedule: s }, (res) => {
      if (res?.success) {
        _focusSchedule = s;
        showNotice(s.enabled ? `Focus Hours set: ${s.startHour}:00 – ${s.endHour}:00` : "Focus Hours disabled.");
      }
    });
  }

  function renderScheduleUI(sched) {
    if (!scheduleEnabled) return;
    _focusSchedule = sched;
    scheduleEnabled.checked = sched.enabled;
    if (scheduleStart)   scheduleStart.value   = sched.startHour;
    if (scheduleEnd)     scheduleEnd.value      = sched.endHour;
    if (scheduleWeekdays) scheduleWeekdays.checked = sched.weekdaysOnly !== false;
    scheduleConfig?.classList.toggle("hidden", !sched.enabled);
  }

  scheduleEnabled?.addEventListener("change", () => {
    scheduleConfig?.classList.toggle("hidden", !scheduleEnabled.checked);
    saveSchedule();
  });
  scheduleStart?.addEventListener("change", saveSchedule);
  scheduleEnd?.addEventListener("change", saveSchedule);
  scheduleWeekdays?.addEventListener("change", saveSchedule);

  // ── Hide by text ───────────────────────────────────────────────────────────
  function addTextMatch() {
    const val = (textmatchInput?.value || "").trim();
    if (!val) return;
    const selector = "__regex__" + val;
    chrome.runtime.sendMessage({ type: "ADD_RULE", domain: currentDomain, selector }, (res) => {
      if (res?.success) {
        if (textmatchInput) textmatchInput.value = "";
        showNotice(`Hiding elements with text "${val}"`);
        loadState();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "REAPPLY_RULES" }, () => {});
        });
      }
    });
  }
  textmatchAdd?.addEventListener("click", addTextMatch);
  textmatchInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addTextMatch(); } });

  // ── Render cleaners ────────────────────────────────────────────────────────
  let _enabledCleaners = {};
  let _cleanerPresets = {};

  function renderCleaners() {
    if (!cleanersList) return;
    const ids = Object.keys(_cleanerPresets);
    if (ids.length === 0) { cleanersList.innerHTML = ''; return; }
    cleanersList.innerHTML = ids.map(id => {
      const preset = _cleanerPresets[id];
      const enabled = !!_enabledCleaners[id];
      return `<button class="cleaner-chip${enabled ? ' active' : ''}" data-cleaner="${id}">${preset.label}</button>`;
    }).join('');
    cleanersList.querySelectorAll('.cleaner-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.cleaner;
        const enabled = !_enabledCleaners[id];
        chrome.runtime.sendMessage({ type: "TOGGLE_CLEANER", id, enabled }, (res) => {
          if (res?.success) {
            _enabledCleaners[id] = enabled;
            chip.classList.toggle('active', enabled);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "REAPPLY_CLEANERS" }, () => {});
            });
          }
        });
      });
    });
  }

  autoCleanBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: "AUTO_CLEAN" }, (res) => {
      if (res?.success) {
        Object.keys(_cleanerPresets).forEach(id => { _enabledCleaners[id] = true; });
        renderCleaners();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "REAPPLY_CLEANERS" }, () => {});
        });
        showNotice("All cleaners enabled!");
      }
    });
  });

  // ── Render state ───────────────────────────────────────────────────────────
  function renderState() {
    badge.className = isPremium ? "badge badge-premium" : "badge badge-free";
    badge.textContent = isPremium ? "Premium" : "Free";
    if (upgradeHint) upgradeHint.classList.toggle("hidden", isPremium);

    themeSection?.classList.remove("hidden");
    if (isPremium) {
      $("counter-bar")?.classList.add("hidden");
      statsBar?.classList.remove("hidden");
      statsSection?.classList.remove("hidden");
      cleanersSection?.classList.remove("hidden");
      textmatchSection?.classList.remove("hidden");
      focusSection?.classList.remove("hidden");
      $("premium-preview")?.classList.add("hidden");
      statsText.textContent = totalCount + " element" + (totalCount !== 1 ? "s" : "") + " hidden";
      const siteCount = Object.keys(allRules).filter(d => d !== "__global__").length;
      statsDetail.textContent = "across " + siteCount + " site" + (siteCount !== 1 ? "s" : "");
      renderStatsSites(allRules);
      updateFocusUI();
      if (_focusSchedule) renderScheduleUI(_focusSchedule);
    } else {
      $("counter-bar")?.classList.remove("hidden");
      statsBar?.classList.add("hidden");
      statsSection?.classList.add("hidden");
      cleanersSection?.classList.add("hidden");
      textmatchSection?.classList.add("hidden");
      focusSection?.classList.add("hidden");
      $("premium-preview")?.classList.remove("hidden");
      counterText.textContent = totalCount + " / " + freeLimit + " used";
      const pct = Math.min(100, Math.round(totalCount / freeLimit * 100));
      progressFill.style.width = pct + "%";
      progressFill.classList.toggle("warning", totalCount >= freeLimit);
      limitBanner?.classList.toggle("hidden", totalCount < freeLimit);
    }
  }

  // ── Load domain rules ──────────────────────────────────────────────────────
  function loadDomainRules() {
    currentDomainRules = allRules[currentDomain] || [];
    const hasDomain = currentDomainRules.length > 0;
    clearSiteBtn?.classList.toggle("hidden", !hasDomain);
    if (currentDomainRules.length === 0) {
      rulesList.innerHTML = '<div class="empty-state">Nothing hidden on this site</div>';
      return;
    }
    rulesList.innerHTML = currentDomainRules.map((sel, idx) => {
      const isRegex = sel.startsWith("__regex__");
      const display = isRegex ? "~" + sel.slice(9) : sel;
      return `<div class="rule-item" data-idx="${idx}">
        <span class="rule-selector" title="${display}">${display}</span>
        <div class="rule-actions">
          ${isPremium ? `<button class="icon-btn edit" data-idx="${idx}" title="Edit">✎</button>` : ""}
          <button class="icon-btn delete" data-idx="${idx}" title="Remove">✕</button>
        </div>
      </div>`;
    }).join("");
    rulesList.querySelectorAll(".icon-btn.delete").forEach(btn => {
      btn.addEventListener("click", () => {
        const selector = currentDomainRules[+btn.dataset.idx];
        chrome.runtime.sendMessage({ type: "REMOVE_RULE", domain: currentDomain, selector }, () => loadState());
      });
    });
    if (isPremium) {
      rulesList.querySelectorAll(".icon-btn.edit").forEach(btn =>
        btn.addEventListener("click", () => startEdit(+btn.dataset.idx)));
    }
  }

  function startEdit(idx) {
    const item = rulesList.querySelector(`.rule-item[data-idx="${idx}"]`);
    if (!item) return;
    const oldSel = currentDomainRules[idx];
    const span = item.querySelector(".rule-selector");
    const oldText = span.textContent;
    const input = document.createElement("input");
    input.className = "rule-edit-input";
    input.value = oldSel.startsWith("__regex__") ? oldSel.slice(9) : oldSel;
    item.replaceChild(input, span);
    input.focus();
    const save = () => {
      const newVal = input.value.trim();
      if (!newVal || newVal === oldText) { loadDomainRules(); return; }
      chrome.runtime.sendMessage({ type: "UPDATE_RULE", domain: currentDomain, oldSelector: oldSel, newSelector: newVal }, () => loadState());
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); save(); }
      if (e.key === "Escape") loadDomainRules();
    });
  }

  function loadState() {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
      if (!res) return;
      isPremium  = res.isPremium;
      totalCount = res.totalCount;
      freeLimit  = res.freeLimit;
      canAddMore = res.canAddMore;
      allRules   = res.rules || {};
      _enabledCleaners = res.enabledCleaners || {};
      _cleanerPresets  = res.cleanerPresets  || {};
      _focusMode       = res.focusMode || false;
      _focusSchedule   = res.focusSchedule || _focusSchedule;
      renderState();
      loadDomainRules();
      if (isPremium) renderCleaners();
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    loadTheme();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) return;
      try {
        currentDomain = new URL(tab.url).hostname;
        domainLabel.textContent = currentDomain;
      } catch { domainLabel.textContent = "Unknown site"; return; }
      loadState();
    });
  }
  init();

  // ── Pick mode ──────────────────────────────────────────────────────────────
  pickBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: "ENTER_PICK_MODE" });
      window.close();
    });
  });

  // ── Toggle visibility ──────────────────────────────────────────────────────
  function sendToggleToTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      elementsShowing = !elementsShowing;
      toggleVisBtn?.classList.toggle("showing", elementsShowing);
      toggleVisPremBtn?.classList.toggle("showing", elementsShowing);
      chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_VISIBILITY", show: elementsShowing }, () => {});
    });
  }
  toggleVisBtn?.addEventListener("click", sendToggleToTab);
  toggleVisPremBtn?.addEventListener("click", sendToggleToTab);

  // ── Upgrade ────────────────────────────────────────────────────────────────
  upgradeHintBtn?.addEventListener("click", () => upgradeModal?.classList.remove("hidden"));
  upgradeBtn?.addEventListener("click",     () => upgradeModal?.classList.remove("hidden"));
  cancelUpgradeBtn?.addEventListener("click", () => {
    upgradeModal?.classList.add("hidden");
    if (premiumCodeInput) premiumCodeInput.value = "";
    codeError?.classList.add("hidden");
  });
  buyBtn?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "GET_CHECKOUT_URL" }, (res) => {
      if (res?.url) chrome.tabs.create({ url: res.url });
    });
  });
  confirmUpgradeBtn?.addEventListener("click", () => {
    const code = premiumCodeInput?.value?.trim();
    if (!code) {
      if (codeError) { codeError.textContent = "Please enter a license key."; codeError.classList.remove("hidden"); }
      return;
    }
    confirmUpgradeBtn.disabled = true;
    confirmUpgradeBtn.textContent = "Validating…";
    codeError?.classList.add("hidden");
    chrome.runtime.sendMessage({ type: "ACTIVATE_PREMIUM", code }, (res) => {
      confirmUpgradeBtn.disabled = false;
      confirmUpgradeBtn.textContent = "Activate";
      if (res?.success) {
        upgradeModal?.classList.add("hidden");
        showNotice("Premium activated! Enjoy unlimited elements.");
        loadState();
      } else {
        const msg = res?.reason === "network_error"
          ? "Could not connect to license server. Try again."
          : "Invalid or expired license key.";
        if (codeError) { codeError.textContent = msg; codeError.classList.remove("hidden"); }
      }
    });
  });

  // ── Reapply ────────────────────────────────────────────────────────────────
  reapplyBtn?.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "REAPPLY_RULES" }, () => {});
    });
  });

  // ── Confirm helper ─────────────────────────────────────────────────────────
  function showConfirm(title, desc, okLabel, onOk) {
    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmDesc)  confirmDesc.textContent  = desc;
    if (confirmOk)    confirmOk.textContent    = okLabel;
    confirmModal?.classList.remove("hidden");
    const ok = () => { onOk(); cleanup(); };
    const cancel = () => cleanup();
    function cleanup() {
      confirmModal?.classList.add("hidden");
      confirmOk?.removeEventListener("click", ok);
      confirmCancel?.removeEventListener("click", cancel);
    }
    confirmOk?.addEventListener("click", ok);
    confirmCancel?.addEventListener("click", cancel);
  }

  // ── Clear ──────────────────────────────────────────────────────────────────
  const clearAllDesc = "This will remove all hidden element rules across every site. This cannot be undone.";
  clearAllBtn?.addEventListener("click", () =>
    showConfirm("Clear all rules?", clearAllDesc, "Clear all", () =>
      chrome.runtime.sendMessage({ type: "CLEAR_ALL_RULES" }, () => loadState())));
  clearAllBtnPremium?.addEventListener("click", () =>
    showConfirm("Clear all rules?", clearAllDesc, "Clear all", () =>
      chrome.runtime.sendMessage({ type: "CLEAR_ALL_RULES" }, () => loadState())));
  clearSiteBtn?.addEventListener("click", () =>
    showConfirm(`Clear rules for ${currentDomain}?`,
      `Remove all hidden elements for ${currentDomain}. This cannot be undone.`,
      "Clear site", () =>
        chrome.runtime.sendMessage({ type: "CLEAR_DOMAIN_RULES", domain: currentDomain }, () => loadState())));

  // ── Export / Import ────────────────────────────────────────────────────────
  exportBtn?.addEventListener("click", () => {
    chrome.storage.local.get(["hiddenRules"], (data) => {
      const json = JSON.stringify(data.hiddenRules || {}, null, 2);
      const url  = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a    = Object.assign(document.createElement("a"), { href: url, download: "element-hider-rules.json" });
      a.click(); URL.revokeObjectURL(url);
    });
  });
  importInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rules = JSON.parse(ev.target.result);
        chrome.runtime.sendMessage({ type: "IMPORT_RULES", rules }, (res) => {
          showNotice(res?.success ? `Imported ${res.totalCount} elements.` : "Import failed.");
          loadState();
        });
      } catch { showNotice("Invalid JSON file."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // ── Inline notice upgrade link ─────────────────────────────────────────────
  noticeUpgrade?.addEventListener("click", () => upgradeModal?.classList.remove("hidden"));
  