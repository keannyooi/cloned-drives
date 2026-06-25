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
 *   node migrateCardTypes.js                  → dry run (report only, writes nothing)
 *   node migrateCardTypes.js --write          → stamp the files
 *   node migrateCardTypes.js --strip          → Phase 4 dry run: report legacy-flag removal
 *   node migrateCardTypes.js --strip --write  → remove isPrize/active/diamond lines
 *
 * Idempotent: files that already carry cardType are skipped in stamp mode (and,
 * while their legacy flags still exist, verified against the derivation).
 * Strip mode refuses any file whose cardType disagrees with its flags, and
 * never touches `reference` (the stats pointer) or `cardType` itself.
 */

const fs = require("fs");
const path = require("path");
const { deriveLegacyTypes } = require("../src/util/functions/cardType.js");

const WRITE = process.argv.includes("--write");
const STRIP = process.argv.includes("--strip");
const CARS_DIR = "./src/cars";
const STRIP_KEYS = ["isPrize", "active", "diamond"];

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

    // ── Strip mode: remove legacy flag lines from already-stamped files ──
    if (STRIP) {
        if (car.cardType === undefined) {
            errors.push(`${file}: no cardType — stamp it first (refusing to strip flags)`);
            continue;
        }
        const present = STRIP_KEYS.filter(k => car[k] !== undefined);
        if (present.length === 0) {
            skipped++;
            continue;
        }
        // Safety: while flags exist they must agree with the stamp — once
        // stripped there is nothing left to re-derive from.
        if (JSON.stringify(car.cardType) !== JSON.stringify(deriveLegacyTypes(car))) {
            errors.push(`${file}: cardType ${JSON.stringify(car.cardType)} disagrees with flags ${JSON.stringify(deriveLegacyTypes(car))} — resolve before stripping`);
            continue;
        }

        let newRaw = raw;
        for (const k of present) {
            newRaw = newRaw.replace(new RegExp(`^[ \\t]*"${k}"[ \\t]*:[^\\r\\n]*\\r?\\n`, "m"), "");
        }

        let reparsed;
        try {
            reparsed = JSON.parse(newRaw);
        } catch (err) {
            errors.push(`${file}: strip produced invalid JSON — ${err.message}`);
            continue;
        }
        const expected = { ...car };
        for (const k of STRIP_KEYS) delete expected[k];
        if (JSON.stringify(reparsed) !== JSON.stringify(expected)) {
            errors.push(`${file}: strip altered more than the legacy flags — refusing`);
            continue;
        }

        for (const k of present) typeCounts[k] = (typeCounts[k] || 0) + 1;
        stamped++;
        if (!samplePreview) {
            samplePreview = newRaw.split(/\r?\n/).slice(0, 4).join("\n");
        }
        if (WRITE) fs.writeFileSync(fullPath, newRaw);
        continue;
    }

    const types = deriveLegacyTypes(car);

    if (car.cardType !== undefined) {
        skipped++;
        // Agreement check only meaningful while the legacy flags still exist
        const hasFlags = STRIP_KEYS.some(k => car[k] !== undefined);
        if (hasFlags && JSON.stringify(car.cardType) !== JSON.stringify(types)) {
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

const MODE = STRIP ? "strip" : "stamp";
console.log(`\n${WRITE ? (STRIP ? "STRIPPED" : "STAMPED") : "DRY RUN (" + MODE + ")"} — ${files.length} car files scanned`);
console.log(`  ${WRITE ? "written" : "would " + MODE}: ${stamped}`);
console.log(`  ${STRIP ? "nothing to strip (skipped)" : "already stamped (skipped)"}: ${skipped}`);
console.log(`  ${STRIP ? "flags removed" : "per type"}: ${Object.entries(typeCounts).map(([k, v]) => `${k} ${v}`).join(" | ")}`);
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
