"use strict";

/**
 * RENAME NEW CARFILES
 * ===================
 * Scans `src/cars/` and finds any files NOT named `cXXXXX.json`
 * (the standard 5-digit zero-padded format). For each one, it:
 *
 *   1. Picks the next available cXXXXX number (fills gaps first,
 *      then goes past the current highest)
 *   2. Renames the file to the new cXXXXX.json
 *   3. Edits the "carID" field inside the JSON to match
 *
 * Safety:
 *   - Set DRY_RUN = true to preview the rename plan without writing anything
 *   - Refuses to overwrite an existing file
 *   - Validates JSON before writing
 *
 * Usage:
 *   node renameNewCarfiles.js
 */

const fs = require("fs");
const path = require("path");

// ⚙️ CONFIG
const CARS_DIR = path.join(__dirname, "src", "cars");
const DRY_RUN = false; // set true to just preview

if (!fs.existsSync(CARS_DIR)) {
    console.error(`❌ Cars folder not found: ${CARS_DIR}`);
    process.exit(1);
}

// ============================================================================
// 1. Scan the folder — split into standard vs. non-standard
// ============================================================================

const allFiles = fs.readdirSync(CARS_DIR).filter(f => f.endsWith(".json"));

const usedNumbers = new Set();     // numeric IDs already taken
const nonStandard = [];            // filenames that need renaming
let highest = 0;

for (const file of allFiles) {
    const base = file.slice(0, -5); // strip .json
    const match = base.match(/^c(\d{5})$/);
    if (match) {
        const num = parseInt(match[1], 10);
        usedNumbers.add(num);
        if (num > highest) highest = num;
    } else {
        nonStandard.push(file);
    }
}

console.log(`📂 Scanned ${allFiles.length} file(s) in src/cars/`);
console.log(`   Standard cXXXXX files: ${allFiles.length - nonStandard.length}`);
console.log(`   Non-standard files:    ${nonStandard.length}`);
console.log(`   Highest cXXXXX in use: c${String(highest).padStart(5, "0")}\n`);

if (nonStandard.length === 0) {
    console.log("✅ Nothing to rename — all files already follow the cXXXXX.json convention.");
    process.exit(0);
}

// ============================================================================
// 2. Build a stream of free numbers (gaps first, then past the highest)
// ============================================================================

function* freeNumberStream() {
    // Fill gaps in [1, highest]
    for (let i = 1; i <= highest; i++) {
        if (!usedNumbers.has(i)) yield i;
    }
    // Then keep going past the highest forever
    let n = highest + 1;
    while (true) {
        if (!usedNumbers.has(n)) yield n;
        n++;
    }
}

const freeStream = freeNumberStream();
function nextFreeNumber() {
    const { value } = freeStream.next();
    usedNumbers.add(value); // reserve it so subsequent renames don't collide
    return value;
}

// ============================================================================
// 3. Plan the renames
// ============================================================================

const plan = []; // { oldName, newName, newID, oldID }

for (const file of nonStandard) {
    const oldPath = path.join(CARS_DIR, file);
    let data;
    try {
        data = JSON.parse(fs.readFileSync(oldPath, "utf8"));
    } catch (err) {
        console.log(`❌ ${file} — invalid JSON, skipping. (${err.message})`);
        continue;
    }

    const num = nextFreeNumber();
    const newID = `c${String(num).padStart(5, "0")}`;
    const newName = `${newID}.json`;
    const newPath = path.join(CARS_DIR, newName);

    if (fs.existsSync(newPath)) {
        console.log(`❌ ${file} — target ${newName} already exists, skipping.`);
        continue;
    }

    plan.push({
        oldName: file,
        newName,
        newID,
        oldID: data.carID ?? "(none)",
        data
    });
}

if (plan.length === 0) {
    console.log("⚠️  No valid files to rename.");
    process.exit(0);
}

// ============================================================================
// 4. Preview / execute
// ============================================================================

console.log("─── RENAME PLAN ─────────────────────────────────────────────");
for (const entry of plan) {
    console.log(`  "${entry.oldName}"`);
    console.log(`     → ${entry.newName}   (carID: ${entry.oldID} → ${entry.newID})`);
}
console.log("─────────────────────────────────────────────────────────────\n");

if (DRY_RUN) {
    console.log("🧪 DRY_RUN = true — no files were modified.");
    console.log("   Flip DRY_RUN to false in the script to actually rename.");
    process.exit(0);
}

let successCount = 0;
let errorCount = 0;

for (const entry of plan) {
    const oldPath = path.join(CARS_DIR, entry.oldName);
    const newPath = path.join(CARS_DIR, entry.newName);

    try {
        // Patch the carID field
        entry.data.carID = entry.newID;
        const json = JSON.stringify(entry.data, null, 4);

        // Write the updated content to the new path first, then remove the old file.
        // (Safer than rename-then-edit: if the edit fails we don't leave a
        // renamed-but-wrong-carID file sitting around.)
        fs.writeFileSync(newPath, json, "utf8");
        fs.unlinkSync(oldPath);

        console.log(`✅ ${entry.oldName} → ${entry.newName}`);
        successCount++;
    } catch (err) {
        console.log(`❌ ${entry.oldName} — ${err.message}`);
        errorCount++;
    }
}

console.log(`\n🏁 Done!`);
console.log(`   Renamed: ${successCount}`);
console.log(`   Failed:  ${errorCount}`);
