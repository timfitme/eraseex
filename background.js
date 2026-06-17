const FREE_LIMIT = 15;
  const GLOBAL_DOMAIN = "__global__";
  const API_BASE_URL = "https://eraseex-beta.vercel.app/api";
  const CHECKOUT_URL = "https://payhip.com/b/REPLACE_WITH_YOUR_PAYHIP_PRODUCT_LINK";

  const PRESET_SELECTORS = [
    '[class*="cookie-banner"]','[id*="cookie-banner"]','[class*="cookie-notice"]',
    '[class*="gdpr"]','[id*="gdpr"]','[class*="consent-"]','[id*="consent-"]',
    '[class*="newsletter-popup"]','[id*="newsletter-popup"]',
    '[class*="subscribe-popup"]','[class*="email-popup"]',
    '[class*="ad-banner"]','[class*="sticky-ad"]','[class*="sticky-footer-ad"]',
  ];

  const CLEANER_PRESETS = {
    youtube: {
      label: "YouTube Cleaner",
      domains: ["youtube.com", "www.youtube.com"],
      global: false,
      selectors: [
        "ytd-ad-slot-renderer",
        "ytd-banner-promo-renderer",
        "ytd-statement-banner-renderer",
        "#masthead-ad",
        "ytd-promoted-sparkles-web-renderer",
        "ytd-display-ad-renderer",
        "ytd-promoted-video-renderer",
        ".ytp-ad-module",
        ".ytp-ad-overlay-container",
        ".ytp-ad-image-overlay",
        "#player-ads",
        "ytd-rich-item-renderer.ytd-rich-section-renderer",
      ],
    },
    reddit: {
      label: "Reddit Cleaner",
      domains: ["reddit.com", "www.reddit.com", "old.reddit.com"],
      global: false,
      selectors: [
        "shreddit-ad-post",
        "[data-testid='post-promoted-label']",
        ".promotedlink",
        "[data-promoted='true']",
        "[id*='ad_'] .link",
        "[class*='Reddit-Ad']",
        "[data-adtype]",
      ],
    },
    facebook: {
      label: "Facebook Cleaner",
      domains: ["facebook.com", "www.facebook.com"],
      global: false,
      selectors: [
        "[aria-label='Sponsored']",
        "span[data-ad-preview='message']",
        "[data-pagelet='RightRail']",
        "[data-pagelet='Stories']",
        "[id*='hyperfeed_story_id'][data-ad-preview]",
      ],
    },
    news: {
      label: "News Cleaner",
      domains: [],
      global: true,
      selectors: [
        "[class*='paywall']",
        "[id*='paywall']",
        "[class*='ad-leaderboard']",
        "[class*='ad-banner']",
        "[class*='sponsored-content']",
        "[class*='taboola']",
        "[id*='taboola']",
        "[class*='outbrain']",
        "[id*='outbrain']",
        "[class*='dfp-ad']",
        "[id*='dfp-ad']",
        "[class*='google-ad']",
        ".OUTBRAIN",
        "#piano-inline-content-wrapper",
      ],
    },
    cookie: {
      label: "Cookie Popup Remover",
      domains: [],
      global: true,
      selectors: [
        "[class*='cookie-banner']",
        "[id*='cookie-banner']",
        "[class*='cookie-consent']",
        "[id*='cookie-consent']",
        "[class*='cookie-notice']",
        "[id*='cookie-notice']",
        "[class*='gdpr']",
        "[id*='gdpr']",
        "[class*='consent-']",
        "[id*='consent-']",
        "#onetrust-banner-sdk",
        "#onetrust-consent-sdk",
        ".cc-window",
        ".cc-banner",
        "#cookie-law-info-bar",
        "[class*='CookieBanner']",
        "[id*='CookieBanner']",
        "[class*='cookiebanner']",
        "#cookiebanner",
        ".evidon-banner",
        "#_evidon_banner",
        "[class*='cookie-policy']",
      ],
    },
    chat: {
      label: "Chat Widget Remover",
      domains: [],
      global: true,
      selectors: [
        "[id*='intercom']",
        "[class*='intercom-']",
        ".intercom-lightweight-app",
        "#hubspot-messages-iframe-container",
        "[class*='crisp-client']",
        "#crisp-chatbox",
        "[data-id='zsalesiq']",
        "#tidio-chat",
        "#tidio-chat-iframe",
        "#freshworks-container",
        "#fc_widget",
        "[class*='drift-widget']",
        ".drift-widget",
        "#drift-widget",
        "#launcher",
        ".zEWidget-launcher",
        "[id*='zendesk']",
        "[class*='zendesk']",
        "#olark",
        "#olark-wrapper",
        "[class*='tawk-']",
        "#tawkchat-container",
        "[class*='livechat']",
        "#chat-widget-container",
        "#fb-root + div[class]",
      ],
    },
    newsletter: {
      label: "Newsletter Popup Remover",
      domains: [],
      global: true,
      selectors: [
        "[class*='newsletter-popup']",
        "[id*='newsletter-popup']",
        "[class*='subscribe-popup']",
        "[id*='subscribe-popup']",
        "[class*='email-popup']",
        "[id*='email-popup']",
        "[class*='mailchimp-popup']",
        "[id*='mailchimp-popup']",
        "[class*='popup-overlay']",
        "[class*='modal-newsletter']",
        "[id*='modal-newsletter']",
        ".pum-overlay",
        "#pum-1",
        "[class*='optinmonster']",
        "[id*='om-']",
        ".om-overlay",
        "[class*='sumo-']",
        "#sumo-",
        "[class*='klaviyo-form']",
        "[id*='klaviyo-form']",
      ],
    },
  };

  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(["hiddenRules","isPremium","enabledCleaners"], (data) => {
      if (!data.hiddenRules) chrome.storage.local.set({ hiddenRules: {} });
      if (data.isPremium === undefined) chrome.storage.local.set({ isPremium: false });
      if (!data.enabledCleaners) chrome.storage.local.set({ enabledCleaners: {} });
    });
  });

  function countUserRules(rules) {
    return Object.entries(rules)
      .filter(([d]) => d !== GLOBAL_DOMAIN)
      .reduce((s, [,a]) => s + a.length, 0);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_STATE") {
      chrome.storage.local.get(["hiddenRules","isPremium","enabledCleaners"], (data) => {
        const rules = data.hiddenRules || {};
        const total = countUserRules(rules);
        const globalCount = (rules[GLOBAL_DOMAIN] || []).length;
        const cleaners = data.enabledCleaners || {};
        sendResponse({
          rules, isPremium: data.isPremium || false,
          totalCount: total, globalCount,
          freeLimit: FREE_LIMIT,
          canAddMore: data.isPremium || total < FREE_LIMIT,
          enabledCleaners: cleaners,
          cleanerPresets: CLEANER_PRESETS,
        });
      });
      return true;
    }

    if (message.type === "GET_CHECKOUT_URL") { sendResponse({ url: CHECKOUT_URL }); return true; }

    if (message.type === "TOGGLE_CLEANER") {
      chrome.storage.local.get(["isPremium","enabledCleaners"], (data) => {
        if (!data.isPremium) { sendResponse({ success: false, reason: "premium_required" }); return; }
        const cleaners = data.enabledCleaners || {};
        cleaners[message.id] = message.enabled;
        chrome.storage.local.set({ enabledCleaners: cleaners }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "AUTO_CLEAN") {
      chrome.storage.local.get(["isPremium","enabledCleaners"], (data) => {
        if (!data.isPremium) { sendResponse({ success: false, reason: "premium_required" }); return; }
        const cleaners = data.enabledCleaners || {};
        Object.keys(CLEANER_PRESETS).forEach(id => { cleaners[id] = true; });
        chrome.storage.local.set({ enabledCleaners: cleaners }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "GET_CLEANERS_FOR_TAB") {
      chrome.storage.local.get(["enabledCleaners","isPremium"], (data) => {
        if (!data.isPremium) { sendResponse({ selectors: [] }); return; }
        const enabled = data.enabledCleaners || {};
        const domain = message.domain || "";
        const selectors = [];
        Object.entries(CLEANER_PRESETS).forEach(([id, preset]) => {
          if (!enabled[id]) return;
          if (preset.global) {
            selectors.push(...preset.selectors);
          } else {
            const match = preset.domains.some(d => domain === d || domain.endsWith("." + d));
            if (match) selectors.push(...preset.selectors);
          }
        });
        sendResponse({ selectors });
      });
      return true;
    }

    if (message.type === "ADD_RULE") {
      chrome.storage.local.get(["hiddenRules","isPremium"], (data) => {
        const rules = data.hiddenRules || {};
        const isPremium = data.isPremium || false;
        const total = countUserRules(rules);
        if (!isPremium && total >= FREE_LIMIT) { sendResponse({ success: false, reason: "limit_reached" }); return; }
        const domain = message.domain;
        if (!rules[domain]) rules[domain] = [];
        if (!rules[domain].includes(message.selector)) rules[domain].push(message.selector);
        chrome.storage.local.set({ hiddenRules: rules }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "REMOVE_RULE") {
      chrome.storage.local.get(["hiddenRules"], (data) => {
        const rules = data.hiddenRules || {};
        const domain = message.domain;
        if (rules[domain]) {
          rules[domain] = rules[domain].filter(s => s !== message.selector);
          if (rules[domain].length === 0) delete rules[domain];
        }
        chrome.storage.local.set({ hiddenRules: rules }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "UNDO_RULES") {
      chrome.storage.local.get(["hiddenRules"], (data) => {
        const rules = data.hiddenRules || {};
        const { domain, selectors } = message;
        if (rules[domain]) {
          rules[domain] = rules[domain].filter(s => !selectors.includes(s));
          if (rules[domain].length === 0) delete rules[domain];
        }
        chrome.storage.local.set({ hiddenRules: rules }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "UPDATE_RULE") {
      chrome.storage.local.get(["hiddenRules","isPremium"], (data) => {
        if (!data.isPremium) { sendResponse({ success: false, reason: "premium_required" }); return; }
        const rules = data.hiddenRules || {};
        const domain = message.domain;
        if (!rules[domain]) rules[domain] = [];
        const idx = rules[domain].indexOf(message.oldSelector);
        if (idx !== -1) rules[domain][idx] = message.newSelector;
        chrome.storage.local.set({ hiddenRules: rules }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "ADD_GLOBAL_RULE") {
      chrome.storage.local.get(["hiddenRules","isPremium"], (data) => {
        if (!data.isPremium) { sendResponse({ success: false, reason: "premium_required" }); return; }
        const rules = data.hiddenRules || {};
        if (!rules[GLOBAL_DOMAIN]) rules[GLOBAL_DOMAIN] = [];
        const sel = message.selector;
        if (!rules[GLOBAL_DOMAIN].includes(sel)) rules[GLOBAL_DOMAIN].push(sel);
        chrome.storage.local.set({ hiddenRules: rules }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "REMOVE_GLOBAL_RULE") {
      chrome.storage.local.get(["hiddenRules","isPremium"], (data) => {
        if (!data.isPremium) { sendResponse({ success: false, reason: "premium_required" }); return; }
        const rules = data.hiddenRules || {};
        if (rules[GLOBAL_DOMAIN]) {
          rules[GLOBAL_DOMAIN] = rules[GLOBAL_DOMAIN].filter(s => s !== message.selector);
          if (rules[GLOBAL_DOMAIN].length === 0) delete rules[GLOBAL_DOMAIN];
        }
        chrome.storage.local.set({ hiddenRules: rules }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "APPLY_PRESETS") {
      chrome.storage.local.get(["hiddenRules","isPremium"], (data) => {
        if (!data.isPremium) { sendResponse({ success: false, reason: "premium_required" }); return; }
        const rules = data.hiddenRules || {};
        if (!rules[GLOBAL_DOMAIN]) rules[GLOBAL_DOMAIN] = [];
        let added = 0;
        PRESET_SELECTORS.forEach(sel => {
          if (!rules[GLOBAL_DOMAIN].includes(sel)) { rules[GLOBAL_DOMAIN].push(sel); added++; }
        });
        chrome.storage.local.set({ hiddenRules: rules }, () => sendResponse({ success: true, added }));
      });
      return true;
    }

    if (message.type === "ACTIVATE_PREMIUM") {
      const licenseKey = message.code.trim();
      fetch(`${API_BASE_URL}/license/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: licenseKey }),
      }).then(r => r.json()).then(data => {
        if (data.valid) {
          chrome.storage.local.set({ isPremium: true, licenseKey }, () => sendResponse({ success: true }));
        } else {
          sendResponse({ success: false, reason: "invalid_code", error: data.error });
        }
      }).catch(() => sendResponse({ success: false, reason: "network_error" }));
      return true;
    }

    if (message.type === "GET_RULES_FOR_TAB") {
      chrome.storage.local.get(["hiddenRules","isPremium"], (data) => {
        const rules = data.hiddenRules || {};
        sendResponse({
          selectors: rules[message.domain] || [],
          globalSelectors: rules[GLOBAL_DOMAIN] || [],
          isPremium: data.isPremium || false,
        });
      });
      return true;
    }

    if (message.type === "CLEAR_ALL_RULES") {
      chrome.storage.local.set({ hiddenRules: {} }, () => sendResponse({ success: true }));
      return true;
    }

    if (message.type === "CLEAR_DOMAIN_RULES") {
      chrome.storage.local.get(["hiddenRules"], (data) => {
        const rules = data.hiddenRules || {};
        delete rules[message.domain];
        chrome.storage.local.set({ hiddenRules: rules }, () => sendResponse({ success: true }));
      });
      return true;
    }

    if (message.type === "IMPORT_RULES") {
      chrome.storage.local.get(["hiddenRules","isPremium"], (data) => {
        const existing = data.hiddenRules || {};
        const incoming = message.rules || {};
        for (const [domain, selectors] of Object.entries(incoming)) {
          if (!Array.isArray(selectors)) continue;
          if (!existing[domain]) existing[domain] = [];
          for (const s of selectors) {
            if (typeof s === "string" && !existing[domain].includes(s)) existing[domain].push(s);
          }
        }
        chrome.storage.local.set({ hiddenRules: existing }, () => {
          const total = countUserRules(existing);
          sendResponse({ success: true, totalCount: total });
        });
      });
      return true;
    }
  });
