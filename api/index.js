const crypto = require("crypto");

const LEMON_API_KEY = process.env.LEMON_API_KEY;
const PRODUCT_ID = "1144322";
const SECRET = process.env.LICENSE_SECRET;
if (!SECRET) throw new Error("LICENSE_SECRET env var is required");

// Upstash Redis — HTTP REST API (no npm install needed!)
const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: JSON.stringify(value) }),
  });
}

async function redisIncr(key) {
  const res = await fetch(`${REDIS_URL}/incr/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result;
}

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
    // Проверка подписи от LemonSqueezy
    const sigHeader = req.headers["x-signature"];
    if (sigHeader && process.env.LEMON_WEBHOOK_SECRET) {
      const body = JSON.stringify(req.body);
      const expected = crypto
        .createHmac("sha256", process.env.LEMON_WEBHOOK_SECRET)
        .update(body)
        .digest("hex");
      if (sigHeader !== expected) {
        console.warn("⚠️ Invalid webhook signature");
        return res.status(401).json({ error: "invalid signature" });
      }
    }

    const event = req.body;
    if (event?.meta?.event_name === "order_created") {
      const order = event.data?.attributes;
      const orderId = String(event.data?.id);
      const email = order?.user_email;
      const productId = String(order?.first_order_item?.product_id);

      if (productId === PRODUCT_ID && email) {
        const key = generateLicense(orderId, email);
        await redisSet(`license:${key}`, {
          email,
          orderId,
          createdAt: new Date().toISOString(),
        });
        await redisIncr("licenses:count");
        console.log(`✅ Лицензия выдана: ${key} → ${email}`);
      }
    }
    return res.json({ ok: true });
  }

  // Проверка лицензионного ключа из расширения
  if (path === "/license/validate" && req.method === "POST") {
    const { key } = req.body || {};
    if (!key) return res.json({ valid: false, error: "no_key" });

    const normalizedKey = key.trim().toUpperCase();

    // Проверяем в Redis
    const license = await redisGet(`license:${normalizedKey}`);
    if (license) {
      return res.json({ valid: true, email: license.email });
    }

    // Проверяем через LemonSqueezy API напрямую
    if (LEMON_API_KEY) {
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
            const licenseData = {
              email: lk.attributes.user_email || "unknown",
              orderId: lk.attributes.order_id,
              createdAt: lk.attributes.created_at,
            };
            // Кэшируем в Redis чтобы не дёргать LemonSqueezy каждый раз
            await redisSet(`license:${normalizedKey}`, licenseData);
            return res.json({ valid: true });
          }
        }
      } catch (e) {
        console.error("LemonSqueezy API error:", e);
      }
    }

    return res.json({ valid: false, error: "invalid_key" });
  }

  // Healthcheck
  if (path === "/" || path === "") {
    const count = await redisGet("licenses:count") || 0;
    return res.json({ status: "ok", licenses: count });
  }

  return res.status(404).json({ error: "not found" });
};
