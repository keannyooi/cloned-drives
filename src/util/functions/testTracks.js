"use strict";

/**
 * TEST TRACK LOADER — the sandbox pool for `cd-testrace`
 * ======================================================
 * Reads every v2 layout in src/rrtest/, validates it, expands its conditions
 * into runtime variants (trackV2.expandLayout) and keeps them in a map of
 * their own. Nothing here touches the live track map in dataManager, so
 * Random Race, events, Pace Index and PvP never see a test track.
 *
 *   const testTracks = require("./testTracks.js");
 *   testTracks.load();                       // at startup, after dataManager.initialize
 *   testTracks.getTestTrack("rt00001:dry");  // one variant (or null)
 *   testTracks.getTestTracks();              // every variant, in file order
 *   testTracks.getTestLayout("rt00001");     // the layout file + its variants
 *   testTracks.reload();                     // after editing files
 *
 * A file that fails validation is skipped and reported, never fatal: a bad
 * sandbox file must not stop the bot.
 */

const { readdirSync, readFileSync, existsSync } = require("fs");
const path = require("path");
const { validateLayout, expandLayout } = require("./trackV2.js");
const dataManager = require("./dataManager.js");

const FOLDER = "rrtest";

let variants = new Map();      // "rt00001:dry" -> variant
let layouts = new Map();       // "rt00001"     -> { layout, file, variants: [] }
let variantList = [];
let stats = { files: 0, layouts: 0, variants: 0, failed: 0, warnings: 0, errors: [], loadedAt: null, folder: null };

/**
 * @param {string} [basePath="./src"]  same convention as dataManager.initialize
 * @returns {Object} stats
 */
function load(basePath = "./src") {
    const folder = path.join(basePath, FOLDER);
    const next = { files: 0, layouts: 0, variants: 0, failed: 0, warnings: 0, errors: [], loadedAt: new Date().toISOString(), folder };
    const nextVariants = new Map(), nextLayouts = new Map(), nextList = [];

    if (!existsSync(folder)) {
        variants = nextVariants; layouts = nextLayouts; variantList = nextList; stats = next;
        return stats;
    }

    const liveTrackIDs = dataManager.getTrackFiles().map(file => file.replace(/\.json$/, ""));
    const files = readdirSync(folder).filter(file => file.endsWith(".json") && !file.startsWith("_")).sort();

    for (const file of files) {
        next.files++;
        let layout;
        try {
            layout = JSON.parse(readFileSync(path.join(folder, file), "utf8"));
        }
        catch (err) {
            next.failed++;
            next.errors.push({ file, errors: [`not valid JSON — ${err.message}`] });
            continue;
        }
        const report = validateLayout(layout, { liveTrackIDs });
        next.warnings += report.warnings.length;
        if (!report.ok) {
            next.failed++;
            next.errors.push({ file, errors: report.errors });
            continue;
        }
        if (nextLayouts.has(layout.layoutID)) {
            next.failed++;
            next.errors.push({ file, errors: [`layoutID ${layout.layoutID} is already used by ${nextLayouts.get(layout.layoutID).file}`] });
            continue;
        }
        const expanded = expandLayout(layout).map(variant => ({ ...variant, file }));
        nextLayouts.set(layout.layoutID, { layout, file, variants: expanded, warnings: report.warnings });
        for (const variant of expanded) {
            nextVariants.set(variant.trackID, variant);
            nextList.push(variant);
        }
        next.layouts++;
        next.variants += expanded.length;
    }

    variants = nextVariants; layouts = nextLayouts; variantList = nextList; stats = next;
    return stats;
}

function reload(basePath = "./src") {
    return load(basePath);
}

/** Safety net: if startup never called load() (or a consumer runs headless), load on first use. */
function ensureLoaded() {
    if (!stats.loadedAt) load();
}

/** One runtime variant by its full ID ("rt00001:dry"); a bare layout ID returns its first variant. */
function getTestTrack(trackID) {
    ensureLoaded();
    if (!trackID) return null;
    const id = String(trackID).trim();
    if (variants.has(id)) return variants.get(id);
    const layout = layouts.get(id);
    return layout ? layout.variants[0] : null;
}

function getTestTracks() {
    ensureLoaded();
    return variantList.slice();
}

function getTestTrackIDs() {
    ensureLoaded();
    return variantList.map(variant => variant.trackID);
}

function getTestLayout(layoutID) {
    ensureLoaded();
    return layouts.get(String(layoutID).trim()) || null;
}

function getTestLayouts() {
    ensureLoaded();
    return [...layouts.values()];
}

function getStats() {
    return stats;
}

/** The live track a variant was rebuilt from (for side-by-side verdicts), or null. */
function getEquivalentLiveTrack(variant) {
    if (!variant || !variant.equivalentTrackID) return null;
    return dataManager.getTrack(variant.equivalentTrackID) || null;
}

/** One-line startup summary; errors are listed so a broken file is obvious in the log. */
function logSummary() {
    console.log(`🧪 Test tracks: ${stats.layouts} layout(s) → ${stats.variants} variant(s) from ${stats.folder}${stats.failed ? `, ${stats.failed} file(s) skipped` : ""}${stats.warnings ? `, ${stats.warnings} warning(s) (run scripts/raceModel/validateTracks.js)` : ""}`);
    for (const entry of stats.errors) {
        console.error(`   ✖ ${entry.file}: ${entry.errors.join(" | ")}`);
    }
}

module.exports = { load, reload, getTestTrack, getTestTracks, getTestTrackIDs, getTestLayout, getTestLayouts, getEquivalentLiveTrack, getStats, logSummary, FOLDER };
