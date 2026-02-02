"use strict";

/**
 * BULK TAG MANAGER
 * ================
 * Standalone CLI utility for adding/removing tags from car JSON files in bulk.
 * Run from your project root (where src/ lives).
 *
 * USAGE:
 *   node bulk-tags.js <add|remove> "<tag>" [filters...] [options]
 *
 * ACTIONS:
 *   add      Add a tag to all matching cars (skips cars that already have it)
 *   remove   Remove a tag from all matching cars (skips cars that don't have it)
 *
 * FILTERS (all optional, combine as many as you want — they AND together):
 *   --make <name>             Filter by manufacturer (case-insensitive)
 *   --country <code>          Filter by country code (e.g. JP, DE, US)
 *   --cr-min <number>         Minimum CR (inclusive)
 *   --cr-max <number>         Maximum CR (inclusive)
 *   --year-min <number>       Minimum model year (inclusive)
 *   --year-max <number>       Maximum model year (inclusive)
 *   --years <y1,y2,...>       Specific model years (comma-separated)
 *   --drive-type <type>       Filter by drive type (FWD, RWD, AWD, 4WD)
 *   --body-style <style>      Filter by body style (sedan, coupe, suv, etc.)
 *   --engine-pos <pos>        Filter by engine position (front, middle, rear)
 *   --fuel-type <type>        Filter by fuel type (petrol, diesel, electric, etc.)
 *   --tyre-type <type>        Filter by tyre type (standard, performance, etc.)
 *   --gc <clearance>          Filter by ground clearance (low, medium, high)
 *   --has-tag <tag>           Only cars that already have this tag
 *   --no-tag <tag>            Only cars that do NOT have this tag
 *   --collection <name>       Filter by collection name
 *   --creator <name>          Filter by creator name
 *   --is-prize                Only prize cars
 *   --not-prize               Only non-prize cars
 *   --is-bm                   Only black market cars (have a "reference" field)
 *   --not-bm                  Only non-black-market cars
 *   --search <keyword>        Keyword search in make + model name
 *   --ids <c00001,c00002,...> Comma-separated list of specific car IDs
 *
 * OPTIONS:
 *   --dry-run                 Preview changes without writing to files
 *   --cars-dir <path>         Path to cars directory (default: ./src/cars)
 *   --verbose                 Show every file being modified
 *   --filter-logic <and|or>   How filters combine: "and" (all must match, default) or "or" (any can match)
 *
 * EXAMPLES:
 *   # Add "year of the horse" to all Japanese cars
 *   node bulk-tags.js add "year of the horse" --country JP
 *
 *   # Add "dragster" to all RWD cars with CR 80+
 *   node bulk-tags.js add "dragster" --drive-type RWD --cr-min 80
 *
 *   # Remove "legacy" tag from all cars that have it
 *   node bulk-tags.js remove "legacy" --has-tag legacy
 *
 *   # Preview what would be tagged without writing anything
 *   node bulk-tags.js add "vintage" --year-max 1970 --dry-run
 *
 *   # Tag specific cars by ID
 *   node bulk-tags.js add "event reward" --ids c00100,c00200,c00305
 *
 *   # Tag cars from specific years
 *   node bulk-tags.js add "nostalgic" --years 1989,1996,2002
 *
 *   # Use OR logic — match German OR Japanese cars
 *   node bulk-tags.js add "axis of speed" --country DE --country JP --filter-logic or
 *
 *   # Add a tag to all BMWs in the 2010s decade
 *   node bulk-tags.js add "modern bimmer" --make BMW --year-min 2010 --year-max 2019
 */

