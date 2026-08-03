#!/usr/bin/env node
// Fetches NREL PVWatts v8 hourly AC output for a grid of tilt x azimuth
// combinations for a fixed site (Lodi, CA) and writes a normalized
// kWh-per-hour-per-kW-DC dataset to energy-system-comparison/data/solar-shapes.json.
//
// Usage: NREL_API_KEY=xxxx node scripts/fetch-solar-shape.mjs
// Falls back to DEMO_KEY (rate limited) if NREL_API_KEY is unset.

import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(
  __dirname,
  '../energy-system-comparison/data/solar-shapes.json'
);
// A meta-only sibling file: assumptions/App.jsx displays six of these
// strings and nothing else, so it imports this instead of the 2.4 MB grid.
const OUT_META_PATH = path.resolve(
  __dirname,
  '../energy-system-comparison/data/solar-shapes.meta.json'
);

const API_KEY = process.env.NREL_API_KEY || 'DEMO_KEY';
const USING_DEMO_KEY = API_KEY === 'DEMO_KEY';

const SITE = { name: 'Lodi, CA', lat: 38.13, lon: -121.29 };

const PARAMS = {
  system_capacity: 1, // kW-DC
  module_type: 0,
  array_type: 1, // fixed roof mount
  losses: 14,
  dc_ac_ratio: 1.2,
  inv_eff: 96,
  timeframe: 'hourly',
};

const TILTS = [10, 20, 30, 40];
const AZIMUTHS = [90, 135, 180, 225, 270];

const REQUEST_DELAY_MS = USING_DEMO_KEY ? 5000 : 1500;
const MAX_RETRIES = 6;
const RETRY_BASE_DELAY_MS = 8000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(tilt, azimuth) {
  const qs = new URLSearchParams({
    api_key: API_KEY,
    lat: String(SITE.lat),
    lon: String(SITE.lon),
    system_capacity: String(PARAMS.system_capacity),
    module_type: String(PARAMS.module_type),
    array_type: String(PARAMS.array_type),
    losses: String(PARAMS.losses),
    dc_ac_ratio: String(PARAMS.dc_ac_ratio),
    inv_eff: String(PARAMS.inv_eff),
    tilt: String(tilt),
    azimuth: String(azimuth),
    timeframe: PARAMS.timeframe,
  });
  return `https://developer.nlr.gov/api/pvwatts/v8.json?${qs.toString()}`;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode, body });
        });
      })
      .on('error', reject);
  });
}

async function fetchWithRetry(url, label) {
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    const { status, body } = await httpGetJson(url);

    if (status === 200) {
      let json;
      try {
        json = JSON.parse(body);
      } catch (err) {
        throw new Error(`${label}: failed to parse JSON response: ${err.message}`);
      }
      if (json.errors && json.errors.length) {
        throw new Error(`${label}: API returned errors: ${JSON.stringify(json.errors)}`);
      }
      return json;
    }

    if (status === 429 || status === 403) {
      attempt += 1;
      if (attempt > MAX_RETRIES) {
        throw new Error(`${label}: exhausted ${MAX_RETRIES} retries after HTTP ${status}`);
      }
      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.error(
        `${label}: HTTP ${status} (rate limited), retry ${attempt}/${MAX_RETRIES} in ${delay}ms`
      );
      await sleep(delay);
      continue;
    }

    throw new Error(`${label}: HTTP ${status}: ${body.slice(0, 500)}`);
  }
  throw new Error(`${label}: unreachable retry state`);
}

async function main() {
  if (USING_DEMO_KEY) {
    console.error(
      'WARNING: NREL_API_KEY not set in environment; falling back to DEMO_KEY. ' +
        'DEMO_KEY is aggressively rate limited across all users; requests will be spaced ' +
        `${REQUEST_DELAY_MS}ms apart with retries on 429/403.`
    );
  }

  const grid = {};
  const errors = [];
  let successCount = 0;
  const totalCount = TILTS.length * AZIMUTHS.length;

  for (const tilt of TILTS) {
    for (const azimuth of AZIMUTHS) {
      const key = `t${tilt}_a${azimuth}`;
      const url = buildUrl(tilt, azimuth);
      const label = `${key} (tilt=${tilt}, azimuth=${azimuth})`;
      try {
        console.error(`Fetching ${label} [${successCount + errors.length + 1}/${totalCount}]...`);
        const json = await fetchWithRetry(url, label);
        const acWh = json?.outputs?.ac;
        if (!Array.isArray(acWh) || acWh.length !== 8760) {
          throw new Error(
            `${label}: expected outputs.ac array of length 8760, got ${
              Array.isArray(acWh) ? acWh.length : typeof acWh
            }`
          );
        }
        // ac is Wh for the 1 kW-DC system; convert to kWh-per-hour-per-kW-DC.
        grid[key] = acWh.map((wh) => wh / 1000);
        successCount += 1;
      } catch (err) {
        console.error(`FAILED ${label}: ${err.message}`);
        errors.push({ key, tilt, azimuth, message: err.message });
      }

      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.error(`\nCompleted: ${successCount}/${totalCount} grid points fetched successfully.`);
  if (errors.length) {
    console.error(`${errors.length} grid point(s) failed:`);
    for (const e of errors) {
      console.error(`  - ${e.key}: ${e.message}`);
    }
  }

  if (successCount === 0) {
    console.error(
      '\nNo grid points succeeded. NOT writing solar-shapes.json (refusing to fabricate production data).'
    );
    process.exitCode = 1;
    return;
  }

  if (successCount < totalCount) {
    console.error(
      '\nPartial success: writing solar-shapes.json with only the successful grid points. ' +
        'Re-run later (ideally with a real NREL_API_KEY) to fill in the rest.'
    );
  }

  const out = {
    meta: {
      source: 'PVWatts API v8, National Laboratory of the Rockies, formerly NREL (https://developer.nlr.gov/docs/solar/pvwatts/v8/)',
      fetchedFor: {
        site: SITE,
        referenceYear: 2026,
        note:
          'PVWatts uses a representative typical-meteorological-year (TMY) weather file for the ' +
          'given location, not actual 2026 weather. Hour indices (0-8759) are treated as reference ' +
          'year 2026 local standard time, no DST, matching the calculator convention.',
      },
      params: {
        ...PARAMS,
        tilts: TILTS,
        azimuths: AZIMUTHS,
      },
      apiKeyUsed: USING_DEMO_KEY ? 'DEMO_KEY' : 'NREL_API_KEY (from env)',
      generatedNote:
        'Values are AC output in kWh per hour per kW-DC of installed capacity (PVWatts outputs.ac ' +
        'is in Wh for a 1 kW-DC system; divided by 1000 here). Grid keys are t{tilt}_a{azimuth}, ' +
        'e.g. t20_a180 = 20 degree tilt, 180 degree azimuth (due south).',
      generatedAt: new Date().toISOString(),
      gridPointsRequested: totalCount,
      gridPointsFetched: successCount,
      failedGridPoints: errors,
    },
    grid,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.error(`\nWrote ${OUT_PATH}`);

  fs.writeFileSync(OUT_META_PATH, JSON.stringify({ meta: out.meta }, null, 2));
  console.error(`Wrote ${OUT_META_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
