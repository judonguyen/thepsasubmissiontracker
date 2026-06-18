// Minimal Stripe REST client (no SDK). Form-encodes params (incl. nested
// arrays/objects in Stripe's bracket notation) and calls the API with the
// secret key from STRIPE_SECRET_KEY.

function key() { return (process.env.STRIPE_SECRET_KEY || "").trim(); }

// Flatten { a: { b: 1 }, list: [{ x: 2 }] } → "a[b]=1&list[0][x]=2".
function encode(obj, prefix, out) {
  out = out || [];
  for (const k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const field = prefix ? prefix + "[" + k + "]" : k;
    if (typeof v === "object") encode(v, field, out);
    else out.push(encodeURIComponent(field) + "=" + encodeURIComponent(v));
  }
  return out;
}

async function call(method, path, params) {
  const k = key();
  if (!k) throw new Error("Stripe is not configured (missing STRIPE_SECRET_KEY).");
  const opts = { method: method, headers: { Authorization: "Bearer " + k } };
  if (params && method !== "GET") {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = encode(params).join("&");
  }
  const r = await fetch("https://api.stripe.com" + path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error((data && data.error && data.error.message) || ("Stripe error " + r.status));
  return data;
}

module.exports = {
  createCheckoutSession: function (p) { return call("POST", "/v1/checkout/sessions", p); },
  getSession: function (id) { return call("GET", "/v1/checkout/sessions/" + encodeURIComponent(id) + "?expand[]=subscription", null); },
  getEvent: function (id) { return call("GET", "/v1/events/" + encodeURIComponent(id), null); },
  getPrice: function (id) { return call("GET", "/v1/prices/" + encodeURIComponent(id), null); }
};