const fs = require("fs");
const path = require("path");

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function parseArgs(argv) {
    const args = argv.slice(2); // skip node and script path

    if (args.length < 2 || ["--help", "-h", "help"].includes(args[0])) {
        printUsage();
        process.exit(0);
    }

    const action = args[0].toLowerCase();
    if (!["add", "remove"].includes(action)) {
        console.error(`❌ Invalid action "${args[0]}". Must be "add" or "remove".`);
        process.exit(1);
    }

    const tag = args[1];
    if (!tag || tag.startsWith("--")) {
        console.error(`❌ Missing tag name. Usage: node bulk-tags.js ${action} "<tag name>" [filters...]`);
        process.exit(1);
    }

    const filters = {};
    const options = {
        dryRun: false,
        carsDir: "./src/cars",
        verbose: false,
        filterLogic: "and", // "and" or "or"
    };

    // Helper: push to array filter (supports repeatable flags)
    function pushFilter(key, value) {
        if (!filters[key]) filters[key] = [];
        filters[key].push(value);
    }

    let i = 2;
    while (i < args.length) {
        const flag = args[i];
        switch (flag) {
            // --- Filters (repeatable: multiple values OR together within the group) ---
            case "--make":
                pushFilter("make", args[++i]);
                break;
            case "--country":
                pushFilter("country", args[++i]);
                break;
            case "--cr-min":
                filters.crMin = parseInt(args[++i], 10);
                break;
            case "--cr-max":
                filters.crMax = parseInt(args[++i], 10);
                break;
            case "--year-min":
                filters.yearMin = parseInt(args[++i], 10);
                break;
            case "--year-max":
                filters.yearMax = parseInt(args[++i], 10);
                break;
            case "--years":
                filters.years = args[++i].split(",").map(y => parseInt(y.trim(), 10));
                break;
            case "--drive-type":
                pushFilter("driveType", args[++i]);
                break;
            case "--body-style":
                pushFilter("bodyStyle", args[++i]);
                break;
            case "--engine-pos":
                pushFilter("enginePos", args[++i]);
                break;
            case "--fuel-type":
                pushFilter("fuelType", args[++i]);
                break;
            case "--tyre-type":
                pushFilter("tyreType", args[++i]);
                break;
            case "--gc":
                pushFilter("gc", args[++i]);
                break;
            case "--has-tag":
                if (!filters.hasTags) filters.hasTags = [];
                filters.hasTags.push(args[++i]);
                break;
            case "--no-tag":
                if (!filters.noTags) filters.noTags = [];
                filters.noTags.push(args[++i]);
                break;
            case "--collection":
                pushFilter("collection", args[++i]);
                break;
            case "--creator":
                pushFilter("creator", args[++i]);
                break;
            case "--is-prize":
                filters.isPrize = true;
                break;
            case "--not-prize":
                filters.isPrize = false;
                break;
            case "--is-bm":
                filters.isBM = true;
                break;
            case "--not-bm":
                filters.isBM = false;
                break;
            case "--search":
                pushFilter("search", args[++i]);
                break;
            case "--ids":
                filters.ids = args[++i].split(",").map(id => id.trim().replace(/\.json$/, ""));
                break;

            // --- Options ---
            case "--dry-run":
                options.dryRun = true;
                break;
            case "--cars-dir":
                options.carsDir = args[++i];
                break;
            case "--verbose":
                options.verbose = true;
                break;
            case "--filter-logic":
                options.filterLogic = args[++i]?.toLowerCase();
                if (!["and", "or"].includes(options.filterLogic)) {
                    console.error(`❌ --filter-logic must be "and" or "or", got "${options.filterLogic}"`);
                    process.exit(1);
                }
                break;

            default:
                console.error(`⚠️  Unknown flag: ${flag} (ignoring)`);
                break;
        }
        i++;
    }

    return { action, tag, filters, options };
}

// ============================================================================
// CAR MATCHING
// ============================================================================

/**
 * Individual filter check functions.
 * Each returns true if the car PASSES that specific filter.
 */
