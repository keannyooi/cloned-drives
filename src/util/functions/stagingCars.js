"use strict";

/**
 * STAGED CARS AWAITING ARTWORK
 * ============================
 * Scans `src/0 Carfiles to Add/` for carfiles that have no `racehud` yet, so
 * creators can see what needs art and submit some.
 *
 * WHY THE FILESYSTEM AND NOT MONGO: the admin's workflow is
 *   add carfiles → push to git → restart the bot → creators can see them
 * so the folder that ships with the deploy IS the source of truth. The scan
 * runs once at startup; a restart is what publishes a new batch, exactly as
 * dataManager works for the live catalogue.
 *
 * IDENTITY: staged cars are keyed on their real carID, assigned up front by
 * scripts/assignStagingIDs.js. A file still holding the old `"c0"` placeholder
 * has no stable handle and is skipped with a warning — run that script.
 */

const { readdirSync, readFileSync, statSync } = require("fs");
const path = require("path");

const STAGING_ROOT = path.join(__dirname, "../../0 Carfiles to Add");

let cache = null;

/**
 * Some staged files have been through a spreadsheet and come back CSV-escaped
 * — the whole document wrapped in quotes with every `"` doubled. The admin has
 * a script that repairs them on disk; this just makes the scan tolerant so
 * they still show up in the meantime. Read-only: nothing is written back.
 */
function parseTolerantly(raw) {
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        let text = raw.trim();
        if (text.startsWith("\"") && text.endsWith("\"")) text = text.slice(1, -1);
        text = text.replace(/""/g, "\"");
        try {
            return JSON.parse(text);
        }
        catch (stillBroken) {
            return null;
        }
    }
}

/** Valid assigned carID, or "" when the file still holds the placeholder. */
function stagingKeyOf(car) {
    const id = String(car.carID || "").toLowerCase();
    return /^c\d{5}$/.test(id) ? id : "";
}

/** Human-readable name, matching how cars read everywhere else. */
function stagingNameOf(car) {
    const make = (Array.isArray(car.make) ? car.make : [car.make]).filter(Boolean).join(" ");
    return `${make} ${car.model} (${car.modelYear})`;
}

function walk(directory, files = []) {
    for (const entry of readdirSync(directory)) {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) walk(full, files);
        else if (entry.endsWith(".json")) files.push(full);
    }
    return files;
}

/**
 * Scan the staging folder.
 * @returns {{needsArt: Array, scanned: number, unreadable: number}}
 *   needsArt entries: { key, name, file, make, model, modelYear, cr, country }
 */
function scanStaging() {
    let files;
    try {
        files = walk(STAGING_ROOT);
    }
    catch (error) {
        console.log(`[Staging] could not read ${STAGING_ROOT}: ${error.message}`);
        return { needsArt: [], scanned: 0, unreadable: 0 };
    }

    const needsArt = [];
    let unreadable = 0;
    let unassigned = 0;
    for (const file of files) {
        const car = parseTolerantly(readFileSync(file, "utf8"));
        if (!car) { unreadable++; continue; }

        const hasArt = typeof car.racehud === "string" && car.racehud.trim() !== "";
        if (hasArt) continue;
        if (!car.model || !car.modelYear) continue;

        // Without an assigned carID there's nothing for a submission to point
        // at, so the car can't safely be offered.
        const key = stagingKeyOf(car);
        if (!key) { unassigned++; continue; }

        // Both kinds are listed, but they need different things:
        //   "art"    — nobody has drawn this yet, creators can submit
        //   "upload" — a BM card that already HAS art from its submitter and is
        //              only waiting on the admin to put it on file.garden
        // `reference` is what marks the BM family, so no folder-path logic.
        needsArt.push({
            kind: car.reference ? "upload" : "art",
            key,
            name: stagingNameOf(car),
            file: path.relative(path.join(__dirname, "../../.."), file).replace(/\\/g, "/"),
            make: (Array.isArray(car.make) ? car.make : [car.make]).filter(Boolean),
            model: car.model,
            modelYear: car.modelYear,
            cr: typeof car.cr === "number" ? car.cr : null,
            country: car.country || "",
            // Full parsed carfile — cd-review preview renders the real stat
            // block from this, so a reviewer sees the card as it will ship.
            raw: car
        });
    }

    needsArt.sort((a, b) => a.name.localeCompare(b.name));
    if (unassigned > 0) {
        console.log(`[Staging] ${unassigned} carfile(s) still have the "c0" placeholder — run scripts/assignStagingIDs.js`);
    }
    return { needsArt, scanned: files.length, unreadable, unassigned };
}

/** Cached scan — refreshed at startup, or on demand via refreshStaging(). */
function getStagingCars() {
    if (!cache) cache = scanStaging();
    return cache;
}

function refreshStaging() {
    cache = scanStaging();
    return cache;
}

/** One staged car by its key, or null. */
function getStagingCar(key) {
    return getStagingCars().needsArt.find(car => car.key === key) || null;
}

/** Only the cars creators may actually submit artwork for. */
function getOpenForArt() {
    return getStagingCars().needsArt.filter(car => car.kind === "art");
}

/** True when nothing in staging still needs art for this key (i.e. fulfilled). */
function isStillMissingArt(key) {
    return !!getStagingCar(key);
}

module.exports = {
    STAGING_ROOT,
    scanStaging,
    getStagingCars,
    refreshStaging,
    getStagingCar,
    getOpenForArt,
    isStillMissingArt,
    stagingKeyOf,
    stagingNameOf,
    parseTolerantly
};
