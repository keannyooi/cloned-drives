"use strict";

/**
 * CLEAN CARFILES
 * ==============
 * Cleans up messy CSV-escaped JSON files in the `src/0 Carfiles to Add/` folder,
 * and brings each card up to the current schema by converting legacy flags into
 * the new `cardType` field.
 *
 * A file is considered "messy" if it:
 *   - Is wrapped in outer double quotes ("{ ... }")
 *   - Has all internal quotes doubled up ("" instead of ")
 *   - Has trailing whitespace / blank padding lines after the closing brace
 *
 * This script:
 *   - Strips the outer quotes
 *   - Replaces all "" with "
 *   - Parses to validate it's real JSON
 *   - Converts legacy isPrize/active/diamond flags into `cardType` and strips
 *     them, using the same deriveLegacyTypes() mapping the bot and the Phase-2
 *     migrateCardTypes.js script use — so a cleaned file is validateCars-clean.
 *     `reference` (the stats pointer) is preserved. A file with no flags gets
 *     cardType ["Normal"]. If a file already has cardType, it's kept (and any
 *     leftover legacy flags are stripped, unless they disagree — then it warns).
 *   - Strips the legacy pre-baked tune blocks (333/666/699/969/996 ×
 *     TopSpeed/0to60/Handling) — the bot derives these via calcTune() now and
 *     nothing reads them. Same 15-key list as cleanupCarTunes.js.
 *   - Backfills a default `hiddenTag` ([""]) when missing, slotted in just
 *     before cardType — it's a filter criterion every card is expected to have.
 *   - Re-writes it pretty-printed (4-space indent) in place
 *   - Leaves files that are already clean AND already on cardType untouched
 *   - Only processes top-level .json files (skips subfolders like "0 Remake n Update", "1 BM cars")
 *
 * Usage:  node cleanCarfiles.js
 */

const fs = require("fs");
const path = require("path");
const { deriveLegacyTypes } = require("../src/util/functions/cardType.js");

// ⚙️ CONFIG — folder containing messy files; cleaned files overwrite in place.
// Defaults to the staging folder; pass a path to target another (handy for tests):
//   node cleanCarfiles.js "some/other/folder"
const INPUT_FOLDER = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, "..", "src", "0 Carfiles to Add");
const OUTPUT_FOLDER = INPUT_FOLDER; // overwrite originals

if (!fs.existsSync(INPUT_FOLDER)) {
    console.error(`❌ Input folder not found: ${INPUT_FOLDER}`);
    process.exit(1);
}

// Grab only top-level .json files (ignore subfolders)
const files = fs.readdirSync(INPUT_FOLDER, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".json"))
    .map(e => e.name);

if (files.length === 0) {
    console.log(`⚠️  No .json files found in ${INPUT_FOLDER}`);
    process.exit(0);
}

console.log(`🔍 Found ${files.length} file(s) to check in "${path.basename(INPUT_FOLDER)}"...\n`);

let cleanedCount = 0;
let convertedCount = 0;
let hiddenTagAddedCount = 0;
let tuneFileCount = 0;
let tuneFieldsRemoved = 0;
let alreadyCleanCount = 0;
let needsManualCount = 0;
let errorCount = 0;

// Legacy boolean flags that cardType now supersedes. `reference` is NOT here —
// it's the stats pointer and stays. Mirrors migrateCardTypes.js STRIP_KEYS.
const LEGACY_FLAGS = ["isPrize", "active", "diamond"];

// Legacy pre-baked tune blocks: 333/666/699/969/996 × TopSpeed/0to60/Handling.
// The bot now derives every tune on the fly via calcTune(), and nothing reads
// these keys anymore — they're dead weight. Same 15-key list as cleanupCarTunes.js
// (which already stripped them from src/cars).
const TUNE_KEYS = [];
for (const p of ["333", "666", "699", "969", "996"]) {
    for (const s of ["TopSpeed", "0to60", "Handling"]) TUNE_KEYS.push(`${p}${s}`);
}

/** Delete legacy tune-block keys from a parsed car in place. Returns the count removed. */
function stripTuneBlocks(car) {
    let removed = 0;
    for (const k of TUNE_KEYS) {
        if (car[k] !== undefined) { delete car[k]; removed++; }
    }
    return removed;
}

// Every gameplay card carries a `hiddenTag` array; the house default is [""]
// (8,274 of 8,307 cars). It's a filter criterion (filterCheck.js / editFilter.js),
// so a card missing it can never match a hiddenTag-based requirement.
const HIDDEN_TAG_DEFAULT = [""];

/**
 * Add the default hiddenTag if the card lacks one, positioned just before
 * cardType (the house key order: ...creator, hiddenTag, cardType). Mutates in
 * place; returns true if it was added.
 */
function ensureHiddenTag(car) {
    if (car.hiddenTag !== undefined) return false;
    if (car.cardType === undefined) {
        car.hiddenTag = [...HIDDEN_TAG_DEFAULT]; // no cardType yet → append; a later cardType lands after it
        return true;
    }
    // cardType already present → rebuild so hiddenTag slots in right before it.
    const entries = Object.entries(car);
    for (const k of Object.keys(car)) delete car[k];
    for (const [k, v] of entries) {
        if (k === "cardType") car.hiddenTag = [...HIDDEN_TAG_DEFAULT];
        car[k] = v;
    }
    return true;
}

/**
 * Bring a parsed car onto the cardType schema, mutating it in place.
 *   - No cardType yet  → derive it from the legacy flags (Normal if none),
 *                        strip the flags, append cardType as the last key.
 *   - cardType present → keep it; strip any leftover legacy flags, but only if
 *                        they agree with the derived type. A disagreement is a
 *                        hand-authoring mistake, so leave everything untouched
 *                        and surface a warning instead of guessing.
 * Returns { changed, warning }.
 */
