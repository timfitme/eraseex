const FREE_LIMIT = 5;

// API base URL — update this to your deployed app URL
const API_BASE_URL = "https://eraseex.vercel.app/api";

// LemonSqueezy checkout URL
const CHECKOUT_URL = "https://tmft.lemonsqueezy.com/checkout/buy/6a910d3d-2a10-43e9-9bac-7a06354d34ac";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["hiddenRules", "isPremium"], (data) => {
    if (!data.hiddenRules) chrome.storage.local.set({ hiddenRules: {} });
    if (data.isPremium === undefined) chrome.storage.local.set({ isPremium: false });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    chrome.storage.local.get(["hiddenRules", "isPremium"], (data) => {
      const rules = data.hiddenRules || {};
      const total = Object.values(rules).reduce((s, a) => s + a.length, 0);
      sendResponse({
        rules,
        isPremium: data.isPremium || false,
        totalCount: total,
        freeLimit: FREE_LIMIT,
        canAddMore: data.isPremium || total < FREE_LIMIT,
      });
    });
    return true;
  }

  if (message.type === "GET_CHECKOUT_URL") {
    sendResponse({ url: CHECKOUT_URL });
    return true;
  }

  if (message.type === "ADD_RULE") {
    chrome.storage.local.get(["hiddenRules", "isPremium"], (data) => {
      const rules = data.hiddenRules || {};
      const isPremium = data.isPremium || false;
      const total = Object.values(rules).reduce((s, a) => s + a.length, 0);

      if (!isPremium && total >= FREE_LIMIT) {
        sendResponse({ success: false, reason: "limit_reached" });
        return;
      }

      const domain = message.domain;
      if (!rules[domain]) rules[domain] = [];
      if (!rules[domain].includes(message.selector)) {
        rules[domain].push(message.selector);
      }

      chrome.storage.local.set({ hiddenRules: rules }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === "REMOVE_RULE") {
    chrome.storage.local.get(["hiddenRules"], (data) => {
      const rules = data.hiddenRules || {};
      const domain = message.domain;
      if (rules[domain]) {
        rules[domain] = rules[domain].filter((s) => s !== message.selector);
        if (rules[domain].length === 0) delete rules[domain];
      }
      chrome.storage.local.set({ hiddenRules: rules }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === "UPDATE_RULE") {
    chrome.storage.local.get(["hiddenRules", "isPremium"], (data) => {
      if (!data.isPremium) {
        sendResponse({ success: false, reason: "premium_required" });
        return;
      }
      const rules = data.hiddenRules || {};
      const domain = message.domain;
      if (!rules[domain]) rules[domain] = [];
      const idx = rules[domain].indexOf(message.oldSelector);
      if (idx !== -1) rules[domain][idx] = message.newSelector;
      chrome.storage.local.set({ hiddenRules: rules }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === "ADD_REGEX_RULE") {
    chrome.storage.local.get(["hiddenRules", "isPremium"], (data) => {
      if (!data.isPremium) {
        sendResponse({ success: false, reason: "premium_required" });
        return;
      }
      const rules = data.hiddenRules || {};
      const domain = message.domain;
      if (!rules[domain]) rules[domain] = [];
      const regexRule = `__regex__${message.pattern}`;
      if (!rules[domain].includes(regexRule)) rules[domain].push(regexRule);
      chrome.storage.local.set({ hiddenRules: rules }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === "ACTIVATE_PREMIUM") {
    const licenseKey = message.code.trim();

    fetch(`${API_BASE_URL}/license/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: licenseKey }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          chrome.storage.local.set({ isPremium: true, licenseKey }, () => {
            sendResponse({ success: true });
          });
        } else {
          sendResponse({ success: false, reason: "invalid_code", error: data.error });
        }
      })
      .catch(() => {
        sendResponse({ success: false, reason: "network_error" });
      });
    return true;
  }

  if (message.type === "GET_RULES_FOR_TAB") {
    chrome.storage.local.get(["hiddenRules", "isPremium"], (data) => {
      const rules = data.hiddenRules || {};
      sendResponse({
        selectors: rules[message.domain] || [],
        isPremium: data.isPremium || false,
      });
    });
    return true;
  }

  if (message.type === "CLEAR_ALL_RULES") {
    chrome.storage.local.set({ hiddenRules: {} }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "CLEAR_DOMAIN_RULES") {
    chrome.storage.local.get(["hiddenRules"], (data) => {
      const rules = data.hiddenRules || {};
      delete rules[message.domain];
      chrome.storage.local.set({ hiddenRules: rules }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === "IMPORT_RULES") {
    chrome.storage.local.get(["hiddenRules", "isPremium"], (data) => {
      const existing = data.hiddenRules || {};
      const incoming = message.rules || {};

      for (const [domain, selectors] of Object.entries(incoming)) {
        if (!Array.isArray(selectors)) continue;
        if (!existing[domain]) existing[domain] = [];
        for (const s of selectors) {
          if (typeof s === "string" && !existing[domain].includes(s)) {
            existing[domain].push(s);
          }
        }
      }

      chrome.storage.local.set({ hiddenRules: existing }, () => {
        const total = Object.values(existing).reduce((s, a) => s + a.length, 0);
        sendResponse({ success: true, totalCount: total });
      });
    });
    return true;
  }
});
