const PAYHIP_API_KEY = process.env.PAYHIP_API_KEY;
const PAYHIP_PRODUCT_LINK = process.env.PAYHIP_PRODUCT_LINK;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const url = req.url || "";
  const path = url.replace(/^\/api/, "").split("?")[0];

  if (path === "/" || path === "" || path === "/health") {
    return res.json({ status: "ok", version: "2.1.0" });
  }

  if (path === "/webhook") {
    return res.json({ ok: true });
  }

  if (path === "/license/validate") {
    const { key } = req.body || {};
    if (!key) return res.json({ valid: false, error: "no_key" });

    const trimmedKey = key.trim();

    if (!PAYHIP_API_KEY || !PAYHIP_PRODUCT_LINK) {
      return res.json({ valid: false, error: "server_misconfigured" });
    }

    // Пробуем разные форматы product_link
    const formats = [
      PAYHIP_PRODUCT_LINK,           // b/SHc4b (как есть)
      PAYHIP_PRODUCT_LINK.replace(/^b\//, ""), // SHc4b (без b/)
    ];

    for (const productLink of formats) {
      try {
        const params = new URLSearchParams({
          product_link: productLink,
          license_key: trimmedKey,
        });

        const validateRes = await fetch(
          `https://payhip.com/api/v1/license/verify?${params.toString()}`,
          {
            method: "GET",
            headers: {
              "payhip-api-key": PAYHIP_API_KEY,
              Accept: "application/json",
            },
          }
        );

        const data = await validateRes.json();
        console.log(`Payhip [${productLink}]:`, JSON.stringify(data));

        if (data && data.data && data.data.enabled === true) {
          return res.json({ valid: true, email: data.data.customer_email || "" });
        }

        // Если ключ найден но не enabled — сразу возвращаем false
        if (data && data.data) {
          return res.json({ valid: false, error: "key_disabled" });
        }

      } catch (e) {
        console.error("Payhip error:", e.message);
      }
    }

    return res.json({ valid: false, error: "invalid_key" });
  }

  return res.status(404).json({ error: "not found", path });
};
