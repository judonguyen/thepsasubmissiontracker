// Create-tracker form: validates lightly, POSTs to /api/create-tracker, and
// shows the generated page link with a copy button.

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const nameInput = document.getElementById("name");
const preview = document.getElementById("urlPreview");

// Live URL preview as they type the tracker name.
nameInput.addEventListener("input", function () {
  const v = nameInput.value.trim();
  preview.textContent = "/" + (v || "yourshopname");
});

document.getElementById("createForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const msg = document.getElementById("msg");
  const btn = document.getElementById("submitBtn");

  const payload = {
    password: document.getElementById("password").value,
    name: nameInput.value.trim(),
    token: document.getElementById("token").value.trim(),
    logoUrl: document.getElementById("logoUrl").value.trim(),
    siteUrl: document.getElementById("siteUrl").value.trim()
  };

  if (!payload.password) { msg.innerHTML = '<div class="error-msg">Enter the admin password.</div>'; return; }
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(payload.name)) {
    msg.innerHTML = '<div class="error-msg">Tracker name must be 2-40 letters, numbers, hyphens or underscores (no spaces).</div>';
    return;
  }
  if (payload.token.length < 10) { msg.innerHTML = '<div class="error-msg">Paste this shop\'s PSA token.</div>'; return; }

  btn.disabled = true;
  msg.innerHTML = '<div class="muted-note" style="margin-top:16px">Creating…</div>';

  let data;
  try {
    const resp = await fetch("/api/create-tracker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    data = await resp.json();
  } catch (err) {
    msg.innerHTML = '<div class="error-msg">Network error: ' + esc(String(err)) + '</div>';
    btn.disabled = false;
    return;
  }

  if (!data || !data.ok) {
    msg.innerHTML = '<div class="error-msg">' + esc((data && data.error) || "Could not create tracker.") + '</div>';
    btn.disabled = false;
    return;
  }

  const verb = data.existed ? "updated" : "created";
  msg.innerHTML =
    '<div class="ok-msg">Tracker <strong>' + esc(data.name) + '</strong> ' + verb + '! Their page is live at:</div>' +
    '<div class="copy-row">' +
    '<input type="text" id="resultUrl" readonly value="' + esc(data.url) + '" />' +
    '<button type="button" id="copyBtn">Copy</button>' +
    '<button type="button" id="openBtn">Open</button>' +
    '</div>';

  document.getElementById("copyBtn").addEventListener("click", function () {
    const el = document.getElementById("resultUrl");
    el.select();
    navigator.clipboard ? navigator.clipboard.writeText(el.value) : document.execCommand("copy");
    this.textContent = "Copied!";
  });
  document.getElementById("openBtn").addEventListener("click", function () {
    window.open(data.url, "_blank", "noopener");
  });

  btn.disabled = false;
});
