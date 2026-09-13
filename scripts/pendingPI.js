"use strict";

/**
 * PENDING PACE INDEX — rate carfiles that are NOT in the game yet.
 *
 *   node scripts/pendingPI.js                 every JSON in "src/0 Carfiles to Add/"
 *                                             (+ "0 Remake n Update/", which REPLACE
 *                                             their live version in the simulation)
 *   node scripts/pendingPI.js mustang lotus   only files whose name contains a word
 *                                             (the whole batch still ships together;
 *                                             the filter only limits what is printed)
 *
 * BATCH mode (the headline): the full Pace Index table is rebuilt over
 * live cars + every staged car together — exactly the field that would exist
 * the day the batch ships — using the same code path as the bot
 * (paceIndex.computeTable). Pending cars therefore see each other: the
 * eleven identical F1 cars tie, a new drag king dethrones the other new drag
 * car, and the numbers match what cd-cinfo will show after release.
 *
 * SOLO (a comparison column): what the car would read if it were the ONLY
 * one added today.
 *
 * Also reports how live cars MOVE when the batch lands (biggest PI drops,
 * crowns lost). Output: console summary + docs/pending-pi.csv. Read-only.
 *
 * "vs CR" = batch PI minus the average live PI of cars within ±25 CR:
 * strongly positive = underpriced for its CR, strongly negative = dead
 * weight at that CR.
 */

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
process.chdir(ROOT);
require(path.join(ROOT, "src/config/config.js"));
const dm = require(path.join(ROOT, "src/util/functions/dataManager.js"));
dm.initialize("./src");
const pace = require(path.join(ROOT, "src/util/functions/paceIndex.js"));
const { getCardTypes } = require(path.join(ROOT, "src/util/functions/cardType.js"));
const { getAvailableTunes } = require(path.join(ROOT, "src/util/functions/calcTune.js"));
const { weatherVars } = require(path.join(ROOT, "src/util/consts/consts.js"));

const STAGING = path.join(ROOT, "src", "0 Carfiles to Add");
const REMAKES = path.join(STAGING, "0 Remake n Update");
const filterWords = process.argv.slice(2).map(w => w.toLowerCase());
const { SURFACE_LABELS, PEAK_TRACKS } = pace;
const REQUIRED = ["topSpeed", "0to60", "handling", "weight", "mra", "ola"];
const nameOf = c => `${Array.isArray(c.make) ? c.make[0] : c.make} ${c.model} (${c.modelYear})`;

// ── live field (before) ─────────────────────────────────────────────────────
const t0 = Date.now();
pace.computePaceIndex();
const before = pace._allEntries();
const live = pace.liveRoster();
const tracks = pace.liveTracks();
const liveByID = new Map(live.map(c => [c.carID, c]));
console.log(`live field: ${live.length} cars x ${tracks.length} tracks (${Date.now() - t0}ms)`);

// ── staged cars ─────────────────────────────────────────────────────────────
const staged = [], skipped = [], seen = new Map();
for (const [dir, kind] of [[STAGING, "new"], [REMAKES, "remake"]]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
        let car;
        try { car = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); }
        catch (e) { skipped.push(`${file}: invalid JSON (${e.message})`); continue; }
        if (car.reference) { skipped.push(`${file}: BM card — rates as its base car`); continue; }
        const missing = REQUIRED.filter(k => typeof car[k] !== "number");
        if (missing.length) { skipped.push(`${file}: missing ${missing.join(", ")}`); continue; }
        if (!car.carID || !/^c\d{5}$/.test(car.carID)) { skipped.push(`${file}: no carID yet (run assignStagingIDs) — cannot be placed in the field`); continue; }
        if (seen.has(car.carID)) { skipped.push(`${file}: DUPLICATE carID ${car.carID} (also ${seen.get(car.carID)}) — second file ignored`); continue; }
        seen.set(car.carID, file);
        const replaces = liveByID.has(car.carID);
        if (replaces && kind === "new") skipped.push(`${file}: carID ${car.carID} is already live — treated as a remake (replaces it)`);
        staged.push({ file, kind: replaces ? "remake" : "new", car });
    }
}

