"use strict";

/**
 * FIND SKIPPED CAR IDs
 * ====================
 * Scans all car JSON files in ./src/cars/ and finds any gaps 
 * in the carID numbering sequence (e.g., c00001, c00002, c00004 → c00003 is missing).
 *
 * IMPORTANT: This script ONLY uses the carID derived from the filename.
 * It explicitly IGNORES the "reference" field inside car JSONs, which 
 * contains carIDs pointing to other cars (used by Black Market variants).
 *
 * Usage: Run from the project root directory
 *   node findSkippedCarIDs.js
 */

const { readdirSync, readFileSync } = require("fs");
const path = require("path");

const CARS_DIR = path.join(__dirname, "src", "cars");

// ============================================================================
// 1. Read all car files and extract their carIDs
// ============================================================================

const files = readdirSync(CARS_DIR).filter(f => f.endsWith(".json"));
console.log(`Found ${files.length} total car files.\n`);

const carIDs = [];        // All carIDs from filenames (e.g., "c00001")
const referenceIDs = [];  // IDs found in "reference" fields (for info only)
const nonStandard = [];   // Files that don't match cNNNNN pattern

for (const file of files) {
    const carID = file.slice(0, -5); // Remove .json

    // Check if this follows the standard cNNNNN pattern
    const match = carID.match(/^c(\d+)$/);
    if (!match) {
        nonStandard.push(carID);
        continue;
    }

    carIDs.push({
        id: carID,
        num: parseInt(match[1], 10)
    });

    // Also read the file to log any reference fields (for awareness)
    try {
        const data = JSON.parse(readFileSync(path.join(CARS_DIR, file), "utf8"));
        if (data.reference) {
            referenceIDs.push({
                carID: carID,
                referencesTo: data.reference
            });
        }
    } catch (err) {
        console.warn(`⚠️  Failed to parse ${file}: ${err.message}`);
    }
}

// ============================================================================
// 2. Sort by numeric value and find gaps
// ============================================================================

carIDs.sort((a, b) => a.num - b.num);

const lowest = carIDs[0]?.num ?? 0;
const highest = carIDs[carIDs.length - 1]?.num ?? 0;
const usedNumbers = new Set(carIDs.map(c => c.num));

const skipped = [];
for (let i = lowest; i <= highest; i++) {
    if (!usedNumbers.has(i)) {
        const paddedID = `c${String(i).padStart(5, "0")}`;
        skipped.push({ id: paddedID, num: i });
    }
}

// ============================================================================
// 3. Report results
// ============================================================================

console.log("═══════════════════════════════════════════════");
console.log("           SKIPPED CAR ID REPORT");
console.log("═══════════════════════════════════════════════\n");

console.log(`Car ID range: c${String(lowest).padStart(5, "0")} → c${String(highest).padStart(5, "0")}`);
console.log(`Total standard car files: ${carIDs.length}`);
console.log(`Expected if no gaps:      ${highest - lowest + 1}`);
console.log(`Skipped IDs found:        ${skipped.length}\n`);

if (skipped.length > 0) {
    console.log("─── SKIPPED IDs ────────────────────────────────");
    for (const s of skipped) {
        console.log(`  ❌  ${s.id}  (number ${s.num})`);
    }
    console.log("");
} else {
    console.log("✅ No gaps found! All carIDs are sequential.\n");
}

// Show reference field info
if (referenceIDs.length > 0) {
    console.log("─── BLACK MARKET CARS (have 'reference' field) ─");
    console.log(`  ${referenceIDs.length} cars have a "reference" field.`);
    console.log(`  These were counted by their OWN carID, not the reference.\n`);
    for (const r of referenceIDs) {
        console.log(`{r.carID} → references ${r.referencesTo}`);
    }
    console.log("");
}

// Show any non-standard filenames
if (nonStandard.length > 0) {
    console.log("─── NON-STANDARD FILENAMES (excluded from gap check) ─");
    for (const ns of nonStandard) {
        console.log(`  ⚠️  ${ns}`);
    }
    console.log("");
}

console.log("═══════════════════════════════════════════════");
console.log("Done.");
