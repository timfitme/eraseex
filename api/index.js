const crypto = require("crypto");

const LEMON_API_KEY = process.env.LEMON_API_KEY;
const PRODUCT_ID = "1144322";
const SECRET = process.env.LICENSE_SECRET || "smart-eraser-secret-2024";

// In-memory store (Vercel serverless resets, use KV for production)
const licenses = global._licenses || (global._licenses = new Map());

function generateLicense(orderId, email) {
  return (
    "SE-" +
    crypto
      .createHash("sha256")
      .update(orderId + email + SECRET)
      .digest("hex")
      .toUpperCase()
      .slice(0, 24)
  );
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const path = req.url.replace(/^\/api/, "");

  // Webhook от LemonSqueezy — срабатывает после оплаты
  if (path === "/webhook" && req.method === "POST") {
    const event = req.body;
    if (event?.meta?.event_name === "order_created") {
      const order = event.data?.attributes;
      const orderId = String(event.data?.id);
      const email = order?.user_email;
      const productId = String(order?.first_order_item?.product_id);

      if (productId === PRODUCT_ID && email) {
        const key = generateLicense(orderId, email);
        licenses.set(key, { email, orderId, createdAt: new Date().toISOString() });
        console.log(`✅ Лицензия выдана: ${key} → ${email}`);
      }
    }
    return res.json({ ok: true });
  }

  // Проверка лицензионного ключа из расширения
  if (path === "/license/validate" && req.method === "POST") {
    const { key } = req.body || {};
    if (!key) return res.json({ valid: false, error: "no_key" });

    const license = licenses.get(key.trim().toUpperCase());
    if (license) {
      return res.json({ valid: true, email: license.email });
    }

    // Также проверим через LemonSqueezy API напрямую
    try {
      const response = await fetch(
        `https://api.lemonsqueezy.com/v1/license-keys?filter[key]=${encodeURIComponent(key)}`,
        {
          headers: {
            Authorization: `Bearer ${LEMON_API_KEY}`,
            Accept: "application/json",
          },
        }
      );
      const data = await response.json();
      if (data?.data?.length > 0) {
        const lk = data.data[0];
        if (lk.attributes.status === "active") {
          licenses.set(key.trim().toUpperCase(), {
            email: lk.attributes.user_email || "unknown",
            orderId: lk.attributes.order_id,
            createdAt: lk.attributes.created_at,
          });
          return res.json({ valid: true });
        }
      }
    } catch (e) {
      console.error("LemonSqueezy API error:", e);
    }

    return res.json({ valid: false, error: "invalid_key" });
  }

  // Healthcheck
  if (path === "/" || path === "") {
    return res.json({ status: "ok", licenses: licenses.size });
  }

  return res.status(404).json({ error: "not found" });
};

