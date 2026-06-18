// Public BUT authorized by a paid Stripe session (not the admin password):
// creates the shop's tracker after they pay, storing the Stripe IDs so the
// webhook can deactivate/reactivate it with the subscription.
const { getJSON, setJSON, cmd } = require("../lib/store.js");
const { getSession } = require("../lib/stripe.js");

const NAME_RE = /^[A-Za-z0-9_-]{2,40}$/;
function str(v) { return (v === null || v === undefined) ? "" : String(v); }

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const sid = str(body.session_id).trim();
  if (!sid) return res.status(400).json({ ok: false, error: "Missing session." });

  try {
    const s = await getSession(sid);
    const sub = s.subscription && typeof s.subscription === "object" ? s.subscription : null;
    const paid = s.payment_status === "paid" || (sub && (sub.status === "active" || sub.status === "trialing"));
    if (!paid) return res.status(402).json({ ok: false, error: "Payment isn't complete." });

    const name = str(s.metadata && s.metadata.name).trim();
    if (!NAME_RE.test(name)) return res.status(400).json({ ok: false, error: "Invalid reserved name on this session." });

    const subId = sub ? sub.id : (typeof s.subscription === "string" ? s.subscription : "");
    const custId = (typeof s.customer === "string") ? s.customer : (s.customer && s.customer.id) || "";

    const key = "psatracker:" + name.toLowerCase();
    const existing = await getJSON(key);
    // Guard: name owned by a different subscription = taken.
    if (existing && existing.stripeSubscriptionId && existing.stripeSubscriptionId !== subId) {
      return res.status(409).json({ ok: false, error: "That tracker name is already taken." });
    }

    const token = str(body.token).trim();
    if (token.length < 10) return res.status(400).json({ ok: false, error: "Please paste a valid PSA token." });
    const logoUrl = str(body.logoUrl).trim();
    const siteUrl = str(body.siteUrl).trim();
    for (const pair of [["logo image", logoUrl], ["website", siteUrl]]) {
      if (pair[1] && !/^https?:\/\//i.test(pair[1])) {
        return res.status(400).json({ ok: false, error: "The " + pair[0] + " URL must start with http:// or https://" });
      }
    }

    const now = new Date().toISOString();
    const cfg = Object.assign({}, existing || {}, {
      name: name, token: token, logoUrl: logoUrl, siteUrl: siteUrl, active: true,
      plan: "subscription",
      email: (s.customer_details && s.customer_details.email) || str(s.metadata && s.metadata.email),
      stripeCustomerId: custId, stripeSubscriptionId: subId,
      created: existing && existing.created ? existing.created : now, updated: now
    });
    await setJSON(key, cfg);
    if (subId) { try { await cmd(["SET", "psasub:" + subId, name.toLowerCase()]); } catch (e) {} }
    try { await cmd(["DEL", "psapending:" + name.toLowerCase()]); } catch (e) {}

    const proto = str(req.headers["x-forwarded-proto"]) || "https";
    return res.status(200).json({ ok: true, name: name, url: proto + "://" + str(req.headers.host) + "/" + name });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
