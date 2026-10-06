#!/usr/bin/env node
'use strict';

// Claude Code statusline.
// Prints: CC <session output tokens> · 剩 <remaining context> <pct>% · NT$<cost>
//
// Reads the statusline payload from stdin and writes one line to stdout.
// Keeps no state on disk: every render rescans the transcript and fetches
// the exchange rate again.
//
// Data sources:
// - Remaining context: payload.context_window (Claude Code v2.1.x and later).
//   Older versions without that object fall back to the transcript.
// - Session output total: the transcript, because the payload only carries
//   the most recent response's output tokens.
// - Exchange rate: the futures exchange's open data API (daily USD/NTD
//   reference rate, government open data license), fetched with Node's
//   built-in https module (no third-party packages). The newest entry is the
//   previous business day, not an intraday quote. Falls back to USD_TWD
//   below when offline, slow, or the response format changes.

const fs = require('fs');
const https = require('https');

// Fallback rate, used only when the live fetch fails.
// Edit this single value when it drifts (2026-09-14 reference rate: 31.688).
const USD_TWD = 31.688;

// Source listed on data.gov.tw dataset 11339 (每日外幣參考匯率).
// Set to '' to turn off network access and always use USD_TWD.
const RATE_URL = 'https://openapi.taifex.com.tw/v1/DailyForeignExchangeRates';
const RATE_TIMEOUT_MS = 1500;

const CONTEXT_LIMIT_1M = 1000000;
const CONTEXT_LIMIT_DEFAULT = 200000;

function contextLimitFor(modelId) {
  return /\[1m\]/i.test(modelId || '') ? CONTEXT_LIMIT_1M : CONTEXT_LIMIT_DEFAULT;
}

function num(v) {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

// Tokens occupying the context: the newest turn's prompt plus its reply.
function occupancy(usage) {
  if (!usage) return 0;
  return num(usage.input_tokens) +
    num(usage.cache_creation_input_tokens) +
    num(usage.cache_read_input_tokens) +
    num(usage.output_tokens);
}

// Accumulates transcript stats. `outputTotal` spans the whole session and is
// deliberately not reset by /compact: compacting frees context but does not
// undo tokens already produced, and the cost figure does not reset either.
// Every check here goes through JSON.parse rather than substring matching,
// because message text can itself contain field names such as
// "isSidechain":true and would otherwise trigger false positives.
function scanTranscript(path) {
  return new Promise((resolve) => {
    const stats = { outputTotal: 0, contextUsed: 0 };
    if (!path || !fs.existsSync(path)) {
      resolve(stats);
      return;
    }

    let stream;
    try {
      stream = fs.createReadStream(path, { encoding: 'utf8' });
    } catch (err) {
      resolve(stats);
      return;
    }

    let pending = '';

    function handleLine(line) {
      if (!line) return;

      // Only assistant records carry a usage block; skip everything else
      // without parsing it, since tool results can be megabytes wide.
      if (line.indexOf('"usage"') === -1) return;

      let entry;
      try {
        entry = JSON.parse(line);
      } catch (err) {
        return;
      }

      // Subagent turns run in their own context and never occupy the main one.
      if (entry.isSidechain === true) return;

      const usage = entry.message && entry.message.usage;
      if (!usage) return;

      stats.outputTotal += num(usage.output_tokens);
      stats.contextUsed = occupancy(usage);
    }

    stream.on('data', (chunk) => {
      pending += chunk;
      let cut = pending.indexOf('\n');
      while (cut !== -1) {
        handleLine(pending.slice(0, cut).trim());
        pending = pending.slice(cut + 1);
        cut = pending.indexOf('\n');
      }
    });

    // A trailing fragment means the file is mid-write; drop it rather than
    // risk parsing half a record.
    stream.on('end', () => resolve(stats));
    stream.on('error', () => resolve(stats));
  });
}

// Returns the USD spot mid rate (average of bank buy and sell), or null.
// CSV row: USD,本行買入,<cash>,<spot>,...,本行賣出,<cash>,<spot>,...
// Returns the latest USD/NTD daily reference rate, or null.
// Uses the https module rather than global fetch: destroying the request on
// timeout closes the socket, so the process exits on its own. An aborted
// fetch leaves a handle behind, and forcing process.exit() over it trips a
// libuv assertion on Windows.
function fetchRate() {
  if (!RATE_URL) return Promise.resolve(null);
  return new Promise((resolve) => {
    let body = '';
    let done = false;
    let timer = null;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };

    let req;
    try {
      req = https.get(RATE_URL, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          finish(null);
          return;
        }
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => finish(parseRate(body)));
        res.on('error', () => finish(null));
      });
    } catch (err) {
      finish(null);
      return;
    }

    timer = setTimeout(() => {
      req.destroy();
      finish(null);
    }, RATE_TIMEOUT_MS);
    req.on('error', () => finish(null));
  });
}

// Response: JSON array of { "Date": "YYYYMMDD", "USD/NTD": "31.688", ... },
// roughly the last month of business days.
function parseRate(text) {
  let rows;
  try {
    rows = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    return null;
  }
  if (!Array.isArray(rows)) return null;

  let latest = null;
  for (const row of rows) {
    if (!row || typeof row.Date !== 'string') continue;
    const rate = parseFloat(row['USD/NTD']);
    // Sanity bounds guard against a changed format yielding nonsense.
    if (!(rate > 10 && rate < 100)) continue;
    if (!latest || row.Date > latest.date) latest = { date: row.Date, rate };
  }
  return latest ? latest.rate : null;
}

function group(n) {
  return Math.max(0, Math.round(n)).toLocaleString('en-US');
}

function render(payload, stats, rate) {
  const cw = payload.context_window;
  let limit;
  let used;
  if (cw && num(cw.context_window_size) > 0) {
    limit = cw.context_window_size;
    // current_usage is null before the first API call and right after
    // /compact; treat that as an empty context until the next response.
    used = occupancy(cw.current_usage);
  } else {
    limit = contextLimitFor(payload.model && payload.model.id);
    used = stats.contextUsed;
  }

  const remaining = Math.max(0, limit - used);
  const pct = Math.round((remaining / limit) * 100);

  const usd = num(payload.cost && payload.cost.total_cost_usd);
  const twd = usd * (rate || USD_TWD);

  return [
    'CC ' + group(stats.outputTotal),
    '剩 ' + group(remaining) + ' ' + pct + '%',
    'NT$' + group(twd),
  ].join(' · ');
}

function main(raw) {
  let payload = {};
  try {
    // Tolerate a leading BOM, which some shells prepend when piping.
    payload = JSON.parse(raw.replace(/^﻿/, '').trim()) || {};
  } catch (err) {
    payload = {};
  }

  Promise.all([scanTranscript(payload.transcript_path), fetchRate()])
    .then(([stats, rate]) => {
      process.stdout.write(render(payload, stats, rate));
    });
}

let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinData += chunk;
});
process.stdin.on('end', () => main(stdinData));
process.stdin.on('error', () => main(stdinData));