const filterChecks = {
    // IDs — always AND (pre-filter, not part of logic toggle)
    ids: (car, carID, value) => value.includes(carID),

    // Make (case-insensitive, supports array makes on the car; filter value is an array)
    make: (car, carID, values) => {
        const makes = Array.isArray(car.make) ? car.make : [car.make];
        return values.some(v => makes.some(m => m.toLowerCase() === v.toLowerCase()));
    },

    // Country (filter value is an array)
    country: (car, carID, values) => {
        if (!car.country) return false;
        return values.some(v => car.country.toLowerCase() === v.toLowerCase());
    },

    // CR range
    crMin: (car, carID, value) => car.cr >= value,
    crMax: (car, carID, value) => car.cr <= value,

    // Year range
    yearMin: (car, carID, value) => car.modelYear >= value,
    yearMax: (car, carID, value) => car.modelYear <= value,

    // Specific years list
    years: (car, carID, values) => values.includes(car.modelYear),

    // Drive type (array filter)
    driveType: (car, carID, values) => {
        if (!car.driveType) return false;
        return values.some(v => car.driveType.toLowerCase() === v.toLowerCase());
    },

    // Body style (array filter, car can also have array)
    bodyStyle: (car, carID, values) => {
        const styles = Array.isArray(car.bodyStyle) ? car.bodyStyle : [car.bodyStyle];
        return values.some(v => styles.some(s => s && s.toLowerCase() === v.toLowerCase()));
    },

    // Engine position (array filter)
    enginePos: (car, carID, values) => {
        if (!car.enginePos) return false;
        return values.some(v => car.enginePos.toLowerCase() === v.toLowerCase());
    },

    // Fuel type (array filter)
    fuelType: (car, carID, values) => {
        if (!car.fuelType) return false;
        return values.some(v => car.fuelType.toLowerCase() === v.toLowerCase());
    },

    // Tyre type (array filter)
    tyreType: (car, carID, values) => {
        if (!car.tyreType) return false;
        return values.some(v => car.tyreType.toLowerCase() === v.toLowerCase());
    },

    // Ground clearance (array filter)
    gc: (car, carID, values) => {
        if (!car.gc) return false;
        return values.some(v => car.gc.toLowerCase() === v.toLowerCase());
    },

    // Has specific tags (always AND — must have ALL listed tags)
    hasTags: (car, carID, values) => {
        const carTags = (car.tags || []).map(t => t.toLowerCase());
        return values.every(v => carTags.includes(v.toLowerCase()));
    },

    // Does NOT have specific tags (always AND — must lack ALL listed tags)
    noTags: (car, carID, values) => {
        const carTags = (car.tags || []).map(t => t.toLowerCase());
        return values.every(v => !carTags.includes(v.toLowerCase()));
    },

    // Collection (array filter)
    collection: (car, carID, values) => {
        const collections = Array.isArray(car.collection) ? car.collection : [car.collection];
        return values.some(v => collections.some(c => c && c.toLowerCase() === v.toLowerCase()));
    },

    // Creator (array filter)
    creator: (car, carID, values) => {
        if (!car.creator) return false;
        return values.some(v => car.creator.toLowerCase() === v.toLowerCase());
    },

    // Prize status
    isPrize: (car, carID, value) => value ? !!car.isPrize : !car.isPrize,

    // BM status
    isBM: (car, carID, value) => value ? car.reference !== undefined : car.reference === undefined,

    // Search keyword (array filter — any keyword matches)
    search: (car, carID, values) => {
        const make = Array.isArray(car.make) ? car.make.join(" ") : (car.make || "");
        const fullName = `${make} ${car.model || ""} ${car.modelYear || ""}`.toLowerCase();
        return values.some(v => fullName.includes(v.toLowerCase()));
    },
};

// Filters that are always AND regardless of --filter-logic (pre-conditions)
const alwaysAndFilters = ["ids", "hasTags", "noTags"];

