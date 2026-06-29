// Shows how many times each submission has been looked up, per shop.
const { cmd } = require("../lib/store.js");

module.exports = async function handler(req, res) {
  try {
    const counts = await cmd(["HGETALL", "psatracker:subcounts"]);
    const last = await cmd(["HGETALL", "psatracker:sublast"]);

    const lastMap = {};
    for (let i = 0; last && i < last.length; i += 2) lastMap[last[i]] = last[i + 1];

    const rows = [];
    let total = 0;
    for (let i = 0; counts && i < counts.length; i += 2) {
      const field = counts[i], n = parseInt(counts[i + 1], 10) || 0;
      total += n;
      const idx = field.indexOf(":");
      const tracker = idx >= 0 ? field.slice(0, idx) : "default";
      const submission = idx >= 0 ? field.slice(idx + 1) : field;
      rows.push({ tracker: tracker, submission: submission, count: n, lastSeen: lastMap[field] || null });
    }
    rows.sort(function (a, b) { return b.count - a.count; });

    return res.status(200).json({ ok: true, totalLookups: total, unique: rows.length, submissions: rows });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e.message || e) });
  }
};
