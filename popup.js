let currentDomain = "";
let isPremium = false;
let totalCount = 0;
let freeLimit = 5;
let canAddMore = true;
let currentDomainRules = [];

const pickBtn           = document.getElementById("pick-btn");
const counterText       = document.getElementById("counter-text");
const progressFill      = document.getElementById("progress-fill");
const limitBanner       = document.getElementById("limit-banner");
const upgradeBtn        = document.getElementById("upgrade-btn");
const rulesList         = document.getElementById("rules-list");
const badge             = document.getElementById("badge");
const domainLabel       = document.getElementById("domain-label");
const upgradeModal      = document.getElementById("upgrade-modal");
const confirmModal      = document.getElementById("confirm-modal");
const confirmDesc       = document.getElementById("confirm-desc");
const confirmOk         = document.getElementById("confirm-ok");
const confirmCancel     = document.getElementById("confirm-cancel");
const premiumSection    = document.getElementById("premium-section");
const customSelector    = document.getElementById("custom-selector");
const addSelectorBtn    = document.getElementById("add-selector-btn");
const regexInput        = document.getElementById("regex-input");
const addRegexBtn       = document.getElementById("add-regex-btn");
const premiumCodeInput  = document.getElementById("premium-code");
const confirmUpgradeBtn = document.getElementById("confirm-upgrade");
const cancelUpgradeBtn  = document.getElementById("cancel-upgrade");
const buyBtn            = document.getElementById("buy-btn");
const codeError         = document.getElementById("code-error");
const reapplyBtn        = document.getElementById("reapply-btn");
const exportBtn         = document.getElementById("export-btn");
const importInput       = document.getElementById("import-input");
const clearAllBtn       = document.getElementById("clear-all-btn");
const clearSiteBtn      = document.getElementById("clear-site-btn");
const inlineNotice      = document.getElementById("inline-notice");
const noticeText        = document.getElementById("notice-text");
const noticeUpgrade     = document.getElementById("notice-upgrade");

// ── Init ──────────────────────────────────────────────────────────────────
function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;
    try {
      currentDomain = new URL(tab.url).hostname;
      domainLabel.textContent = currentDomain;
    } catch {
      domainLabel.textContent = "Unknown site";
      return;
    }
    loadState();
  });
}

function loadState() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
    if (!res) return;
    isPremium          = res.isPremium;
    totalCount         = res.totalCount;
    freeLimit          = res.freeLimit;
    canAddMore         = res.canAddMore;
    currentDomainRules = res.rules[currentDomain] || [];
    updateUI();
  });
}

// ── UI update ─────────────────────────────────────────────────────────────
function updateUI() {
  if (isPremium) {
    badge.textContent = "Premium";
    badge.className   = "badge badge-premium";
    document.getElementById("counter-bar").style.display = "none";
    limitBanner.classList.add("hidden");
    premiumSection.classList.remove("hidden");
  } else {
    badge.textContent = "Free";
    badge.className   = "badge badge-free";

    const pct = Math.min((totalCount / freeLimit) * 100, 100);
    counterText.textContent = `${totalCount} / ${freeLimit} used`;
    progressFill.style.width = pct + "%";
    progressFill.classList.toggle("warning", totalCount >= freeLimit - 1);

    if (!canAddMore) {
      limitBanner.classList.remove("hidden");
      pickBtn.disabled      = true;
      pickBtn.style.opacity = "0.4";
      pickBtn.style.cursor  = "not-allowed";
    } else {
      limitBanner.classList.add("hidden");
      pickBtn.disabled      = false;
      pickBtn.style.opacity = "";
      pickBtn.style.cursor  = "";
    }
  }

  clearSiteBtn.classList.toggle("hidden", currentDomainRules.length === 0);
  clearAllBtn.style.visibility = totalCount === 0 ? "hidden" : "visible";

  renderRules();
}

