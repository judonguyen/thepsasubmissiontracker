// Post-payment setup: verify the Stripe session, collect the PSA token +
// branding, then provision the tracker live (with its QR code).

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function qrDataUrl(text) {
  try { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createDataURL(5, 12); } catch (e) { return ""; }
}

const params = new URLSearchParams(window.location.search);
const sessionId = params.get("session_id") || "";
let trackerName = "";

(async function () {
  const gate = document.getElementById("gate");
  if (!sessionId) { gate.innerHTML = '<div class="error-msg">Missing checkout session. Start at <a href="/signup">/signup</a>.</div>'; return; }
  try {
    const info = await (await fetch("/api/setup-info?session_id=" + encodeURIComponent(sessionId))).json();
    if (!info || !info.ok) {
      gate.innerHTML = '<div class="error-msg">' + esc((info && info.error) || "Could not confirm payment.") +
        ' If you just paid, refresh in a moment.</div>';
      return;
    }
    trackerName = info.name;
    document.getElementById("urlShow").textContent = window.location.origin + "/" + trackerName;
    gate.style.display = "none";
    document.getElementById("setup").style.display = "block";
  } catch (e) {
    gate.innerHTML = '<div class="error-msg">Network error confirming payment. Refresh to try again.</div>';
  }
})();

document.getElementById("setupForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const msg = document.getElementById("msg");
  const btn = document.getElementById("goLive");
  const token = document.getElementById("token").value.trim();
  if (token.length < 10) { msg.innerHTML = '<div class="error-msg">Paste your PSA token.</div>'; return; }

  btn.disabled = true;
  msg.innerHTML = '<div class="muted-note" style="margin-top:12px">Launching…</div>';
  try {
    const r = await (await fetch("/api/provision", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId, token: token,
        logoUrl: document.getElementById("logoUrl").value.trim(),
        siteUrl: document.getElementById("siteUrl").value.trim()
      })
    })).json();
    if (!r || !r.ok) { msg.innerHTML = '<div class="error-msg">' + esc((r && r.error) || "Could not launch.") + '</div>'; btn.disabled = false; return; }

    const qr = qrDataUrl(r.url);
    document.getElementById("setup").style.display = "none";
    const done = document.getElementById("done");
    done.style.display = "block";
    done.innerHTML =
      '<div class="ok-msg">🎉 Your tracker is live!</div>' +
      '<div class="copy-row"><input type="text" id="liveUrl" readonly value="' + esc(r.url) + '" />' +
      '<button type="button" id="openBtn">Open</button></div>' +
      (qr ? '<div style="text-align:center;margin-top:18px">' +
        '<img src="' + qr + '" alt="QR code" style="width:160px;height:160px;border:1px solid var(--border);border-radius:8px;background:#fff" /><br/>' +
        '<a class="qr-dl" href="' + qr + '" download="' + esc(r.name) + '-tracker-qr.gif" style="display:inline-block;margin-top:10px;padding:8px 14px;background:var(--accent);color:#fff;border-radius:8px;font-weight:700;text-decoration:none">⬇ Download QR for customers</a>' +
        '</div>' : '') +
      '<div class="hint" style="margin-top:14px">Share this link or QR with your customers. Manage your subscription anytime from your Stripe receipt email.</div>';
    document.getElementById("openBtn").addEventListener("click", function () { window.open(r.url, "_blank", "noopener"); });
  } catch (err) {
    msg.innerHTML = '<div class="error-msg">Network error: ' + esc(String(err)) + '</div>';
    btn.disabled = false;
  }
});
