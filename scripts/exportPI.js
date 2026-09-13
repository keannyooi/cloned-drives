"use strict";

// Export the Pace Index table to docs/pace-index.csv for offline inspection.
// Export ONLY — the bot never reads this back (docs/pace-index.md, Storage).
//   node scripts/exportPI.js
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");
process.chdir(ROOT);
require(path.join(ROOT, "src/config/config.js"));
const dm = require(path.join(ROOT, "src/util/functions/dataManager.js"));
dm.initialize("./src");
const { computePaceIndex, _allEntries, SURFACE_LABELS } = require(path.join(ROOT, "src/util/functions/paceIndex.js"));
const { getCardTypes } = require(path.join(ROOT, "src/util/functions/cardType.js"));

const summary = computePaceIndex();
const entries = _allEntries();
const csv = value => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
const header = ["carID", "name", "cr", "cardType", "PI", "PI_average", "peakBest10", "stars", "valuePoints",
    ...Object.keys(SURFACE_LABELS).map(k => "PI_" + k), "trackKingCount", "trackKingTracks",
    "bestNiche", "bestNicheWins", "bestCeiling", "bestCeilingTracks", "topTracks"];
const rows = [header.join(",")];
const sorted = [...entries.entries()].sort((a, b) => b[1].pi - a[1].pi);
for (const [carID, e] of sorted) {
    const car = dm.getCar(carID);
    const make = Array.isArray(car.make) ? car.make[0] : car.make;
    rows.push([
        carID, `${make} ${car.model} (${car.modelYear})`, car.cr, getCardTypes(car).join("|"), e.pi, e.average, e.peakRaw, e.stars, e.value,
        ...Object.keys(SURFACE_LABELS).map(k => e.surfaces[k] ?? ""),
        e.trackKing.count, e.trackKing.tracks.join(" | "),
        `${e.bestNiche.niche} (${e.bestNiche.family})`, e.bestNiche.wins,
        e.bestCeiling ? e.bestCeiling.ceiling : "", e.bestCeiling ? e.bestCeiling.tracks : "",
        e.topTracks.map(t => `${t.trackName} #${t.rank}${t.rank === 1 ? "" : ` (-${t.gap})`}`).join(" | ")
    ].map(csv).join(","));
}
const out = path.join(ROOT, "docs", "pace-index.csv");
fs.writeFileSync(out, rows.join("\n"));

// quick distribution so the shape is visible without opening the file
const hist = new Array(10).fill(0);
let starHist = new Array(11).fill(0);
for (const e of entries.values()) { hist[Math.min(9, Math.floor(e.pi / 1000))]++; starHist[e.stars]++; }
console.log(`Pace Index: ${summary.cars} cars x ${summary.tracks} tracks in ${summary.ms}ms -> ${out}`);
console.log("PI bands (0-999 .. 9000-9999):", hist.join(" | "));
console.log("stars 0..10:", starHist.join(" | "));
console.log("top 5:", sorted.slice(0, 5).map(([id, e]) => `${id} ${e.pi}`).join(", "));