// ── Rules list ────────────────────────────────────────────────────────────
function renderRules() {
  rulesList.innerHTML = "";

  if (currentDomainRules.length === 0) {
    rulesList.innerHTML = '<div class="empty-state">Nothing hidden on this site</div>';
    return;
  }

  currentDomainRules.forEach((selector) => {
    const isRegex     = selector.startsWith("__regex__");
    const displayText = isRegex ? `/${selector.slice(9)}/` : selector;

    const item = document.createElement("div");
    item.className = "rule-item";

    const selEl = document.createElement("div");
    selEl.className = "rule-selector" + (isRegex ? " regex-rule" : "");
    selEl.textContent = displayText;
    selEl.title = displayText;

    const actions = document.createElement("div");
    actions.className = "rule-actions";

    if (isPremium && !isRegex) {
      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn edit";
      editBtn.title = "Edit";
      editBtn.textContent = "✏";
      editBtn.addEventListener("click", () => startEdit(item, selector, selEl));
      actions.appendChild(editBtn);
    }

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn delete";
    delBtn.title = "Remove";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", () => removeRule(selector));
    actions.appendChild(delBtn);

    item.appendChild(selEl);
    item.appendChild(actions);
    rulesList.appendChild(item);
  });
}

function startEdit(item, oldSel, selEl) {
  const input = document.createElement("input");
  input.className = "rule-edit-input";
  input.value = oldSel;
  item.replaceChild(input, selEl);
  input.focus();
  input.select();

  const save = () => {
    const next = input.value.trim();
    if (!next || next === oldSel) { item.replaceChild(selEl, input); return; }
    chrome.runtime.sendMessage(
      { type: "UPDATE_RULE", domain: currentDomain, oldSelector: oldSel, newSelector: next },
      (res) => { if (res && res.success) { applyOnPage(); loadState(); } }
    );
  };

  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  save();
    if (e.key === "Escape") item.replaceChild(selEl, input);
  });
}

function removeRule(selector) {
  chrome.runtime.sendMessage(
    { type: "REMOVE_RULE", domain: currentDomain, selector },
    () => { applyOnPage(); loadState(); }
  );
}

function applyOnPage() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "REAPPLY_RULES" });
  });
}

// ── Notice helper ─────────────────────────────────────────────────────────
let noticeTimer = null;
function showNotice(msg, { showUpgrade = false } = {}) {
  noticeText.textContent = msg;
  noticeUpgrade.style.display = showUpgrade ? "" : "none";
  inlineNotice.classList.remove("hidden");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => inlineNotice.classList.add("hidden"), 3500);
}

noticeUpgrade.addEventListener("click", () => {
  inlineNotice.classList.add("hidden");
  openUpgradeModal();
});

function openUpgradeModal() {
  codeError.classList.add("hidden");
  premiumCodeInput.value = "";
  confirmUpgradeBtn.disabled = false;
  confirmUpgradeBtn.textContent = "Activate";
  upgradeModal.classList.remove("hidden");
  premiumCodeInput.focus();
}

// ── Buy button (opens LemonSqueezy checkout) ──────────────────────────────
buyBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_CHECKOUT_URL" }, (res) => {
    if (res && res.url) {
      chrome.tabs.create({ url: res.url });
    }
    window.close();
  });
});

// ── Pick mode ─────────────────────────────────────────────────────────────
pickBtn.addEventListener("click", () => {
  if (!canAddMore && !isPremium) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;

    chrome.tabs.sendMessage(tabs[0].id, { type: "ENTER_PICK_MODE" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        chrome.scripting.executeScript(
          { target: { tabId: tabs[0].id }, files: ["content.js"] },
          () => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, { type: "ENTER_PICK_MODE" });
            }, 150);
          }
        );
      }
    });

    window.close();
  });
});

// ── Reapply ───────────────────────────────────────────────────────────────
reapplyBtn.addEventListener("click", () => {
  applyOnPage();
  showNotice("Rules re-applied.");
});

