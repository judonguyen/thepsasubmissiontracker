// Signup page: show the price, live-check the chosen name, then start Stripe Checkout.

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const nameInput = document.getElementById("name");
const preview = document.getElementById("urlPreview");
const avail = document.getElementById("avail");
let nameOk = false;

// Plan price
(async function () {
  try {
    const p = await (await fetch("/api/plan")).json();
    const el = document.getElementById("price");
    if (p && p.ok && p.amount != null) {
      el.innerHTML = '<span class="amt">$' + p.amount + '</span> <span class="per">/ ' + esc(p.interval) + ' (' + esc(p.currency) + ')</span>';
    } else {
      el.innerHTML = '<span class="muted-note">' + esc((p && p.error) || "Plan unavailable.") + '</span>';
    }
  } catch (e) { document.getElementById("price").innerHTML = '<span class="muted-note">Plan unavailable.</span>'; }
})();

// Live name availability (debounced)
let t = null;
nameInput.addEventListener("input", function () {
  const v = nameInput.value.trim();
  preview.textContent = "/" + (v || "yourshopname");
  nameOk = false;
  avail.textContent = "";
  avail.className = "avail";
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(v)) {
    if (v) { avail.textContent = "Use 2-40 letters, numbers, hyphens or underscores (no spaces)."; avail.className = "avail no"; }
    return;
  }
  avail.textContent = "Checking…";
  clearTimeout(t);
  t = setTimeout(async function () {
    try {
      const r = await (await fetch("/api/check-name?name=" + encodeURIComponent(v))).json();
      if (r && r.ok && r.available) { avail.textContent = "✓ /" + v + " is available"; avail.className = "avail ok"; nameOk = true; }
      else { avail.textContent = "✗ That name is taken — try another."; avail.className = "avail no"; nameOk = false; }
    } catch (e) { avail.textContent = ""; }
  }, 350);
});

document.getElementById("signupForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const msg = document.getElementById("msg");
  const btn = document.getElementById("goBtn");
  const name = nameInput.value.trim();
  const email = document.getElementById("email").value.trim();

  if (!/^[A-Za-z0-9_-]{2,40}$/.test(name)) {
    msg.innerHTML = '<div class="error-msg">Enter a valid tracker name (2-40 letters, numbers, hyphens or underscores).</div>';
    return;
  }
  if (!nameOk) {
    msg.innerHTML = '<div class="error-msg">That name isn\'t available — pick another.</div>';
    return;
  }
  btn.disabled = true;
  msg.innerHTML = '<div class="muted-note" style="margin-top:14px">Starting secure checkout…</div>';
  try {
    const r = await (await fetch("/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, email: email })
    })).json();
    if (r && r.ok && r.url) { window.location.href = r.url; return; }
    msg.innerHTML = '<div class="error-msg">' + esc((r && r.error) || "Could not start checkout.") + '</div>';
    btn.disabled = false;
  } catch (err) {
    msg.innerHTML = '<div class="error-msg">Network error: ' + esc(String(err)) + '</div>';
    btn.disabled = false;
  }
});
