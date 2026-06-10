"use strict";

/**
 * PHASE 2 MIGRATION — stamp `cardType` into every car JSON
 * ========================================================
 * Adds one line per file:  "cardType": ["<derived type>"]
 * derived via cardType.js's deriveLegacyTypes() — the exact same function the
 * bot uses as its runtime fallback, so the stamp cannot disagree with current
 * behavior. Legacy flags (isPrize/reference/active/diamond) are KEPT — the
 * data layer (dataManager search criteria) and the root sim scripts still
 * read them until Phase 4.
 *
 * The edit is a surgical text insertion before the final closing brace,
 * preserving each file's own line-ending style (CRLF vs LF), indentation,
 * and trailing-newline convention — so the git diff is ~2 lines per file,
 * not a reformat. Every result is re-parsed and structurally compared to
 * the original (all original keys byte-identical, exactly one key added)
 * before anything is written.
 *
 * Usage:
 *   node migrateCardTypes.js          → dry run (report only, writes nothing)
 *   node migrateCardTypes.js --write  → stamp the files
 *
 * Idempotent: files that already carry cardType are skipped (and verified
 * against the derivation — a mismatch is reported as an error).
 */

const fs = require("fs");
const path = require("path");
const { deriveLegacyTypes } = require("./src/util/functions/cardType.js");

const WRITE = process.argv.includes("--write");
const CARS_DIR = "./src/cars";

const files = fs.readdirSync(CARS_DIR).filter(f => f.endsWith(".json"));
const typeCounts = {};
const errors = [];
let stamped = 0, skipped = 0;
let samplePreview = null;

for (const file of files) {
    const fullPath = path.join(CARS_DIR, file);
    const raw = fs.readFileSync(fullPath, "utf8");

    let car;
    try {
        car = JSON.parse(raw);
    } catch (err) {
        errors.push(`${file}: unparseable JSON — ${err.message}`);
        continue;
    }

    const types = deriveLegacyTypes(car);

    if (car.cardType !== undefined) {
        skipped++;
        if (JSON.stringify(car.cardType) !== JSON.stringify(types)) {
            errors.push(`${file}: existing cardType ${JSON.stringify(car.cardType)} disagrees with derived ${JSON.stringify(types)}`);
        }
        continue;
    }

    // ── Build the minimal-diff insertion ──
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const endsWithNewline = /\r?\n$/.test(raw);
    const lastBrace = raw.lastIndexOf("}");
    if (lastBrace === -1) {
        errors.push(`${file}: no closing brace found`);
        continue;
    }
    const body = raw.slice(0, lastBrace).replace(/\s+$/, "");
    const newRaw = body + "," + eol
        + `    "cardType": ${JSON.stringify(types)}` + eol
        + "}" + (endsWithNewline ? eol : "");

    // ── Validate: reparse, confirm exactly one key added and nothing changed ──
    let reparsed;
    try {
        reparsed = JSON.parse(newRaw);
    } catch (err) {
        errors.push(`${file}: insertion produced invalid JSON — ${err.message}`);
        continue;
    }
    if (JSON.stringify(reparsed.cardType) !== JSON.stringify(types)) {
        errors.push(`${file}: stamped cardType did not survive reparse`);
        continue;
    }
    delete reparsed.cardType;
    if (JSON.stringify(reparsed) !== JSON.stringify(car)) {
        errors.push(`${file}: original keys were altered by the insertion — refusing`);
        continue;
    }

    typeCounts[types[0]] = (typeCounts[types[0]] || 0) + 1;
    stamped++;
    if (!samplePreview) {
        samplePreview = newRaw.split(/\r?\n/).slice(-4).join("\n");
    }

    if (WRITE) {
        fs.writeFileSync(fullPath, newRaw);
    }
}

console.log(`\n${WRITE ? "STAMPED" : "DRY RUN"} — ${files.length} car files scanned`);
console.log(`  ${WRITE ? "written" : "would stamp"}: ${stamped}`);
console.log(`  already stamped (skipped): ${skipped}`);
console.log(`  per type: ${Object.entries(typeCounts).map(([k, v]) => `${k} ${v}`).join(" | ")}`);
if (samplePreview) {
    console.log(`\n  sample file tail after stamping:\n${samplePreview.split("\n").map(l => "  │ " + l).join("\n")}`);
}
if (errors.length) {
    console.log(`\n  ⛔ ${errors.length} ERRORS — ${WRITE ? "these files were NOT written" : "fix before --write"}:`);
    for (const e of errors.slice(0, 20)) console.log(`     ${e}`);
    process.exitCode = 1;
} else {
    console.log(`\n  ✅ no errors${WRITE ? "" : " — safe to run with --write"}`);
}
