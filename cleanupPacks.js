"use strict";

const fs = require("fs");
const path = require("path");

const packsDir = path.join(__dirname, "src", "packs");
const files = fs.readdirSync(packsDir).filter(f => f.endsWith(".json"));

const RARITY_KEYS = ["standard", "common", "uncommon", "rare", "epic", "exotic", "legendary", "mystic"];

let stats = {
    filesModified: 0,
    zerosRemoved: 0,
    nonesRemoved: 0,
    defaultYearsRemoved: 0
};

console.log(`Processing ${files.length} pack files...\n`);

for (const file of files) {
    const filePath = path.join(packsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const pack = JSON.parse(raw);
    let modified = false;

    // 1. Remove zero-value rarity entries from packSequence slots
    if (pack.packSequence) {
        for (const slot of pack.packSequence) {
            // Handle legacy format (rarities directly on slot)
            if (!slot.rates) {
                for (const key of RARITY_KEYS) {
                    if (slot[key] === 0) {
                        delete slot[key];
                        stats.zerosRemoved++;
                        modified = true;
                    }
                }
            } else {
                // New format: rarities inside slot.rates
                for (const key of RARITY_KEYS) {
                    if (slot.rates[key] === 0) {
                        delete slot.rates[key];
                        stats.zerosRemoved++;
                        modified = true;
                    }
                }
            }
        }
    }

    // 2. Remove "None" filter entries
    if (pack.filter) {
        for (const key of Object.keys(pack.filter)) {
            if (pack.filter[key] === "None") {
                delete pack.filter[key];
                stats.nonesRemoved++;
                modified = true;
            }
        }

        // 3. Remove default modelYear range (1000-3000) — matches everything
        if (pack.filter.modelYear &&
            pack.filter.modelYear.start === 1000 &&
            pack.filter.modelYear.end === 3000) {
            delete pack.filter.modelYear;
            stats.defaultYearsRemoved++;
            modified = true;
        }

        // If filter is now empty, remove it entirely
        if (Object.keys(pack.filter).length === 0) {
            delete pack.filter;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(pack, null, 4) + "\n");
        stats.filesModified++;
    }
}

console.log("=".repeat(50));
console.log("PACK CLEANUP REPORT");
console.log("=".repeat(50));
console.log(`Files modified: ${stats.filesModified} / ${files.length}`);
console.log(`Zero-value rarities removed: ${stats.zerosRemoved}`);
console.log(`"None" filter entries removed: ${stats.nonesRemoved}`);
console.log(`Default year ranges removed: ${stats.defaultYearsRemoved}`);
console.log("=".repeat(50));
