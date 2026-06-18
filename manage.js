// Management console: unlock with the admin password, then list every tracker
// as an editable card (rename, change token, change branding, activate/
// deactivate, delete) plus a "create new" card. The password is held in memory
// for the session and sent with each request.

let ADMIN_PW = "";

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function api(payload) {
  payload.password = ADMIN_PW;
  const resp = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return resp.json();
}

// QR code (GIF data URL) for a tracker's public page — generated entirely in
// the browser, so it's a downloadable image with no external calls.
function qrDataUrl(text) {
  try {
    const qr = qrcode(0, "M");   // type 0 = auto-size, error correction "M"
    qr.addData(text);
    qr.make();
    return qr.createDataURL(5, 12);  // cellSize px, quiet-zone margin px
  } catch (e) { return ""; }
}

// Build one editable card. `t` is null for the "create new" card.
function cardHtml(t) {
  const isNew = !t;
  const name = isNew ? "" : t.name;
  const active = isNew ? true : t.active;
  const idSuffix = isNew ? "new" : ("e_" + name.toLowerCase());
  const absUrl = isNew ? "" : (window.location.origin + "/" + name);
  const qr = isNew ? "" : qrDataUrl(absUrl);

  let badge = "";
  if (!isNew) badge = active
    ? '<span class="badge-active">Active</span>'
    : '<span class="badge-inactive">Inactive</span>';
  const subBadge = (!isNew && t.hasSubscription) ? '<span class="badge-sub">💳 Subscriber</span>' : '';

  let openLink = "";
  if (!isNew) openLink = '<a class="open-link" href="/' + esc(name) + '" target="_blank" rel="noopener">/' + esc(name) + ' ↗</a>';

  const billingBlock = (!isNew && t.hasSubscription) ?
    ('<div class="billing-row">' +
      '<button type="button" class="btn-secondary f-portal">💳 Manage billing</button>' +
      '<button type="button" class="btn-danger f-cancel">🚫 Cancel subscription</button>' +
      (t.email ? '<span class="muted-note" style="align-self:center">' + esc(t.email) + '</span>' : '') +
    '</div>') : '';

  const tokenPlaceholder = isNew ? "This shop's PSA public API token" : "Leave blank to keep the current token";

  return '' +
    '<div class="form-card tracker-card" data-original="' + esc(name) + '">' +
      '<div class="btn-row" style="justify-content:space-between;margin-bottom:8px">' +
        '<div class="btn-row">' + badge + subBadge + openLink + '</div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="field"><label>Tracker Name</label>' +
          '<input type="text" class="f-name" value="' + esc(name) + '" placeholder="e.g. SMPSportsCardsPlus" autocomplete="off" /></div>' +
        '<div class="field"><label>PSA Token</label>' +
          '<input type="text" class="f-token" value="" placeholder="' + tokenPlaceholder + '" autocomplete="off" /></div>' +
      '</div>' +
      '<div class="row">' +
        '<div class="field"><label>Logo Image URL <span class="hint" style="display:inline">(optional)</span></label>' +
          '<input type="url" class="f-logo" value="' + esc(isNew ? "" : t.logoUrl) + '" placeholder="https://shop.com/logo.png" autocomplete="off" /></div>' +
        '<div class="field"><label>Card Shop Website <span class="hint" style="display:inline">(optional)</span></label>' +
          '<input type="url" class="f-site" value="' + esc(isNew ? "" : t.siteUrl) + '" placeholder="https://shop.com" autocomplete="off" /></div>' +
      '</div>' +
      '<div class="btn-row">' +
        '<label class="toggle"><input type="checkbox" class="f-active"' + (active ? " checked" : "") + ' /> Active</label>' +
        '<span style="flex:1"></span>' +
        (isNew ? '' : '<button type="button" class="btn-danger f-delete">Delete</button>') +
        '<button type="button" class="f-save">' + (isNew ? "Create tracker" : "Save changes") + '</button>' +
      '</div>' +
      (isNew || !qr ? '' :
        '<div class="qr-block">' +
          '<img class="qr-img" src="' + qr + '" alt="QR code for ' + esc(name) + '" />' +
          '<div class="qr-side">' +
            '<div class="qr-cap">📱 Customer QR code</div>' +
            '<div class="muted-note" style="font-size:12px;word-break:break-all">Scan to open ' + esc(absUrl) + '</div>' +
            '<a class="qr-dl" href="' + qr + '" download="' + esc(name) + '-tracker-qr.gif">⬇ Download QR</a>' +
          '</div>' +
        '</div>') +
      billingBlock +
      '<div class="card-msg" id="msg_' + idSuffix + '"></div>' +
    '</div>';
}

