// Creates (or updates) a card shop's tracker. Protected by an admin password
// (ADMIN_PASSWORD env var). Stores the shop's config in Upstash under
// "psatracker:<lowercased name>".

const { getJSON, setJSON } = require("../lib/store.js");

function str(v) { return (v === null || v === undefined) ? "" : String(v); }

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST." });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const admin = process.env.ADMIN_PASSWORD || "";
  if (!admin) return res.status(500).json({ ok: false, error: "Server is missing ADMIN_PASSWORD." });
  if (str(body.password) !== admin) {
    return res.status(401).json({ ok: false, error: "Wrong admin password." });
  }

  const name = str(body.name).trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(name)) {
    return res.status(400).json({ ok: false, error: "Tracker name must be 2-40 characters: letters, numbers, hyphens or underscores only (no spaces)." });
  }

  const token = str(body.token).trim();
  if (token.length < 10) {
    return res.status(400).json({ ok: false, error: "Please paste a valid PSA token for this shop." });
  }

  const logoUrl = str(body.logoUrl).trim();
  const siteUrl = str(body.siteUrl).trim();
  for (const [label, u] of [["logo image", logoUrl], ["website", siteUrl]]) {
    if (u && !/^https?:\/\//i.test(u)) {
      return res.status(400).json({ ok: false, error: "The " + label + " URL must start with http:// or https://" });
    }
  }

  const key = "psatracker:" + name.toLowerCase();
  let existing = null;
  try { existing = await getJSON(key); } catch (e) {
    return res.status(500).json({ ok: false, error: "Storage unavailable: " + String(e.message || e) });
  }

  const now = new Date().toISOString();
  const cfg = {
    name: name,
    token: token,
    logoUrl: logoUrl,
    siteUrl: siteUrl,
    created: existing && existing.created ? existing.created : now,
    updated: now
  };

  try { await setJSON(key, cfg); } catch (e) {
    return res.status(500).json({ ok: false, error: "Could not save: " + String(e.message || e) });
  }

  const proto = str(req.headers["x-forwarded-proto"]) || "https";
  const host = str(req.headers.host);
  return res.status(200).json({
    ok: true,
    name: name,
    url: proto + "://" + host + "/" + name,
    existed: !!existing
  });
};
