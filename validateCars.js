"use strict";

const fs = require("fs");
const path = require("path");
const { normalizeTypeName, TYPE_NAMES, usesReferenceStats } = require("./src/util/functions/cardType.js");

const carsDir = path.join(__dirname, "src", "cars");

// ============================================================================
// VALID VALUES — update these lists when adding new legitimate values
// ============================================================================
const VALID = {
    driveType: ["FWD", "RWD", "AWD", "4WD"],
    tyreType: ["Standard", "Performance", "All-Surface", "Off-Road", "Slick", "Drag"],
    enginePos: ["Front", "Rear", "Middle", "Mixed"],
    bodyStyle: ["Pickup", "Open Air", "Sedan", "Coupe", "Other", "Hatchback", "Convertible", "SUV", "Wagon"],
    fuelType: ["Hybrid", "Electric", "Petrol", "Diesel", "Alternative"],
    gc: ["Low", "Medium", "High"],
    country: [
        "AE", "AR", "AT", "AU", "BE", "BG", "BR", "CH", "CN", "CZ",
        "DE", "DK", "ES", "FI", "FR", "GB", "HK", "HR", "ID", "IN",
        "IT", "JP", "KE", "KR", "LU", "LV", "MC", "MX", "MY", "NL",
        "NO", "NZ", "PL", "RO", "RU", "SE", "SI", "SU", "TR", "TW",
        "US", "VN", "YU", "ZA"
    ],
    tags: [
        "935 ICON", "AF25", "April Fools", "BOSS", "Battle Pack",
        "CD 2.0: New Era", "CD Champions", "CD Chasers", "CD Contenders", "CDCCS",
        "Chop Shop", "Cloned Drives Beta: Last of", "Collectable", "Concept", "Daily Prize",
        "Eargasm", "Eco-Friendly", "Endless Summer", "Eurotech Elite", "Extreme Juggernaut",
        "Full Throttle", "Grand Tourer", "Hot Hatch", "Hypercar", "Innovative",
        "Kei Car", "Liberty Showdown", "Motorsport", "Muscle Car", "OG",
        "Oceanic View", "Oddity", "Rest of The World", "RestoMod", "Servers Choice",
        "Silver Screen", "Sleeper", "Street Racer", "Style Icon", "Super Sedan",
        "Supercar", "The Americas Assault", "The Amplification of Asia",
        "The Japanese Odyssey", "The Midlands Cruise", "The Rest of the Best: 2023",
        "The Royal Collection", "The Tyrol Tour", "The Tyrol Tour: Remix", "Token",
        "Track Day", "Tradable", "Tuner", "Ultra Expensive", "Unique",
        "Visionary Road", "Year of the Horse", "Year of the Rabbit"
    ]
};

// Required fields for a complete (non-stub) car file
const REQUIRED_FIELDS = [
    "carID", "cr", "make", "model", "modelYear", "country",
    "topSpeed", "0to60", "handling", "driveType", "tyreType",
    "cardType", "weight", "gc", "seatCount", "bodyStyle",
    "tcs", "abs", "enginePos", "fuelType", "mra", "ola"
];


// ============================================================================
// VALIDATION
// ============================================================================
const errors = [];
const warnings = [];

function error(file, msg) {
    errors.push(`ERROR  ${file}: ${msg}`);
}

function warn(file, msg) {
    warnings.push(`WARN   ${file}: ${msg}`);
}

// Card type validation — applies to every card file, BM variants and stubs included.
const BM_FAMILY = ["ABM", "IBM", "PBM"];
function checkCardType(file, car) {
    if (car.cardType === undefined) {
        warn(file, `missing cardType — run \`node migrateCardTypes.js --write\` to stamp it`);
        return;
    }
    if (!Array.isArray(car.cardType) || car.cardType.length === 0) {
        error(file, `cardType must be a non-empty array`);
        return;
    }
    for (const t of car.cardType) {
        if (!normalizeTypeName(String(t))) {
            error(file, `Unknown cardType "${t}" (valid: ${TYPE_NAMES.join(", ")})`);
        }
    }
    const base = normalizeTypeName(String(car.cardType[0]));
    if (BM_FAMILY.includes(base) && car.reference === undefined) {
        error(file, `cardType ${base} requires a "reference" field`);
    }
    if (base && !usesReferenceStats(car) && car.reference !== undefined) {
        warn(file, `has "reference" but cardType ${base} does not use it`);
    }
    // Legacy flags are superseded by cardType — flag leftovers
    if (car.isPrize !== undefined) warn(file, `legacy flag "isPrize" present — cardType is the source of truth, remove it`);
    if (car.active !== undefined) warn(file, `legacy flag "active" present — ABM/IBM cardType encodes rotation, remove it`);
    if (car.diamond !== undefined) warn(file, `legacy flag "diamond" present — Diamond cardType encodes it, remove it`);
}

const files = fs.readdirSync(carsDir).filter(f => f.endsWith(".json"));

console.log(`Validating ${files.length} car files...\n`);