function wireCard(cardEl) {
  const original = cardEl.getAttribute("data-original");
  const isNew = !original;
  const msg = cardEl.querySelector(".card-msg");
  const get = (sel) => cardEl.querySelector(sel);

  get(".f-save").addEventListener("click", async function () {
    const payload = {
      action: "save",
      originalName: original,
      name: get(".f-name").value.trim(),
      token: get(".f-token").value.trim(),
      logoUrl: get(".f-logo").value.trim(),
      siteUrl: get(".f-site").value.trim(),
      active: get(".f-active").checked
    };
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(payload.name)) {
      msg.innerHTML = '<span style="color:#b91c1c">Name must be 2-40 letters, numbers, hyphens or underscores (no spaces).</span>';
      return;
    }
    this.disabled = true;
    msg.innerHTML = '<span class="muted-note">Saving…</span>';
    const data = await api(payload);
    this.disabled = false;
    if (!data || !data.ok) {
      msg.innerHTML = '<span style="color:#b91c1c">' + esc((data && data.error) || "Save failed.") + '</span>';
      return;
    }
    await refresh();
  });

  if (!isNew) {
    get(".f-delete").addEventListener("click", async function () {
      if (!window.confirm('Delete tracker "' + original + '"? This cannot be undone.')) return;
      this.disabled = true;
      const data = await api({ action: "delete", name: original });
      if (!data || !data.ok) {
        msg.innerHTML = '<span style="color:#b91c1c">' + esc((data && data.error) || "Delete failed.") + '</span>';
        this.disabled = false;
        return;
      }
      await refresh();
    });
  }

  const portalBtn = get(".f-portal");
  if (portalBtn) {
    portalBtn.addEventListener("click", async function () {
      this.disabled = true;
      msg.innerHTML = '<span class="muted-note">Opening Stripe billing portal…</span>';
      const data = await api({ action: "portal", name: original });
      this.disabled = false;
      if (!data || !data.ok || !data.url) {
        msg.innerHTML = '<span style="color:#b91c1c">' + esc((data && data.error) || "Could not open billing portal.") + '</span>';
        return;
      }
      msg.innerHTML = "";
      window.open(data.url, "_blank", "noopener");
    });
  }

  const cancelBtn = get(".f-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", async function () {
      if (!window.confirm('Cancel the subscription for "' + original + '"? It stays live until the end of the paid period, then turns off automatically.')) return;
      this.disabled = true;
      msg.innerHTML = '<span class="muted-note">Cancelling…</span>';
      const data = await api({ action: "cancel", name: original });
      this.disabled = false;
      if (!data || !data.ok) {
        msg.innerHTML = '<span style="color:#b91c1c">' + esc((data && data.error) || "Cancel failed.") + '</span>';
        return;
      }
      const when = data.cancelAt ? new Date(data.cancelAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
      msg.innerHTML = '<span style="color:#15803d">Subscription set to cancel' + (when ? " on " + esc(when) : " at period end") + '. The page stays live until then.</span>';
    });
  }
}

async function refresh() {
  const data = await api({ action: "list" });
  if (!data || !data.ok) {
    document.getElementById("gateMsg").innerHTML = '<div class="error-msg">' + esc((data && data.error) || "Failed to load.") + '</div>';
    return false;
  }
  // Fresh "create" card
  const slot = document.getElementById("newCardSlot");
  slot.innerHTML = cardHtml(null);
  wireCard(slot.querySelector(".tracker-card"));

  // Existing trackers
  const list = document.getElementById("list");
  const trackers = data.trackers || [];
  document.getElementById("count").textContent = "(" + trackers.length + ")";
  if (!trackers.length) {
    list.innerHTML = '<div class="muted-note">No trackers yet. Create one above.</div>';
  } else {
    list.innerHTML = trackers.map(cardHtml).join("");
    list.querySelectorAll(".tracker-card").forEach(wireCard);
  }
  return true;
}

document.getElementById("loadBtn").addEventListener("click", async function () {
  const pw = document.getElementById("adminPw").value;
  const gateMsg = document.getElementById("gateMsg");
  if (!pw) { gateMsg.innerHTML = '<div class="error-msg">Enter the admin password.</div>'; return; }
  this.disabled = true;
  gateMsg.innerHTML = '<div class="muted-note" style="margin-top:12px">Unlocking…</div>';
  ADMIN_PW = pw;
  const ok = await refresh();
  this.disabled = false;
  if (ok) {
    gateMsg.innerHTML = "";
    document.getElementById("gate").style.display = "none";
    document.getElementById("console").style.display = "block";
  } else {
    ADMIN_PW = "";
  }
});

document.getElementById("adminPw").addEventListener("keydown", function (e) {
  if (e.key === "Enter") document.getElementById("loadBtn").click();
});