// ── batch field (after): live minus replaced, plus every staged car ─────────
const replaced = new Set(staged.filter(s => s.kind === "remake").map(s => s.car.carID));
const field = live.filter(c => !replaced.has(c.carID)).concat(staged.map(s => s.car));
const after = pace.computeTable(field, tracks);
console.log(`batch field: ${field.length} cars (${staged.length} staged, ${replaced.size} replacing live cars) computed in ${after.ms}ms`);

// ── solo numbers: each staged car alone in today's field ────────────────────
const tunes = getAvailableTunes();
const trackMeta = tracks.map(track => ({ track, pens: weatherVars[`${track.weather} ${track.surface}`] || { drivePen: 0, absPen: 0, tcsPen: 0, tyrePen: {} }, mph: pace._mphOf(track) }));
const liveVariants = live.map(c => pace._variantsOf(c, tunes));
const liveS = trackMeta.map(({ track, pens, mph }) => {
    const S = new Float64Array(live.length);
    for (let i = 0; i < live.length; i++) { let b = -Infinity; for (const v of liveVariants[i]) { const s = pace._scoreVariant(v, track, pens, mph); if (s > b) b = s; } S[i] = b; }
    return S;
});
const liveKing = liveS.map(S => { let b = 0; for (let i = 1; i < S.length; i++) if (S[i] > S[b]) b = i; return live[b]; });
const trackIndex = new Map(tracks.map((t, i) => [t.trackName, i]));
function solo(car) {
    const variants = pace._variantsOf(car, tunes);
    const pcts = [];
    for (let ti = 0; ti < tracks.length; ti++) {
        const { track, pens, mph } = trackMeta[ti];
        let s = -Infinity; for (const v of variants) { const x = pace._scoreVariant(v, track, pens, mph); if (x > s) s = x; }
        let beat = 0; const S = liveS[ti]; for (let i = 0; i < S.length; i++) if (S[i] > s) beat++;
        pcts.push(1 - beat / (live.length + 1));
    }
    const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 9999);
    const ten = [...pcts].sort((a, b) => b - a).slice(0, PEAK_TRACKS);
    return { pi: pace.rankPeakAgainstField(ten.reduce((a, b) => a + b, 0) / ten.length), avg };
}

// ── rows ────────────────────────────────────────────────────────────────────
const afterPIsDesc = [...after.entries.values()].map(e => e.pi).sort((a, b) => b - a);
const rows = [];
for (const { file, kind, car } of staged) {
    if (filterWords.length && !filterWords.some(w => file.toLowerCase().includes(w))) continue;
    const e = after.entries.get(car.carID);
    if (!e) { skipped.push(`${file}: not rated in batch (BOSS type?)`); continue; }
    const s = solo(car);
    const crP = car.cr || 0;
    let bracketSum = 0, bracketN = 0;
    for (const [id, be] of before) { const c = liveByID.get(id); if (c && Math.abs((c.cr || 0) - crP) <= 25) { bracketSum += be.pi; bracketN++; } }
    const bracketAvg = bracketN ? Math.round(bracketSum / bracketN) : null;
    let rank = 1; while (rank <= afterPIsDesc.length && afterPIsDesc[rank - 1] > e.pi) rank++;
    const kings = e.trackKing.tracks.map(tn => { const ti = trackIndex.get(tn); const k = ti !== undefined ? liveKing[ti] : null; return k && k.carID !== car.carID ? `${tn} (dethrones ${nameOf(k)})` : tn; });
    const liveNow = kind === "remake" ? before.get(car.carID) : null;
    rows.push({ file, kind, carID: car.carID, name: nameOf(car), cr: car.cr || "", cardType: getCardTypes(car).join("|"),
        pi: e.pi, avg: e.average, soloPI: s.pi, soloAvg: s.avg, vsCR: bracketAvg === null ? null : e.pi - bracketAvg, bracketAvg,
        rank: `${rank}/${after.n}`, stars: e.stars, value: e.value, livePI: liveNow ? liveNow.pi : "", surfaces: e.surfaces,
        kingCount: e.trackKing.count, kings, bestNiche: e.bestNiche.wins > 0 ? `#1 of ${e.bestNiche.size} ${e.bestNiche.niche} (${e.bestNiche.family}) on ${e.bestNiche.wins} tracks` : `top ${e.bestNiche.topPct}% of ${e.bestNiche.niche} (${e.bestNiche.family})`,
        bestCeiling: e.bestCeiling ? `${e.bestCeiling.ceiling} (${e.bestCeiling.tracks} tracks)` : "", topTracks: e.topTracks.map(t => `${t.trackName} #${t.rank}${t.rank === 1 ? "" : ` (-${t.gap})`}`) });
}
rows.sort((a, b) => b.pi - a.pi);

