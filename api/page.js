// Serves a card shop's branded PSA tracker page at /<ShopName>.
// Looks the shop up in storage by name and renders the same tracker UI with
// their logo + website link. The shop's PSA token is NEVER sent to the browser
// — the page only carries the shop NAME, and /api/track resolves the token
// server-side from that name.

const { getJSON } = require("../lib/store.js");

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Only allow http(s) URLs into href/src attributes (block javascript:, etc.).
function safeUrl(u) {
  const s = String(u || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

function notFoundHtml(name) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
    '<title>Tracker not found</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;500;600;700&family=Righteous&display=swap" rel="stylesheet" />' +
    '<link rel="stylesheet" href="/styles.css" /></head><body><div class="container">' +
    '<header><h1>Tracker not found</h1>' +
    '<p>There is no PSA tracker named "' + esc(name) + '".</p></header>' +
    '<div class="result-card"><p class="muted-note">Double-check the link, or ' +
    '<a href="/create">create a tracker</a>.</p></div>' +
    '<footer>PSA Submission Tracker</footer></div></body></html>';
}

function pageHtml(cfg) {
  const logo = safeUrl(cfg.logoUrl) || "/logo.jpeg";
  const site = safeUrl(cfg.siteUrl);
  const name = cfg.name || "";

  let logoImg = '<img class="brand-logo" src="' + esc(logo) + '" alt="' + esc(name) + '" />';
  if (site) logoImg = '<a class="brand-link" href="' + esc(site) + '" target="_blank" rel="noopener">' + logoImg + '</a>';

  let shopLine = esc(name);
  if (site) shopLine = '<a href="' + esc(site) + '" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">' + esc(name) + '</a>';

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8" />\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
    '<title>PSA Submission Tracker | ' + esc(name) + '</title>\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;500;600;700&family=Righteous&display=swap" rel="stylesheet" />\n' +
    '<link rel="stylesheet" href="/styles.css" />\n' +
    '</head>\n<body>\n<div class="container">\n\n' +
    '    <header>\n' +
    '        ' + logoImg + '\n' +
    '        <h1>PSA Submission Tracker</h1>\n' +
    '        <p>Enter a PSA submission number to view its 8-step grading progress</p>\n' +
    '    </header>\n\n' +
    '    <div class="search-card">\n' +
    '        <form method="GET" action="">\n' +
    '            <div class="search-row">\n' +
    '                <input type="text" id="subInput" name="sub" placeholder="e.g. 12345678" autocomplete="off" />\n' +
    '                <button type="submit">Look up</button>\n' +
    '            </div>\n' +
    '        </form>\n' +
    '    </div>\n\n' +
    '    <div id="result"></div>\n\n' +
    '    <footer>' + shopLine + '</footer>\n\n' +
    '</div>\n' +
    '<script>window.__TRACKER__ = { name: ' + JSON.stringify(name) + ' };</script>\n' +
    '<script src="/app.js"></script>\n' +
    '</body>\n</html>\n';
}

module.exports = async function handler(req, res) {
  const name = (req.query && req.query.name) ? String(req.query.name) : "";
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  // Names are letters/numbers/hyphen/underscore only. Anything else (e.g. a
  // stray request for an asset with a dot) is treated as "not found".
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) {
    return res.status(404).send(notFoundHtml(name));
  }

  let cfg = null;
  try { cfg = await getJSON("psatracker:" + name.toLowerCase()); } catch (e) { cfg = null; }
  if (!cfg) return res.status(404).send(notFoundHtml(name));

  return res.status(200).send(pageHtml(cfg));
};
