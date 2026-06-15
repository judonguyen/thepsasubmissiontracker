// Upstash Redis via REST. Stores each card shop's tracker config so their
// branded page + PSA token persist. Credentials come from env vars:
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

// Strip BOM / zero-width chars that sneak in when pasting credentials, which
// would otherwise corrupt the Authorization header.
function clean(s) {
  if (!s) return "";
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0xFEFF || c === 0x200B) continue;
    out += s[i];
  }
  return out.trim();
}

function creds() {
  return {
    url: clean(process.env.UPSTASH_REDIS_REST_URL),
    token: clean(process.env.UPSTASH_REDIS_REST_TOKEN)
  };
}

async function cmd(args) {
  const { url, token } = creds();
  if (!url || !token) throw new Error("Storage is not configured (missing Upstash credentials).");
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  const j = await r.json();
  if (j && j.error) throw new Error(j.error);
  return j ? j.result : null;
}

async function getJSON(key) {
  const v = await cmd(["GET", key]);
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

async function setJSON(key, val) {
  return cmd(["SET", key, JSON.stringify(val)]);
}

module.exports = { cmd, getJSON, setJSON, clean };
