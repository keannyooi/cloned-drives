"use strict";

const fs = require("fs");
const path = require("path");

const carsDir = path.join(__dirname, "src", "cars");
const files = fs.readdirSync(carsDir).filter(f => f.endsWith(".json"));

const TUNE_PREFIXES = ["333", "666", "699", "969", "996"];
const TUNE_STATS = ["TopSpeed", "0to60", "Handling"];
const TUNE_KEYS = [];
for (const p of TUNE_PREFIXES) {
    for (const s of TUNE_STATS) {
        TUNE_KEYS.push(`${p}${s}`);
    }
}

let filesModified = 0;
let fieldsRemoved = 0;

console.log(`Processing ${files.length} car files...`);
console.log(`Removing fields: ${TUNE_KEYS.join(", ")}\n`);

for (const file of files) {
    const filePath = path.join(carsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const car = JSON.parse(raw);
    let modified = false;

    for (const key of TUNE_KEYS) {
        if (car[key] !== undefined) {
            delete car[key];
            fieldsRemoved++;
            modified = true;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(car, null, 4) + "\n");
        filesModified++;
    }
}

console.log("=".repeat(50));
console.log("CAR TUNE CLEANUP REPORT");
console.log("=".repeat(50));
console.log(`Files modified: ${filesModified} / ${files.length}`);
console.log(`Tune fields removed: ${fieldsRemoved}`);
console.log("=".repeat(50));
