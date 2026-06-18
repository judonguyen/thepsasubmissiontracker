// Public: after Checkout, confirms the session is paid and returns the reserved
// name so the setup page can show it. Does not expose anything sensitive.
const { getSession } = require("../lib/stripe.js");

module.exports = async function handler(req, res) {
  const id = ((req.query && req.query.session_id) || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "Missing session." });
  try {
    const s = await getSession(id);
    const sub = s.subscription && typeof s.subscription === "object" ? s.subscription : null;
    const paid = s.payment_status === "paid" || (sub && (sub.status === "active" || sub.status === "trialing"));
    if (!paid) return res.status(200).json({ ok: false, error: "Payment isn't complete yet." });
    return res.status(200).json({
      ok: true,
      name: (s.metadata && s.metadata.name) || "",
      email: (s.customer_details && s.customer_details.email) || (s.metadata && s.metadata.email) || ""
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