// ── live movers ─────────────────────────────────────────────────────────────
const movers = [];
for (const [id, be] of before) {
    if (replaced.has(id)) continue;
    const ae = after.entries.get(id);
    if (!ae) continue;
    movers.push({ name: nameOf(liveByID.get(id)), cr: liveByID.get(id).cr, before: be.pi, after: ae.pi, delta: ae.pi - be.pi, crownsLost: be.trackKing.count - ae.trackKing.count });
}
movers.sort((a, b) => a.delta - b.delta);

// ── output ──────────────────────────────────────────────────────────────────
const csv = v => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
const header = ["file", "kind", "carID", "name", "cr", "cardType", "PI_batch", "avg_batch", "PI_solo", "avg_solo", "vsCR", "bracketAvgPI", "rankAfterRelease", "stars", "valuePoints", "livePI_if_remake",
    ...Object.keys(SURFACE_LABELS).map(k => "PI_" + k), "kingCount", "kingTracks", "bestNiche", "bestCeiling", "topTracks"];
const lines = [header.join(",")];
for (const r of rows) {
    lines.push([r.file, r.kind, r.carID, r.name, r.cr, r.cardType, r.pi, r.avg, r.soloPI, r.soloAvg, r.vsCR, r.bracketAvg, r.rank, r.stars, r.value, r.livePI,
        ...Object.keys(SURFACE_LABELS).map(k => r.surfaces[k] ?? ""), r.kingCount, r.kings.join(" | "), r.bestNiche, r.bestCeiling, r.topTracks.join(" | ")].map(csv).join(","));
}
const out = path.join(ROOT, "docs", "pending-pi.csv");
fs.writeFileSync(out, lines.join("\n"));

const pad = (s, w) => String(s).padEnd(w).slice(0, w);
const line = r => `${pad(r.name, 50)} CR ${pad(r.cr, 5)} PI ${pad(r.pi, 5)} avg ${pad(r.avg, 5)} solo ${pad(r.soloPI, 5)} vsCR ${pad(r.vsCR === null ? "—" : (r.vsCR > 0 ? "+" : "") + r.vsCR, 6)} ${pad("★".repeat(r.stars) || "-", 10)} king ${pad(r.kingCount, 3)}${r.livePI !== "" ? ` (live now ${r.livePI})` : ""}`;
console.log(`\nrated ${rows.length} staged cars as a batch in ${Date.now() - t0}ms -> ${out}`);
console.log(`\nTOP 15 (batch PI)`); rows.slice(0, 15).forEach(r => console.log("  " + line(r)));
console.log(`\nBOTTOM 5`); rows.slice(-5).forEach(r => console.log("  " + line(r)));
const hot = rows.filter(r => r.vsCR !== null && r.vsCR >= 1500), cold = rows.filter(r => r.vsCR !== null && r.vsCR <= -1500);
console.log(`\nCHECK CR — far ABOVE its CR bracket (${hot.length})`); hot.slice(0, 10).forEach(r => console.log("  " + line(r)));
console.log(`\nCHECK CR — far BELOW its CR bracket (${cold.length})`); cold.slice(-10).forEach(r => console.log("  " + line(r)));
const kingsList = rows.filter(r => r.kingCount > 0);
console.log(`\nTRACK KINGS AFTER RELEASE (${kingsList.length})`); kingsList.slice(0, 10).forEach(r => console.log(`  ${r.name}: ${r.kings.slice(0, 2).join(" | ")}${r.kingCount > 2 ? ` … +${r.kingCount - 2}` : ""}`));
console.log(`\nLIVE CARS HIT HARDEST BY THE BATCH`); movers.slice(0, 10).forEach(m => console.log(`  ${pad(m.name, 50)} CR ${pad(m.cr, 5)} ${m.before} -> ${m.after} (${m.delta})${m.crownsLost > 0 ? `  loses ${m.crownsLost} crown${m.crownsLost === 1 ? "" : "s"}` : ""}`));
if (skipped.length) { console.log(`\nSKIPPED / NOTES (${skipped.length})`); skipped.slice(0, 15).forEach(s => console.log("  " + s)); }