function carMatchesFilters(car, carID, filters, filterLogic) {
    // Collect applicable filter keys
    const activeKeys = Object.keys(filters).filter(key => {
        const value = filters[key];
        return value !== undefined && filterChecks[key];
    });

    if (activeKeys.length === 0) return true;

    // Split into "always AND" and "logic-controlled" filters
    const andKeys = activeKeys.filter(k => alwaysAndFilters.includes(k));
    const logicKeys = activeKeys.filter(k => !alwaysAndFilters.includes(k));

    // Always-AND filters must all pass
    for (const key of andKeys) {
        if (!filterChecks[key](car, carID, filters[key])) return false;
    }

    // Logic-controlled filters
    if (logicKeys.length === 0) return true;

    if (filterLogic === "or") {
        // OR mode: at least one logic filter must pass
        return logicKeys.some(key => filterChecks[key](car, carID, filters[key]));
    } else {
        // AND mode (default): all logic filters must pass
        return logicKeys.every(key => filterChecks[key](car, carID, filters[key]));
    }
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

function run() {
    const { action, tag, filters, options } = parseArgs(process.argv);
    const carsDir = path.resolve(options.carsDir);

    // Validate cars directory
    if (!fs.existsSync(carsDir)) {
        console.error(`❌ Cars directory not found: ${carsDir}`);
        console.error(`   Make sure you're running this from your project root, or use --cars-dir`);
        process.exit(1);
    }

    const files = fs.readdirSync(carsDir).filter(f => f.endsWith(".json"));
    console.log(`📂 Found ${files.length} car files in ${carsDir}`);

    // Describe active filters
    const activeFilters = Object.entries(filters).filter(([, v]) => v !== undefined);
    if (activeFilters.length === 0) {
        console.log(`⚠️  No filters set — this will affect ALL ${files.length} cars!`);
        if (!options.dryRun) {
            console.log(`   Run with --dry-run first to preview, or add filters to narrow scope.`);
            console.log(`   Proceeding in 3 seconds... (Ctrl+C to cancel)`);
            // Synchronous delay for safety
            const start = Date.now();
            while (Date.now() - start < 3000) { /* wait */ }
        }
    } else {
        console.log(`🔍 Active filters (${options.filterLogic.toUpperCase()} mode):`);
        for (const [key, value] of activeFilters) {
            console.log(`   ${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
        }
    }

    console.log(`\n${action === "add" ? "➕ Adding" : "➖ Removing"} tag: "${tag}"`);
    if (options.dryRun) console.log(`🏃 DRY RUN — no files will be modified\n`);
    else console.log();

    let matched = 0;
    let modified = 0;
    let skipped = 0;
    const modifiedCars = [];

    for (const file of files) {
        const filePath = path.join(carsDir, file);
        const carID = file.slice(0, -5);

        let car;
        try {
            car = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (err) {
            console.error(`   ⚠️  Failed to parse ${file}: ${err.message}`);
            continue;
        }

        // Check filters
        if (!carMatchesFilters(car, carID, filters, options.filterLogic)) continue;
        matched++;

        // Ensure tags array exists
        if (!Array.isArray(car.tags)) {
            car.tags = [];
        }

        const tagLower = tag.toLowerCase();
        const existingIndex = car.tags.findIndex(t => t.toLowerCase() === tagLower);

        if (action === "add") {
            if (existingIndex !== -1) {
                skipped++;
                if (options.verbose) {
                    const make = Array.isArray(car.make) ? car.make[0] : car.make;
                    console.log(`   ⏭️  ${carID} — ${make} ${car.model} (already has tag)`);
                }
                continue;
            }
            car.tags.push(tag);
        } else {
            // remove
            if (existingIndex === -1) {
                skipped++;
                if (options.verbose) {
                    const make = Array.isArray(car.make) ? car.make[0] : car.make;
                    console.log(`   ⏭️  ${carID} — ${make} ${car.model} (doesn't have tag)`);
                }
                continue;
            }
            car.tags.splice(existingIndex, 1);
        }

        modified++;
        const make = Array.isArray(car.make) ? car.make[0] : car.make;
        modifiedCars.push({ carID, name: `${make} ${car.model} (${car.modelYear})` });

        if (options.verbose) {
            console.log(`   ✏️  ${carID} — ${make} ${car.model} (${car.modelYear})`);
        }

        // Write back to file (unless dry run)
        if (!options.dryRun) {
            try {
                fs.writeFileSync(filePath, JSON.stringify(car, null, 4), "utf8");
            } catch (err) {
                console.error(`   ❌ Failed to write ${file}: ${err.message}`);
                modified--;
            }
        }
    }

    // Summary
    console.log(`\n${"=".repeat(50)}`);
    console.log(`📊 RESULTS${options.dryRun ? " (DRY RUN)" : ""}`);
    console.log(`${"=".repeat(50)}`);
    console.log(`   Cars scanned:  ${files.length}`);
    console.log(`   Matched filter: ${matched}`);
    console.log(`   ${action === "add" ? "Tags added" : "Tags removed"}:    ${modified}`);
    console.log(`   Skipped:        ${skipped} (${action === "add" ? "already had tag" : "didn't have tag"})`);

    if (options.dryRun && modified > 0) {
        console.log(`\n📝 Cars that would be ${action === "add" ? "tagged" : "untagged"}:`);
        for (const car of modifiedCars) {
            console.log(`   ${car.carID} — ${car.name}`);
        }
        console.log(`\nRun without --dry-run to apply changes.`);
    }

    if (!options.dryRun && modified > 0) {
        console.log(`\n✅ Done! ${modified} files updated.`);
        console.log(`💡 Remember to restart the bot (or use cd-reload) to reload car data.`);
    }
}

// ============================================================================
// HELP TEXT
// ============================================================================

function printUsage() {
    console.log(`
BULK TAG MANAGER
================
Add or remove tags from car JSON files in bulk.

USAGE:
  node bulk-tags.js <add|remove> "<tag>" [filters...] [options]

EXAMPLES:
  node bulk-tags.js add "year of the horse" --country JP
  node bulk-tags.js add "dragster" --drive-type RWD --cr-min 80
  node bulk-tags.js add "vintage" --year-max 1970 --dry-run
  node bulk-tags.js add "event reward" --ids c00100,c00200,c00305
  node bulk-tags.js add "nostalgic" --years 1989,1996,2002
  node bulk-tags.js add "axis of speed" --country DE --country JP --filter-logic or
  node bulk-tags.js remove "legacy" --has-tag legacy

FILTERS (combine any — default AND, use --filter-logic or for OR):
  --make <name>           Manufacturer (repeatable: --make BMW --make Audi)
  --country <code>        Country code (repeatable: --country JP --country DE)
  --cr-min <n>            Minimum CR (inclusive)
  --cr-max <n>            Maximum CR (inclusive)
  --year-min <n>          Minimum model year (inclusive)
  --year-max <n>          Maximum model year (inclusive)
  --years <y1,y2,...>     Specific model years (comma-separated)
  --drive-type <type>     Drive type (repeatable)
  --body-style <style>    Body style (repeatable)
  --engine-pos <pos>      Engine position (repeatable)
  --fuel-type <type>      Fuel type (repeatable)
  --tyre-type <type>      Tyre type (repeatable)
  --gc <clearance>        Ground clearance (repeatable)
  --has-tag <tag>         Only cars with this tag (repeatable, always AND)
  --no-tag <tag>          Only cars WITHOUT this tag (repeatable, always AND)
  --collection <name>     Collection name (repeatable)
  --creator <name>        Creator name (repeatable)
  --is-prize              Only prize cars
  --not-prize             Only non-prize cars
  --is-bm                 Only black market cars
  --not-bm                Only non-BM cars
  --search <keyword>      Keyword in car name (repeatable)
  --ids <id1,id2,...>     Specific car IDs (comma-separated, always AND)

OPTIONS:
  --dry-run               Preview without writing changes
  --verbose               Show every car being processed
  --cars-dir <path>       Path to cars folder (default: ./src/cars)
  --filter-logic <and|or> How filters combine (default: and)
                          AND = car must match ALL filters
                          OR  = car must match ANY filter

NOTES ON FILTER LOGIC:
  --ids, --has-tag, and --no-tag are always AND regardless of --filter-logic.
  Repeatable flags (like --country JP --country DE) match if the car matches
  ANY value for that flag, even in AND mode. The AND/OR controls how DIFFERENT
  filter types combine with each other.

  Example: --country JP --country DE --drive-type RWD (AND mode, default)
    -> Car must be (JP or DE) AND RWD

  Example: --country JP --drive-type RWD --fuel-type electric (OR mode)
    -> Car must be JP OR RWD OR electric
`);
}

// ============================================================================
// RUN
// ============================================================================

run();
