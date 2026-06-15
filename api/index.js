const LEMON_API_KEY = process.env.LEMON_API_KEY;
  const PRODUCT_ID = "1144322";

  module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    const path = req.url.replace(/^\/api/, "");

    // Webhook from LemonSqueezy — just acknowledge
    if (path === "/webhook" && req.method === "POST") {
      return res.json({ ok: true });
    }

    // License key validation — stateless, always calls LemonSqueezy API directly
    if (path === "/license/validate" && req.method === "POST") {
      const { key } = req.body || {};
      if (!key) return res.json({ valid: false, error: "no_key" });

      const trimmedKey = key.trim();

      if (!LEMON_API_KEY) {
        console.error("LEMON_API_KEY is not set on Vercel!");
        return res.json({ valid: false, error: "server_misconfigured" });
      }

      try {
        const validateRes = await fetch(
          "https://api.lemonsqueezy.com/v1/licenses/validate",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LEMON_API_KEY}`,
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              license_key: trimmedKey,
              instance_name: "chrome-extension",
            }),
          }
        );

        const data = await validateRes.json();
        console.log("LS validate response:", JSON.stringify(data));

        if (data && data.valid === true) {
          const productId = String((data.license_key && data.license_key.attributes && data.license_key.attributes.product_id) || "");
          if (productId && PRODUCT_ID && productId !== PRODUCT_ID) {
            return res.json({ valid: false, error: "wrong_product" });
          }
          return res.json({ valid: true, email: (data.meta && data.meta.customer_email) || "" });
        }

        return res.json({ valid: false, error: (data && data.error) || "invalid_key" });
      } catch (e) {
        console.error("LemonSqueezy API error:", e.message);
        return res.json({ valid: false, error: "network_error" });
      }
    }

    // Healthcheck
    if (path === "/" || path === "") {
      return res.json({ status: "ok", version: "2.0.0" });
    }

    return res.status(404).json({ error: "not found" });
  };
  