for (const file of files) {
    const filePath = path.join(carsDir, file);
    let raw, car;

    // JSON parse check
    try {
        raw = fs.readFileSync(filePath, "utf-8");
        car = JSON.parse(raw);
    } catch (e) {
        error(file, `Invalid JSON: ${e.message}`);
        continue;
    }

    const expectedID = file.replace(".json", "");

    checkCardType(file, car);

    // Black Market variant detection — these only have reference + metadata
    const isBMVariant = car.reference !== undefined;

    // Stub detection — skip detailed gameplay checks for incomplete files
    const isStub = !isBMVariant && !car.topSpeed && !car.handling && !car.driveType;
    if (isStub) {
        warn(file, `Stub file with no gameplay data and no reference field`);
        continue;
    }

    // BM variants: only validate basic fields, skip gameplay checks
    if (isBMVariant && !car.topSpeed) {
        // Basic checks still apply
        if (car.carID !== expectedID) {
            error(file, `carID "${car.carID}" does not match filename "${expectedID}"`);
        }
        if (car.model && typeof car.model === "string" && car.model !== car.model.trim()) {
            error(file, `model has leading/trailing whitespace: "${car.model}"`);
        }
        if (typeof car.make === "string" && car.make !== car.make.trim()) {
            error(file, `make has leading/trailing whitespace: "${car.make}"`);
        }
        if (Array.isArray(car.make)) {
            for (const m of car.make) {
                if (typeof m === "string" && m !== m.trim()) {
                    error(file, `make entry has leading/trailing whitespace: "${m}"`);
                }
            }
        }
        continue;
    }

    // --- carID vs filename ---
    if (car.carID !== expectedID) {
        error(file, `carID "${car.carID}" does not match filename "${expectedID}"`);
    }

    // --- Missing required fields ---
    for (const field of REQUIRED_FIELDS) {
        if (car[field] === undefined || car[field] === null) {
            error(file, `Missing required field: ${field}`);
        }
    }

    // --- Enum field validation ---
    for (const [field, validValues] of Object.entries(VALID)) {
        if (field === "tags" || field === "country") continue; // handled separately
        if (car[field] !== undefined && !validValues.includes(car[field])) {
            error(file, `Invalid ${field}: "${car[field]}" (expected: ${validValues.join(", ")})`);
        }
    }

    // --- Country code ---
    if (car.country !== undefined) {
        if (typeof car.country !== "string" || car.country.length !== 2) {
            error(file, `Invalid country code: "${car.country}" (must be 2-letter code)`);
        } else if (!VALID.country.includes(car.country)) {
            warn(file, `Unknown country code: "${car.country}" — add to VALID.country if intentional`);
        }
    }

    // --- Tags ---
    if (car.tags !== undefined) {
        if (!Array.isArray(car.tags)) {
            error(file, `tags should be an array, got ${typeof car.tags}`);
        } else {
            for (const tag of car.tags) {
                if (tag === "") {
                    warn(file, `Empty string in tags array — use [] instead of [""]`);
                } else if (typeof tag !== "string") {
                    error(file, `Non-string tag value: ${JSON.stringify(tag)}`);
                } else if (tag !== tag.trim()) {
                    error(file, `Tag has leading/trailing whitespace: "${tag}"`);
                } else if (!VALID.tags.includes(tag)) {
                    warn(file, `Unknown tag: "${tag}" — add to VALID.tags if intentional`);
                }
            }
        }
    }

    // --- Boolean fields ---
    for (const field of ["tcs", "abs"]) {
        if (car[field] !== undefined && typeof car[field] !== "boolean") {
            error(file, `${field} should be boolean, got ${typeof car[field]}: ${car[field]}`);
        }
    }

    // --- Numeric fields ---
    for (const field of ["cr", "topSpeed", "0to60", "handling", "weight", "mra", "ola", "seatCount", "modelYear"]) {
        if (car[field] !== undefined && typeof car[field] !== "number") {
            error(file, `${field} should be a number, got ${typeof car[field]}: ${car[field]}`);
        }
    }


    // --- String fields shouldn't have leading/trailing whitespace ---
    for (const field of ["make", "model", "driveType", "tyreType", "enginePos", "bodyStyle", "gc", "fuelType", "country"]) {
        const val = car[field];
        if (typeof val === "string" && val !== val.trim()) {
            error(file, `${field} has leading/trailing whitespace: "${val}"`);
        }
    }

    // --- make can be string or array of strings ---
    if (car.make !== undefined) {
        if (Array.isArray(car.make)) {
            for (const m of car.make) {
                if (typeof m !== "string" || !m.trim()) {
                    error(file, `Invalid make entry in array: ${JSON.stringify(m)}`);
                } else if (m !== m.trim()) {
                    error(file, `make entry has leading/trailing whitespace: "${m}"`);
                }
            }
        } else if (typeof car.make !== "string" || !car.make.trim()) {
            error(file, `Invalid make: ${JSON.stringify(car.make)}`);
        }
    }
}

// ============================================================================
// REPORT
// ============================================================================
console.log("=".repeat(70));
console.log("CAR FILE VALIDATION REPORT");
console.log("=".repeat(70));

if (errors.length > 0) {
    console.log(`\n❌ ERRORS (${errors.length}):\n`);
    errors.forEach(e => console.log(`  ${e}`));
}

if (warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${warnings.length}):\n`);
    warnings.forEach(w => console.log(`  ${w}`));
}

if (errors.length === 0 && warnings.length === 0) {
    console.log("\n✅ All car files passed validation!\n");
}

console.log("\n" + "=".repeat(70));
console.log(`Files scanned: ${files.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log("=".repeat(70));

// Exit with error code if there are errors (useful for CI/pre-push hooks)
if (errors.length > 0) {
    process.exit(1);
}
