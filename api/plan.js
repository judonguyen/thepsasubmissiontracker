// Public: returns the subscription price for display on the signup page.
const { getPrice } = require("../lib/stripe.js");

module.exports = async function handler(req, res) {
  try {
    const id = (process.env.STRIPE_PRICE_ID || "").trim();
    if (!id) return res.status(200).json({ ok: false, error: "No plan configured yet." });
    const p = await getPrice(id);
    return res.status(200).json({
      ok: true,
      amount: (p.unit_amount != null) ? (p.unit_amount / 100) : null,
      currency: (p.currency || "usd").toUpperCase(),
      interval: p.recurring ? p.recurring.interval : "month"
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
