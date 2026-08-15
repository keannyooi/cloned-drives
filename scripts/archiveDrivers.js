"use strict";

/**
 * ARCHIVE DRIVERS
 * ===============
 * Moves driver JSONs into `src/drivers/archive/` so they stop loading, without
 * deleting anything. dataManager reads `readdirSync(drivers).filter(endsWith
 * ".json")` — a subfolder name isn't a .json, so archived files are simply
 * invisible to the bot. Move one back and it returns.
 *
 * WHY: a driver with no card art renders as a text-only card, and serialised
 * drivers can't stamp a mint number at all. Better to launch a small roster
 * where every card is finished than a big one where most aren't.
 *
 * LOAD-BEARING IDS — the script refuses to archive these, because something
 * references them by ID and would break silently:
 *   • the default driver everyone owns
 *   • BOSS_SLAYER_DRIVER_ID
 *   • anything in a prizePools.json driverPool
 *   • anything sold in the recruit shop (has a recruitPrice)
 * Override with --force only if you've also updated whatever points at it.
 *
 * Usage:
 *   node scripts/archiveDrivers.js                     what would be archived
 *   node scripts/archiveDrivers.js --keep d00000,d00001,...   set the launch roster
 *   node scripts/archiveDrivers.js --keep ... --apply
 *   node scripts/archiveDrivers.js --restore           bring everything back
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DRIVERS_DIR = path.join(ROOT, "src", "drivers");
const ARCHIVE_DIR = path.join(DRIVERS_DIR, "archive");
const POOLS = path.join(ROOT, "src", "raceweek", "prizePools.json");

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const RESTORE = process.argv.includes("--restore");
const keepArg = process.argv.find(a => a.startsWith("--keep="))
    || (process.argv.includes("--keep") ? "--keep=" + (process.argv[process.argv.indexOf("--keep") + 1] || "") : null);

const readDriver = file => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error) { return null; }
};

// ── restore ─────────────────────────────────────────────────────────────────
if (RESTORE) {
    if (!fs.existsSync(ARCHIVE_DIR)) { console.log("Nothing archived."); process.exit(0); }
    const files = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith(".json"));
    console.log(`${APPLY ? "Restoring" : "Would restore"} ${files.length} driver(s).`);
    if (APPLY) {
        for (const f of files) fs.renameSync(path.join(ARCHIVE_DIR, f), path.join(DRIVERS_DIR, f));
        console.log("🏁 Done.");
    }
    else console.log("Dry run — add --apply.");
    process.exit(0);
}

// ── what's load-bearing ─────────────────────────────────────────────────────
const live = fs.readdirSync(DRIVERS_DIR).filter(f => f.endsWith(".json"));
const drivers = new Map();
for (const f of live) {
    const d = readDriver(path.join(DRIVERS_DIR, f));
    if (d && d.driverID) drivers.set(d.driverID, d);
}

const pinned = new Map();
const pin = (id, why) => { if (id) pinned.set(id, (pinned.get(id) ? pinned.get(id) + "; " : "") + why); };

// Boss Slayer + default driver, read from source rather than hardcoded here
const rwConsts = fs.readFileSync(path.join(ROOT, "src", "util", "consts", "raceWeek.js"), "utf8");
const bossSlayer = (rwConsts.match(/BOSS_SLAYER_DRIVER_ID = "(d\d+)"/) || [])[1];
pin(bossSlayer, "Boss Slayer reward");
const defaultDriver = (rwConsts.match(/default driver everyone owns is (d\d+)/) || [])[1];
pin(defaultDriver, "default driver everyone owns");

// prizePools driver pools
try {
    const pools = JSON.parse(fs.readFileSync(POOLS, "utf8"));
    const walk = (node, where) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node.driverPool)) node.driverPool.forEach(id => pin(id, `prizePools ${where}`));
        for (const [k, v] of Object.entries(node)) {
            // Keys starting with "_" are inert docs (the "_example" week), and
            // getScheduledWeek() skips them — so they pin nothing.
            if (k.startsWith("_") || typeof v !== "object") continue;
            walk(v, where + "." + k);
        }
    };
    walk(pools.rungs || {}, "rung");
    walk(pools.weeks || {}, "week");
}
catch (error) { console.log(`⚠️  prizePools.json unreadable (${error.message}) — pool pins skipped.`); }

// recruit shop
for (const [id, d] of drivers) if (typeof d.recruitPrice === "number") pin(id, "recruit shop");

// ── the roster ──────────────────────────────────────────────────────────────
const keep = new Set(
    keepArg ? keepArg.replace("--keep=", "").split(",").map(s => s.trim()).filter(Boolean) : []
);
if (keep.size === 0) {
    console.log("No --keep list given. Showing the roster and what is load-bearing.\n");
    for (const [id, d] of [...drivers].sort()) {
        const art = (d.image || "").trim() ? "🖼️ " : "   ";
        const why = pinned.get(id);
        console.log(`  ${art}${id}  ${d.rarity.padEnd(11)}${(d.name + (d.variant ? ` (${d.variant})` : "")).padEnd(30)}${why ? "PINNED — " + why : ""}`);
    }
    console.log("\n🖼️ = has card art. PINNED = cannot be archived without updating what references it.");
    console.log("\nExample:\n  node scripts/archiveDrivers.js --keep d00000,d00001,d00002,d00003 --apply");
    process.exit(0);
}

const toArchive = [...drivers.keys()].filter(id => !keep.has(id));
const breaking = toArchive.filter(id => pinned.has(id));

console.log(`Roster: keeping ${keep.size}, archiving ${toArchive.length}.\n`);
const missing = [...keep].filter(id => !drivers.has(id));
if (missing.length > 0) console.log(`⚠️  --keep names drivers that don't exist: ${missing.join(", ")}\n`);

if (breaking.length > 0) {
    console.log("❌ These are load-bearing and would break something:\n");
    for (const id of breaking) console.log(`   ${id}  ${drivers.get(id).name} — ${pinned.get(id)}`);
    if (!FORCE) {
        console.log("\nKeep them, or update what references them and re-run with --force.");
        process.exit(1);
    }
    console.log("\n⚠️  --force given: archiving them anyway.\n");
}

const noArt = [...keep].filter(id => drivers.has(id) && !(drivers.get(id).image || "").trim());
if (noArt.length > 0) {
    console.log(`⚠️  ${noArt.length} of the kept roster have NO card art and will render as text only:`);
    for (const id of noArt) console.log(`   ${id}  ${drivers.get(id).name}`);
    console.log("");
}

console.log(`${APPLY ? "Archiving" : "Would archive"}:`);
for (const id of toArchive) console.log(`   ${id}  ${drivers.get(id).name}`);

if (!APPLY) { console.log("\nDry run — add --apply."); process.exit(0); }

fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
let moved = 0;
for (const id of toArchive) {
    const file = `${id}.json`;
    try {
        fs.renameSync(path.join(DRIVERS_DIR, file), path.join(ARCHIVE_DIR, file));
        moved++;
    }
    catch (error) { console.log(`❌ ${file}: ${error.message}`); }
}
console.log(`\n🏁 Archived ${moved} driver(s) to src/drivers/archive/.`);
console.log("   Restore any time: node scripts/archiveDrivers.js --restore --apply");
