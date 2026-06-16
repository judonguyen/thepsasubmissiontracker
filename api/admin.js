// Admin backend for managing card-shop trackers. Every action requires the
// admin password (ADMIN_PASSWORD env var). Handles: list, save (create/update/
// rename + activate/deactivate), and delete.
//
// Security: tokens are NEVER returned to the browser. "list" reports only
// whether a token is set. On "save", a blank token means "keep the current one".

const { cmd, getJSON, setJSON } = require("../lib/store.js");

function str(v) { return (v === null || v === undefined) ? "" : String(v); }
const NAME_RE = /^[A-Za-z0-9_-]{2,40}$/;
const keyFor = (n) => "psatracker:" + n.toLowerCase();

async function listTrackers() {
  const keys = (await cmd(["KEYS", "psatracker:*"])) || [];
  const out = [];
  for (const k of keys) {
    const cfg = await getJSON(k);
    if (!cfg || !cfg.name) continue;
    out.push({
      name: cfg.name,
      logoUrl: cfg.logoUrl || "",
      siteUrl: cfg.siteUrl || "",
      active: cfg.active !== false,   // older records without the flag count as active
      hasToken: !!cfg.token,
      created: cfg.created || "",
      updated: cfg.updated || ""
    });
  }
  out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const admin = process.env.ADMIN_PASSWORD || "";
  if (!admin) return res.status(500).json({ ok: false, error: "Server is missing ADMIN_PASSWORD." });
  if (str(body.password) !== admin) return res.status(401).json({ ok: false, error: "Wrong admin password." });

  const action = str(body.action) || "list";

  try {
    if (action === "list") {
      return res.status(200).json({ ok: true, trackers: await listTrackers() });
    }

    if (action === "delete") {
      const name = str(body.name).trim();
      if (!NAME_RE.test(name)) return res.status(400).json({ ok: false, error: "Invalid tracker name." });
      await cmd(["DEL", keyFor(name)]);
      return res.status(200).json({ ok: true });
    }

    if (action === "save") {
      const name = str(body.name).trim();
      if (!NAME_RE.test(name)) {
        return res.status(400).json({ ok: false, error: "Tracker name must be 2-40 characters: letters, numbers, hyphens or underscores only (no spaces)." });
      }
      const original = str(body.originalName).trim();           // set when editing an existing tracker
      const isRename = original && original.toLowerCase() !== name.toLowerCase();

      // Load the existing record (by its original name when editing).
      const existing = original ? await getJSON(keyFor(original)) : await getJSON(keyFor(name));

      // Name-collision checks.
      if (!original && existing) {
        return res.status(409).json({ ok: false, error: 'A tracker named "' + name + '" already exists. Edit that one instead.' });
      }
      if (isRename && await getJSON(keyFor(name))) {
        return res.status(409).json({ ok: false, error: 'A tracker named "' + name + '" already exists.' });
      }

      // Token: keep the current one if the field was left blank.
      let token = str(body.token).trim();
      if (!token) {
        if (existing && existing.token) token = existing.token;
        else return res.status(400).json({ ok: false, error: "Please paste a PSA token for this shop." });
      }
      if (token.length < 10) return res.status(400).json({ ok: false, error: "That PSA token looks too short." });

      const logoUrl = str(body.logoUrl).trim();
      const siteUrl = str(body.siteUrl).trim();
      for (const [label, u] of [["logo image", logoUrl], ["website", siteUrl]]) {
        if (u && !/^https?:\/\//i.test(u)) {
          return res.status(400).json({ ok: false, error: "The " + label + " URL must start with http:// or https://" });
        }
      }
      const active = body.active === false ? false : true;

      const now = new Date().toISOString();
      const cfg = {
        name: name, token: token, logoUrl: logoUrl, siteUrl: siteUrl, active: active,
        created: existing && existing.created ? existing.created : now,
        updated: now
      };
      await setJSON(keyFor(name), cfg);
      if (isRename) await cmd(["DEL", keyFor(original)]);

      const proto = str(req.headers["x-forwarded-proto"]) || "https";
      const host = str(req.headers.host);
      return res.status(200).json({ ok: true, name: name, url: proto + "://" + host + "/" + name, renamed: isRename, existed: !!existing });
    }

    return res.status(400).json({ ok: false, error: "Unknown action." });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error: " + String(e.message || e) });
  }
};
