"use strict";

const fs = require("fs");
const path = require("path");

const carsDir = path.join(__dirname, "src", "cars");
const files = fs.readdirSync(carsDir).filter(f => f.endsWith(".json"));

let filesFixed = 0;

// Matches a JSON array that was expanded across multiple lines,
// where each element is a simple value (string, number, boolean)
const expandedArrayRegex = /\[\n\s+(".*?"|[\d.]+|true|false)(?:,\n\s+(".*?"|[\d.]+|true|false))*\n\s+\]/g;

for (const file of files) {
    const filePath = path.join(carsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");

    const fixed = raw.replace(expandedArrayRegex, (match) => {
        // Extract just the values, strip whitespace/newlines
        const values = match
            .replace(/^\[\n\s+/, "")
            .replace(/\n\s+\]$/, "")
            .split(/,\n\s+/);
        return "[" + values.join(",") + "]";
    });

    if (fixed !== raw) {
        try {
            fs.writeFileSync(filePath, fixed);
            filesFixed++;
        } catch (e) {
            console.log(`SKIP ${file}: ${e.message}`);
        }
    }
}

console.log(`Fixed array formatting in ${filesFixed} / ${files.length} files.`);