// ── Clear all ──────────────────────────────────────────────────────────────
clearAllBtn.addEventListener("click", () => {
  confirmDesc.textContent = "This will remove all hidden rules across every site. Cannot be undone.";
  confirmOk.textContent   = "Clear all";
  confirmOk.className     = "btn btn-danger";
  confirmModal.classList.remove("hidden");

  confirmOk.onclick = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_ALL_RULES" }, () => {
      confirmModal.classList.add("hidden");
      applyOnPage();
      loadState();
    });
  };
});

// ── Clear site ─────────────────────────────────────────────────────────────
clearSiteBtn.addEventListener("click", () => {
  confirmDesc.textContent = `This will remove all hidden rules for ${currentDomain}. Cannot be undone.`;
  confirmOk.textContent   = "Clear site";
  confirmOk.className     = "btn btn-danger";
  confirmModal.classList.remove("hidden");

  confirmOk.onclick = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_DOMAIN_RULES", domain: currentDomain }, () => {
      confirmModal.classList.add("hidden");
      applyOnPage();
      loadState();
    });
  };
});

confirmCancel.addEventListener("click", () => confirmModal.classList.add("hidden"));

// ── Upgrade / Activate premium ────────────────────────────────────────────
upgradeBtn.addEventListener("click", () => openUpgradeModal());

cancelUpgradeBtn.addEventListener("click", () => upgradeModal.classList.add("hidden"));

confirmUpgradeBtn.addEventListener("click", () => {
  const code = premiumCodeInput.value.trim();
  if (!code) {
    codeError.textContent = "Please enter a license key";
    codeError.classList.remove("hidden");
    return;
  }

  confirmUpgradeBtn.disabled     = true;
  confirmUpgradeBtn.textContent  = "Validating…";
  codeError.classList.add("hidden");

  chrome.runtime.sendMessage({ type: "ACTIVATE_PREMIUM", code }, (res) => {
    if (res && res.success) {
      upgradeModal.classList.add("hidden");
      showNotice("Premium activated! Enjoy unlimited elements.");
      loadState();
    } else {
      confirmUpgradeBtn.disabled    = false;
      confirmUpgradeBtn.textContent = "Activate";
      const msg =
        res?.reason === "network_error"
          ? "Could not connect to license server. Try again."
          : "Invalid or expired license key.";
      codeError.textContent = msg;
      codeError.classList.remove("hidden");
    }
  });
});

// ── Premium: add custom selector ──────────────────────────────────────────
addSelectorBtn.addEventListener("click", () => {
  const sel = customSelector.value.trim();
  if (!sel) return;
  chrome.runtime.sendMessage(
    { type: "ADD_RULE", domain: currentDomain, selector: sel },
    (res) => {
      if (res?.success) {
        customSelector.value = "";
        applyOnPage();
        loadState();
      }
    }
  );
});

customSelector.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSelectorBtn.click();
});

// ── Premium: add regex rule ───────────────────────────────────────────────
addRegexBtn.addEventListener("click", () => {
  const pattern = regexInput.value.trim();
  if (!pattern) return;
  chrome.runtime.sendMessage(
    { type: "ADD_REGEX_RULE", domain: currentDomain, pattern },
    (res) => {
      if (res?.success) {
        regexInput.value = "";
        applyOnPage();
        loadState();
      }
    }
  );
});

regexInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addRegexBtn.click();
});

// ── Export ────────────────────────────────────────────────────────────────
exportBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
    if (!res) return;
    const blob = new Blob([JSON.stringify(res.rules, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "element-hider-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  });
});

// ── Import ────────────────────────────────────────────────────────────────
importInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const rules = JSON.parse(ev.target.result);
      chrome.runtime.sendMessage({ type: "IMPORT_RULES", rules }, (res) => {
        if (res?.success) {
          showNotice(`Imported ${res.totalCount} rule${res.totalCount === 1 ? "" : "s"}.`);
          applyOnPage();
          loadState();
        }
      });
    } catch {
      showNotice("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
  importInput.value = "";
});

init();
