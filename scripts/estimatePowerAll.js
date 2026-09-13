"use strict";

/**
 * POWER BACKFILL
 * ==============
 * Seeds every carfile in src/cars/ — and every staged car waiting in
 * src/0 Carfiles to Add/ — with the race engine's own power estimate (PS,
 * rounded to 5) as `power` + `powerEstimated: true`, so the whole roster
 * carries a power figure that people can then correct through the Suggest
 * edit button on cd-carinfo (docs/race-engine-rework.md §5, §8).
 *
 *   node scripts/estimatePowerAll.js            # dry run: report only
 *   node scripts/estimatePowerAll.js --apply    # write the files
 *   node scripts/estimatePowerAll.js --id c00436 [--apply]
 *   node scripts/estimatePowerAll.js --sample 20
 *
 * Where the number comes from (raceModel.estimatePower):
 *   - the 60-100 mph band when the car has one (top speed ≥ 105 and an MRA)
 *   - else the 30-60 mph band
 *   - floored, in every case, by the power the top speed alone demands
 *     against drag and rolling resistance — the only figure for cars that
 *     cannot reach 60 mph, and a correction for slow classics the bands
 *     under-read (a 1957 Abarth is ~30 PS, not the 10 the 30-60 band said)
 *
 * Rules:
 *   - a stated value (power present WITHOUT powerEstimated) is never touched
 *   - a seeded value is refreshed when the estimate has moved
 *   - BM cards and other reference cards are skipped — they read the base car
 *   - files are edited in place by carfilePatch: two lines added after `ola`,
 *     every other byte untouched, so the git diff is exactly the change
 *   - staged files that are not valid JSON yet (spreadsheet-escaped, waiting
 *     for cleanCarfiles.js) are reported and left alone
 */

const path = require("path");
const fs = require("fs");
const dm = require("../src/util/functions/dataManager.js");
const { estimatePower } = require("../src/util/functions/raceModel.js");
const { patchCarfile, patchCarfileAt } = require("../src/util/functions/carfilePatch.js");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const sampleSize = args.includes("--sample") ? parseInt(args[args.indexOf("--sample") + 1], 10) || 15 : 15;
const STAGING_DIR = path.join(__dirname, "../src/0 Carfiles to Add");

process.chdir(path.join(__dirname, ".."));
dm.initialize("./src");

const tally = { seeded: 0, refreshed: 0, unchanged: 0, stated: 0, reference: 0, notEstimable: 0, failed: 0 };
const bySource = {};
const psPerTonne = [];
const samples = [], refreshes = [], failures = [];

function carName(car) {
    const make = Array.isArray(car.make) ? car.make[0] : car.make;
    return `${make} ${car.model} (${car.modelYear})`;
}

/** One car: decide, tally, and (with --apply) write. `write` is the patch call for this file. */
function consider(label, car, write) {
    if (typeof car.reference === "string" && car.reference) { tally.reference++; return; }
    if (typeof car.power === "number" && car.powerEstimated !== true) { tally.stated++; return; }
    let estimate;
    try { estimate = estimatePower(car); }
    catch (error) { tally.failed++; failures.push(`${label}: ${error.message}`); return; }
    if (!estimate) { tally.notEstimable++; return; }
    if (car.power === estimate.power && car.powerEstimated === true) { tally.unchanged++; return; }

    const kind = typeof car.power === "number" ? "refreshed" : "seeded";
    tally[kind]++;
    bySource[estimate.source] = (bySource[estimate.source] || 0) + 1;
    if (car.weight > 0) psPerTonne.push(estimate.power / (car.weight / 1000));
    const line = `${label} ${carName(car)}: ${estimate.power} PS (${estimate.source})`;
    if (kind === "refreshed") { if (refreshes.length < sampleSize) refreshes.push(`${line} — was ${car.power}`); }
    else if (samples.length < sampleSize) samples.push(line);

    if (apply) {
        try { write({ set: { power: estimate.power, powerEstimated: true } }); }
        catch (error) { tally.failed++; failures.push(`${label}: ${error.message}`); }
    }
}

// ── the live roster ───────────────────────────────────────────────────────────
for (const file of dm.getCarFiles()) {
    const carID = file.slice(0, -5);
    if (only && carID !== only) continue;
    const car = dm.getCar(carID);
    if (car) consider(carID, car, ops => patchCarfile(carID, ops));
}

// ── cars waiting in staging (root folder only; the BM subfolder holds reference cards) ──
const staging = { seen: 0, unreadable: [] };
if (!only && fs.existsSync(STAGING_DIR)) {
    for (const file of fs.readdirSync(STAGING_DIR)) {
        const full = path.join(STAGING_DIR, file);
        if (!file.endsWith(".json") || !fs.statSync(full).isFile()) continue;
        staging.seen++;
        let car;
        try { car = JSON.parse(fs.readFileSync(full, "utf8")); }
        catch (error) { staging.unreadable.push(file); continue; }
        consider(`staging/${file}`, car, ops => patchCarfileAt(full, ops));
    }
}

function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

console.log(`\n${apply ? "APPLIED" : "DRY RUN — nothing written (add --apply)"}`);
console.log(`  seeded ${tally.seeded} · refreshed ${tally.refreshed} · already current ${tally.unchanged} · stated by a human (kept) ${tally.stated}`);
console.log(`  skipped: ${tally.reference} reference/BM cards · ${tally.notEstimable} without a top speed · ${tally.failed} failed`);
console.log(`  staging: ${staging.seen} file(s) read${staging.unreadable.length ? `, ${staging.unreadable.length} not valid JSON yet (run cleanCarfiles.js first): ${staging.unreadable.slice(0, 5).join(", ")}` : ""}`);
if (Object.keys(bySource).length) console.log(`  sources: ${Object.entries(bySource).map(([source, n]) => `${source} ${n}`).join(" · ")}`);
if (psPerTonne.length) {
    console.log(`  PS per tonne: p10 ${Math.round(percentile(psPerTonne, 0.1))} · median ${Math.round(percentile(psPerTonne, 0.5))} · p90 ${Math.round(percentile(psPerTonne, 0.9))}`);
}
if (samples.length) console.log(`\n  ${samples.join("\n  ")}`);
if (refreshes.length) console.log(`\n  refreshed:\n  ${refreshes.join("\n  ")}`);
if (failures.length) console.log(`\n  FAILED:\n  ${failures.slice(0, 20).join("\n  ")}`);
console.log();
process.exit(tally.failed ? 1 : 0);
