"use strict";

/**
 * Validate every v2 track file in src/rrtest, print the variants the loader
 * will produce, and the phase shares the reference car computes from the
 * layout facts.   node scripts/raceModel/validateTracks.js [file.json ...]
 * Exit code 1 when any file has errors.
 */

const fs = require("fs");
const path = require("path");
const { validateLayout, expandLayout, referenceLap, PHASES } = require("../../src/util/functions/trackV2.js");

const root = path.join(__dirname, "..", "..");
const folder = path.join(root, "src", "rrtest");
const liveTrackIDs = fs.readdirSync(path.join(root, "src", "tracks")).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));

const files = process.argv.length > 2
    ? process.argv.slice(2)
    : fs.readdirSync(folder).filter(f => f.endsWith(".json")).map(f => path.join(folder, f));

let failed = 0;
for (const file of files) {
    let layout;
    try { layout = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (err) { console.log(`✖ ${path.basename(file)}: not valid JSON — ${err.message}`); failed++; continue; }

    const report = validateLayout(layout, { liveTrackIDs });
    console.log(`${report.ok ? "✔" : "✖"} ${path.basename(file)} — ${layout.name || "?"} [${layout.kind || "?"}]`);
    for (const message of report.errors) console.log(`    error: ${message}`);
    for (const message of report.warnings) console.log(`    warn:  ${message}`);
    if (!report.ok) { failed++; continue; }

    for (const variant of expandLayout(layout)) {
        console.log(`    → ${variant.trackID.padEnd(14)} ${variant.trackName.padEnd(40)} ${(variant.weather + " " + variant.surface + (variant.mix ? " +" + Object.entries(variant.mix).map(([s, sh]) => Math.round(sh * 100) + "% " + s).join(",") : "")).padEnd(14)} ${String(variant.start || "-").padEnd(8)} bumps ${variant.speedbumps} humps ${variant.humps}  ${variant.distance ?? "-"} mi  ≙ ${variant.equivalentTrackID || "-"}`);
        if (variant.phases) {
            const lap = referenceLap(layout, undefined, { start: variant.start });
            console.log(`         reference lap ${lap.seconds} s (${lap.averageMph} mph avg) · ${PHASES.map(key => `${key} ${variant.phases[key]}`).join(" · ")}`);
        }
    }
}
console.log(`\n${files.length - failed} of ${files.length} file(s) valid`);
process.exit(failed ? 1 : 0);
