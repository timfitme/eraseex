const PAYHIP_API_KEY = process.env.PAYHIP_API_KEY;
const PAYHIP_PRODUCT_LINK = process.env.PAYHIP_PRODUCT_LINK || "SHc4b";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  const url = req.url || "";
  const path = url.replace(/^\/api/, "").split("?")[0];
  if (path === "/" || path === "" || path === "/health") {
    return res.json({ status: "ok", version: "2.2.0" });
  }
  if (path === "/webhook") return res.json({ ok: true });
  if (path === "/license/validate") {
    const body = req.body || {};
    const key = typeof body === "string" ? JSON.parse(body).key : body.key;
    if (!key) return res.json({ valid: false, error: "no_key" });
    const trimmedKey = key.trim();
    if (!PAYHIP_API_KEY) return res.json({ valid: false, error: "server_misconfigured" });
    try {
      const params = new URLSearchParams({ product_link: PAYHIP_PRODUCT_LINK, license_key: trimmedKey });
      const validateRes = await fetch(`https://payhip.com/api/v1/license/verify?${params.toString()}`, {
        method: "GET",
        headers: { "payhip-api-key": PAYHIP_API_KEY, "Accept": "application/json" },
      });
      const text = await validateRes.text();
      let data;
      try { data = JSON.parse(text); } catch { data = null; }
      if (!data || !data.data || Array.isArray(data.data)) return res.json({ valid: false, error: "invalid_key" });
      const d = data.data;
      const keyMatch = d.license_key && d.license_key.toUpperCase() === trimmedKey.toUpperCase();
      const isEnabled = d.enabled !== false && d.enabled !== 0 && d.enabled !== "false";
      if (keyMatch && isEnabled) return res.json({ valid: true, email: d.buyer_email || "" });
      return res.json({ valid: false, error: "key_disabled" });
    } catch (e) {
      return res.json({ valid: false, error: "network_error" });
    }
  }
  return res.status(404).json({ error: "not found", path });
};
