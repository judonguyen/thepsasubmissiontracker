// Stripe webhook. Keeps each tracker's active flag in sync with its
// subscription: cancelled / payment-failed -> deactivate; active/trialing /
// paid -> reactivate. The shop's config (and PSA token) is kept either way.
//
// Authenticity is verified by RE-FETCHING the event from Stripe by id (a forged
// event id won't exist), so no webhook signing secret / raw body is needed.
const { getJSON, setJSON, cmd } = require("../lib/store.js");
const { getEvent } = require("../lib/stripe.js");

async function setActiveBySub(subId, active) {
  if (!subId) return;
  let name = null;
  try { name = await cmd(["GET", "psasub:" + subId]); } catch (e) { return; }
  if (!name) return;
  const key = "psatracker:" + String(name).toLowerCase();
  const cfg = await getJSON(key);
  if (!cfg || cfg.active === active) return;
  cfg.active = active;
  cfg.updated = new Date().toISOString();
  await setJSON(key, cfg);
}

module.exports = async function handler(req, res) {
  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    if (!body.id) return res.status(400).json({ received: false });

    // Re-fetch to confirm the event is genuine.
    let ev;
    try { ev = await getEvent(body.id); } catch (e) { return res.status(200).json({ received: true, note: "unverified" }); }

    const obj = (ev.data && ev.data.object) ? ev.data.object : {};
    switch (ev.type) {
      case "customer.subscription.deleted":
        await setActiveBySub(obj.id, false); break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await setActiveBySub(obj.id, obj.status === "active" || obj.status === "trialing"); break;
      case "invoice.payment_failed":
        await setActiveBySub(obj.subscription, false); break;
      case "invoice.paid":
        await setActiveBySub(obj.subscription, true); break;
      default: break;
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    return res.status(200).json({ received: true, error: String(e.message || e) });
  }
};
