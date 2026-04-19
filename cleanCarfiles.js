"use strict";

/**
 * CLEAN CARFILES
 * ==============
 * Cleans up messy CSV-escaped JSON files in the `src/0 Carfiles to Add/` folder.
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
 *   - Re-writes it pretty-printed (4-space indent) in place
 *   - Leaves already-clean files alone
 *   - Only processes top-level .json files (skips subfolders like "0 Remake n Update", "1 BM cars")
 *
 * Usage:  node cleanCarfiles.js
 */

const fs = require("fs");
const path = require("path");

// ⚙️ CONFIG — folder containing messy files; cleaned files overwrite in place
const INPUT_FOLDER = path.join(__dirname, "src", "0 Carfiles to Add");
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
let alreadyCleanCount = 0;
let errorCount = 0;

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

        if (isCsvEscaped) {
            // Strip outer wrapping quotes
            text = text.slice(1, -1);
            // Undo CSV-style quote doubling
            text = text.replaceAll(`""`, `"`);
        } else {
            // Not CSV-escaped. If it's already valid JSON, skip it entirely
            // so we don't risk mangling anything.
            try {
                JSON.parse(text);
                alreadyCleanCount++;
                continue;
            } catch {
                // Not wrapped AND not parseable — probably some other issue
                // we don't know how to fix. Report and skip.
                console.log(`❌ ${filename} — not CSV-escaped and not valid JSON, skipping.`);
                errorCount++;
                continue;
            }
        }

        // Validate
        const parsed = JSON.parse(text);

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

        console.log(`✅ ${filename}`);
        cleanedCount++;
    } catch (err) {
        console.log(`❌ ${filename} — ${err.message}`);
        errorCount++;
    }
}

console.log(`\n🏁 Done!`);
console.log(`   Cleaned:       ${cleanedCount}`);
console.log(`   Already clean: ${alreadyCleanCount}`);
console.log(`   Failed:        ${errorCount}`);
