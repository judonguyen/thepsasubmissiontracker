// Vercel Serverless Function — runs on Vercel's servers, NOT in the browser.
// Calls the PSA public API and returns clean JSON for the browser UI.
// The PSA token is read from process.env.PSA_TOKEN, so it is never exposed
// to visitors or committed to the repo.

const { getJSON, cmd } = require("../lib/store.js");

const PSA_BASE = "https://api.psacard.com/publicapi";
const FRESH_MS = 60 * 60 * 1000;   // serve cached result without a new PSA call for 1h
const CACHE_TTL = 7 * 24 * 3600;   // keep the last result up to 7 days (for serve-stale on 429)

// Count every lookup (per shop + submission) so /showcounter shows demand.
async function logSubmission(tracker, sub) {
  const field = (tracker || "default") + ":" + sub;
  try {
    await cmd(["HINCRBY", "psatracker:subcounts", field, 1]);
    await cmd(["HSET", "psatracker:sublast", field, new Date().toISOString()]);
  } catch (e) { /* logging is non-critical */ }
}

// Friendly display names + descriptions for each PSA progress step.
// Keys match the "step" values returned by /order/GetProgress.
const STEP_META = {
  Arrived:       { name: "Arrived",             desc: "Submission has arrived at PSA" },
  OrderPrep:     { name: "Order Prep",          desc: "Reviewed, verified, and logged into the system" },
  ResearchAndID: { name: "Research & ID",       desc: "Cards researched for accurate labeling" },
  Grading:       { name: "Grading",             desc: "Authentication and grading complete" },
  Assembly:      { name: "Assembly",            desc: "Labels printed and cards sealed in slabs" },
  QACheck1:      { name: "Quality Assurance 1", desc: "First quality-assurance review" },
  QACheck2:      { name: "Quality Assurance 2", desc: "Final QA review before shipping" },
  Shipped:       { name: "Shipped",             desc: "Order has shipped back to the customer" }
};

// Pick the right PSA token: a registered card shop's own token when the page
// passed ?tracker=<name>, otherwise the site-wide default (PSA_TOKEN env var).
async function resolveToken(req) {
  const t = (req.query && req.query.tracker) ? String(req.query.tracker).toLowerCase().trim() : "";
  if (t) {
    let cfg = null;
    try { cfg = await getJSON("psatracker:" + t); } catch (e) { return { error: "Storage unavailable.", status: 500 }; }
    if (!cfg) return { error: "This tracker does not exist.", status: 404 };
    if (cfg.active === false) return { error: "This tracker is currently inactive.", status: 403 };
    if (cfg.token) return { token: String(cfg.token).trim() };
    return { error: "This tracker has no PSA token set.", status: 500 };
  }
  const envTok = (process.env.PSA_TOKEN || "").trim();
  if (envTok) return { token: envTok };
  return { error: "Server is not configured with a PSA token.", status: 500 };
}

async function psaGet(path, token) {
  const url = PSA_BASE + path;
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: "bearer " + token,
        Accept: "application/json"
      }
    });
    const text = await resp.text();
    if (resp.ok) {
      let data = null;
      try { data = JSON.parse(text); } catch (e) { /* non-JSON body */ }
      return { ok: true, data: data };
    }
    return { ok: false, status: resp.status, body: text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

module.exports = async function handler(req, res) {
  const sub = (req.query && req.query.sub) ? String(req.query.sub) : "";

  if (!/^[0-9]+$/.test(sub)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid numeric submission number." });
  }

  const tracker = (req.query && req.query.tracker) ? String(req.query.tracker).toLowerCase().trim() : "";
  await logSubmission(tracker, sub);

  const tok = await resolveToken(req);
  if (tok.error) {
    return res.status(tok.status || 500).json({ ok: false, error: tok.error });
  }

  // Cache per shop + submission. Serve a fresh-enough copy without calling PSA;
  // if PSA later fails (e.g. 429), still serve the last saved copy (stale) so
  // customers see their status instead of an error.
  const cacheKey = "psatracker:cache:" + (tracker || "_default") + ":" + sub;
  let cached = null;
  try { const v = await cmd(["GET", cacheKey]); if (v) cached = JSON.parse(v); } catch (e) {}
  if (cached && cached.fetchedAt && (Date.now() - Date.parse(cached.fetchedAt) < FRESH_MS)) {
    cached.cached = true;
    return res.status(200).json(cached);
  }

  // NOTE: PSA has two endpoints — GetProgress expects an ORDER number, while
  // GetSubmissionProgress expects a SUBMISSION number (what users type here).
  const orderRes = await psaGet("/order/GetSubmissionProgress/" + encodeURIComponent(sub), tok.token);
  if (!orderRes.ok) {
    if (cached) {                       // serve the last known status on failure
      cached.cached = true; cached.stale = true;
      return res.status(200).json(cached);
    }
    let msg;
    if (orderRes.status === 404) {
      msg = "Submission #" + sub + " was not found. Double-check the number.";
    } else if (orderRes.status === 429) {
      msg = "PSA's lookup limit was reached — please try again in a little while.";
    } else if (orderRes.status) {
      msg = "PSA API returned " + orderRes.status;
    } else {
      msg = orderRes.error || "Unknown error";
    }
    return res.status(200).json({ ok: false, error: msg });
  }

  const d = orderRes.data || {};
  // Full 8-step process, including the final "Shipped" step.
  const isShipped = !!d.shipped;
  const rawSteps = (Array.isArray(d.orderProgressSteps) ? d.orderProgressSteps.slice() : [])
    .sort((a, b) => (a.index || 0) - (b.index || 0));

  const steps = rawSteps.map(s => {
    const meta = STEP_META[s.step] || { name: s.step, desc: "" };
    return { name: meta.name, desc: meta.desc, done: !!s.completed };
  });

  const doneCount = steps.filter(s => s.done).length;
  // The "In Progress" step = the first step that is not yet completed.
  // (-1 means all steps are done.)
  const currentIdx = steps.findIndex(s => !s.done);

  const result = {
    ok: true,
    submissionNumber: sub,
    orderNumber: d.orderNumber || "",
    cardCount: null,        // PSA's progress endpoint does not return a card count
    doneCount: doneCount,
    currentIdx: currentIdx,
    isShipped: isShipped,
    gradesReady: !!d.gradesReady,
    problemOrder: !!d.problemOrder,
    steps: steps,
    certs: [],              // no cert list is available from the progress endpoint
    fetchedAt: new Date().toISOString()
  };
  try { await cmd(["SET", cacheKey, JSON.stringify(result), "EX", CACHE_TTL]); } catch (e) {}
  return res.status(200).json(result);
};
