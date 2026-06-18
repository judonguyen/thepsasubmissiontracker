// Public: starts a Stripe Checkout subscription for a new tracker. Reserves the
// chosen name for an hour so two shops can't grab it mid-signup.
const { getJSON, cmd } = require("../lib/store.js");
const { createCheckoutSession } = require("../lib/stripe.js");

const NAME_RE = /^[A-Za-z0-9_-]{2,40}$/;
function str(v) { return (v === null || v === undefined) ? "" : String(v); }

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const name = str(body.name).trim();
  const email = str(body.email).trim();
  if (!NAME_RE.test(name)) {
    return res.status(400).json({ ok: false, error: "Tracker name must be 2-40 characters: letters, numbers, hyphens or underscores (no spaces)." });
  }
  const priceId = (process.env.STRIPE_PRICE_ID || "").trim();
  if (!priceId) return res.status(500).json({ ok: false, error: "Billing is not configured yet." });

  try {
    if (await getJSON("psatracker:" + name.toLowerCase())) {
      return res.status(409).json({ ok: false, error: "That name is taken — pick another." });
    }
    let pending = null;
    try { pending = await cmd(["GET", "psapending:" + name.toLowerCase()]); } catch (e) {}
    if (pending) return res.status(409).json({ ok: false, error: "Someone is signing up with that name right now — try another." });

    const proto = str(req.headers["x-forwarded-proto"]) || "https";
    const base = proto + "://" + str(req.headers.host);

    const session = await createCheckoutSession({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: base + "/setup?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: base + "/signup",
      customer_email: email || undefined,
      allow_promotion_codes: true,
      metadata: { name: name, email: email },
      subscription_data: { metadata: { name: name } }
    });

    // Soft-hold the name during checkout.
    try { await cmd(["SET", "psapending:" + name.toLowerCase(), email || "1", "EX", "3600"]); } catch (e) {}

    return res.status(200).json({ ok: true, url: session.url });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
