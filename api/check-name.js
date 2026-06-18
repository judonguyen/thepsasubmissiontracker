// Public: is a tracker name available? (Not already taken, not mid-signup.)
const { getJSON, cmd } = require("../lib/store.js");
const NAME_RE = /^[A-Za-z0-9_-]{2,40}$/;

module.exports = async function handler(req, res) {
  const name = ((req.query && req.query.name) || "").trim();
  if (!NAME_RE.test(name)) return res.status(200).json({ ok: true, available: false, reason: "format" });
  try {
    const taken = await getJSON("psatracker:" + name.toLowerCase());
    let pending = null;
    try { pending = await cmd(["GET", "psapending:" + name.toLowerCase()]); } catch (e) {}
    return res.status(200).json({ ok: true, available: !taken && !pending });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
