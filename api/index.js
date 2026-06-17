// Valid license keys — stored in Vercel env var VALID_KEYS as comma-separated list
// Example VALID_KEYS value: "SMRT-A1B2-C3D4-E5F6,SMRT-G7H8-I9J0-K1L2,..."
//
// To add keys: go to Vercel → Settings → Environment Variables → VALID_KEYS
// Paste all 200 keys separated by commas, then redeploy.

function getValidKeys() {
  const raw = process.env.VALID_KEYS || "";
  return new Set(
    raw.split(",")
      .map(k => k.trim().toUpperCase())
      .filter(k => k.length > 0)
  );
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const path = req.url.replace(/^\/api/, "");

  // License key validation
  if (path === "/license/validate" && req.method === "POST") {
    const { key } = req.body || {};
    if (!key) return res.json({ valid: false, error: "no_key" });

    const trimmedKey = key.trim().toUpperCase();
    const validKeys = getValidKeys();

    if (validKeys.size === 0) {
      console.error("VALID_KEYS env var is not set on Vercel!");
      return res.json({ valid: false, error: "server_misconfigured" });
    }

    if (validKeys.has(trimmedKey)) {
      return res.json({ valid: true });
    }

    return res.json({ valid: false, error: "invalid_key" });
  }

  // Healthcheck
  if (path === "/" || path === "") {
    return res.json({ status: "ok", version: "2.1.0" });
  }

  return res.status(404).json({ error: "not found" });
};