function normalizeCardType(car) {
    const derived = deriveLegacyTypes(car); // reads flags before we delete them
    const hasLegacy = LEGACY_FLAGS.some(k => car[k] !== undefined);

    if (car.cardType !== undefined) {
        if (hasLegacy && JSON.stringify(car.cardType) !== JSON.stringify(derived)) {
            return {
                changed: false,
                warning: `cardType ${JSON.stringify(car.cardType)} disagrees with legacy flags `
                    + `(would derive ${JSON.stringify(derived)}) — left untouched, resolve by hand`,
            };
        }
        let changed = false;
        for (const k of LEGACY_FLAGS) {
            if (car[k] !== undefined) { delete car[k]; changed = true; }
        }
        return { changed, warning: null };
    }

    for (const k of LEGACY_FLAGS) delete car[k];
    car.cardType = derived; // appended last — matches the stamped-file convention
    return { changed: true, warning: null };
}

for (const filename of files) {
    const inputPath = path.join(INPUT_FOLDER, filename);
    const outputPath = path.join(OUTPUT_FOLDER, filename);

    try {
        let text = fs.readFileSync(inputPath, "utf8").trim();

        // A file is CSV-escaped iff it starts with `"{` and ends with `}"`.
        // ONLY in that case do we strip the wrapper and collapse "" → ".
        // Any other file is treated as already-clean JSON — we won't touch its
        // internal "" sequences (which are legitimate: empty strings, escaped
        // quotes next to a closing quote like \"", etc.)
        const isCsvEscaped = text.startsWith(`"{`) && text.endsWith(`}"`);

        let parsed;
        if (isCsvEscaped) {
            // Strip outer wrapping quotes, then undo CSV-style quote doubling.
            text = text.slice(1, -1).replaceAll(`""`, `"`);
            parsed = JSON.parse(text); // a malformed unescape throws → outer catch reports it
        } else {
            // Not CSV-escaped. It must already be valid JSON, or we can't safely
            // touch it (we won't risk mangling internal "" sequences).
            try {
                parsed = JSON.parse(text);
            } catch {
                // Not wrapped AND not parseable — probably some other issue
                // we don't know how to fix. Report and skip.
                console.log(`❌ ${filename} — not CSV-escaped and not valid JSON, skipping.`);
                errorCount++;
                continue;
            }
        }

        // Convert legacy isPrize/active/diamond flags into the new cardType field.
        const { changed: cardTypeChanged, warning } = normalizeCardType(parsed);
        if (warning) {
            // Unresolved cardType conflict — leave the whole file untouched
            // (tunes included) so the human's fix isn't half-applied.
            console.log(`⚠️  ${filename} — ${warning}`);
            needsManualCount++;
            continue;
        }

        // Backfill the default hiddenTag if the card is missing it.
        const hiddenTagAdded = ensureHiddenTag(parsed);

        // Drop the legacy pre-baked tune blocks (superseded by calcTune()).
        const tunesRemoved = stripTuneBlocks(parsed);

        // A file that's already clean JSON with nothing to convert or strip stays
        // untouched — preserves the original "leave already-clean files alone".
        if (!isCsvEscaped && !cardTypeChanged && !hiddenTagAdded && tunesRemoved === 0) {
            alreadyCleanCount++;
            continue;
        }

        // Re-stringify pretty
        let prettyJson = JSON.stringify(parsed, null, 4);

        // Collapse multi-line arrays of simple values onto a single line
        // (matches the house style used by the rest of src/cars/).
        // e.g. [\n    "Ferrari"\n]  →  ["Ferrari"]
        const expandedArrayRegex = /\[\n\s+(".*?"|[\d.]+|true|false)(?:,\n\s+(".*?"|[\d.]+|true|false))*\n\s+\]/g;
        prettyJson = prettyJson.replace(expandedArrayRegex, (match) => {
            const values = match
                .replace(/^\[\n\s+/, "")
                .replace(/\n\s+\]$/, "")
                .split(/,\n\s+/);
            return "[" + values.join(",") + "]";
        });

        fs.writeFileSync(outputPath, prettyJson, "utf8");

        const tags = [];
        if (isCsvEscaped) tags.push("unescaped");
        if (cardTypeChanged) { tags.push("cardType"); convertedCount++; }
        if (hiddenTagAdded) { tags.push("hiddenTag"); hiddenTagAddedCount++; }
        if (tunesRemoved) { tags.push(`-${tunesRemoved} tune`); tuneFileCount++; tuneFieldsRemoved += tunesRemoved; }
        console.log(`✅ ${filename}${tags.length ? `  (${tags.join(", ")})` : ""}`);
        cleanedCount++;
    } catch (err) {
        console.log(`❌ ${filename} — ${err.message}`);
        errorCount++;
    }
}

console.log(`\n🏁 Done!`);
console.log(`   Cleaned (rewritten):  ${cleanedCount}`);
console.log(`   cardType converted:   ${convertedCount}`);
console.log(`   hiddenTag backfilled: ${hiddenTagAddedCount}`);
console.log(`   Tune blocks stripped: ${tuneFieldsRemoved} field(s) across ${tuneFileCount} file(s)`);
console.log(`   Already clean:        ${alreadyCleanCount}`);
if (needsManualCount) console.log(`   Needs manual fix:     ${needsManualCount}`);
console.log(`   Failed:               ${errorCount}`);
