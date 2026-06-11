"use strict";

/**
 * GENERATE PVP EVENT TEMPLATES
 * =============================
 * Builds 10 themed PvP event templates as JSON files in src/pvpevents/.
 * For each template, finds real eligible cars matching the filter so that the
 * ghost decks pass startpvp validation (cars exist + match reqs).
 *
 * Usage:  node generatePvpTemplates.js
 *
 * Re-running OVERWRITES existing pe000XX.json files. Edit `THEMES` below to
 * tweak any individual template.
 */

const fs = require("fs");
const path = require("path");
const { initialize, getAllCars, getCar } = require("./src/util/functions/dataManager.js");
const { usesReferenceStats, isPrizeLike } = require("./src/util/functions/cardType.js");

initialize("./src");

const all = getAllCars();
// Filter helper — checks a car against a reqs object (the same shape startpvp validates)
function matchesReqs(car, reqs) {
    if (usesReferenceStats(car)) return false;  // skip BM variants — diamond/standalone only
    if (isPrizeLike(car)) return false;         // skip prize cars (most are unobtainable normally)
    if (!reqs) return true;
    for (const [key, val] of Object.entries(reqs)) {
        if (key === "cr" || key === "modelYear" || key === "weight" || key === "topSpeed" || key === "0to60" || key === "handling") {
            const v = car[key];
            if (typeof v !== "number") return false;
            if (v < val.start || v > val.end) return false;
        }
        else if (Array.isArray(val)) {
            const carVal = car[key];
            if (carVal === undefined || carVal === null) return false;
            const arr = Array.isArray(carVal) ? carVal : [carVal];
            const lower = val.map(v => String(v).toLowerCase());
            const hit = arr.some(a => lower.includes(String(a).toLowerCase()));
            if (!hit) return false;
        }
        else if (typeof val === "boolean") {
            if (car[key] !== val) return false;
        }
    }
    return true;
}

/** Pick N random cars from a pool (with no duplicates). Returns array of carIDs. */
function pickN(pool, n) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n).map(c => c.carID);
}

/** Build a 5-car ghost deck with a given tune. Picks random eligible cars.
 *  If `deckCrCap` > 0, repeatedly tries to find a 5-car combo whose CR sum fits the cap.
 *  Falls back to "lowest 5 CR" if random sampling fails after many tries.
 */
function buildGhost(name, pool, tune, deckCrCap) {
    function attempt() {
        if (pool.length < 5) {
            const ids = [];
            for (let i = 0; i < 5; i++) ids.push(pool[Math.floor(Math.random() * pool.length)].carID);
            return ids;
        }
        return pickN(pool, 5);
    }
    function sumCR(ids) {
        return ids.reduce((s, id) => s + (pool.find(c => c.carID === id)?.cr || 0), 0);
    }

    if (deckCrCap > 0) {
        // Try up to 200 random samples to fit the cap
        for (let i = 0; i < 200; i++) {
            const ids = attempt();
            if (sumCR(ids) <= deckCrCap) return { name, deck: ids, upgrades: Array(5).fill(tune) };
        }
        // Fallback: take the 5 lowest-CR cars
        const sorted = [...pool].sort((a, b) => (a.cr || 0) - (b.cr || 0));
        const ids = sorted.slice(0, 5).map(c => c.carID);
        if (sumCR(ids) > deckCrCap) {
            console.warn(`   ⚠️ ${name}: even the 5 lowest-CR cars (${sumCR(ids)}) exceed cap ${deckCrCap}. Cap may be too tight.`);
        }
        return { name, deck: ids, upgrades: Array(5).fill(tune) };
    }

    return { name, deck: attempt(), upgrades: Array(5).fill(tune) };
}

// ============================================================================
// THEMES — edit this list to tune any template
// ============================================================================

const THEMES = [
    // Skip pe00001 — already exists (Tuner Tournament)
    {
        id: "pe00002",
        name: "American Muscle Showdown",
        duration: "5d",
        deckCrCap: 2000,
        reqs: { country: ["US"], modelYear: { start: 1965, end: 1995 }, driveType: ["RWD"] },
        tracksets: [
            ["t00055", "t00016", "t00008", "t00033", "t00034"],   // pure speed: drag + Daytona
            ["t00055", "t00016", "t00033", "t00034", "t00038"],   // mostly oval/speedway
            ["t00021", "t00023", "t00033", "t00088", "t00038"]    // city + circuit mix
        ],
        ghostNames: [
            ["Big Block Bandit", "Detroit Iron"],
            ["Speedway Slugger", "Bourbon Bandit"],
            ["Boulevard Bruiser", "Hemi Hauler"]
        ],
        tunes: ["996", "996", "969"]   // drag, drag, balanced
    },
    {
        id: "pe00003",
        name: "Eurotech Elite",
        duration: "7d",
        deckCrCap: 3000,
        reqs: { country: ["DE", "IT"], cr: { start: 500, end: 750 } },
        tracksets: [
            ["t00073", "t00068", "t00018", "t00197", "t00100"],   // GT circuit run
            ["t00055", "t00016", "t00033", "t00038", "t00068"],   // speed-focused
            ["t00073", "t00031", "t00064", "t00219", "t00197"]    // twisty/mountain
        ],
        ghostNames: [
            ["Stuttgart Strike", "Modena Maestro"],
            ["Autobahn Apex", "Milan Missile"],
            ["Black Forest Beast", "Dolomite Dragon"]
        ],
        tunes: ["969", "996", "699"]
    },
    {
        id: "pe00004",
        name: "Hot Hatch Heroes",
        duration: "5d",
        deckCrCap: 1800,
        reqs: { bodyStyle: ["Hatchback"], driveType: ["FWD"], cr: { start: 200, end: 480 } },
        tracksets: [
            ["t00100", "t00064", "t00031", "t00039", "t00219"],   // pure twisty
            ["t00021", "t00023", "t00027", "t00029", "t00038"],   // city + small circuit
            ["t00064", "t00100", "t00021", "t00023", "t00038"]    // mixed
        ],
        ghostNames: [
            ["Pocket Rocket", "Tyre Smoker"],
            ["Boulevard Cruiser", "Lane Splitter"],
            ["Daily Demon", "Backstreet Bullet"]
        ],
        tunes: ["699", "699", "969"]
    },
    {
        id: "pe00005",
        name: "Vintage Classics",
        duration: "7d",
        reqs: { modelYear: { start: 1950, end: 1979 }, cr: { start: 100, end: 350 } },
        tracksets: [
            ["t00055", "t00008", "t00033", "t00038", "t00018"],    // post-war speed
            ["t00100", "t00064", "t00031", "t00039", "t00018"],    // grand tour twisty
            ["t00021", "t00038", "t00100", "t00018", "t00033"]     // mixed circuit + city
        ],
        ghostNames: [
            ["Sunday Driver", "Garage Find"],
            ["Period Correct", "Concours Contender"],
            ["Old Iron", "Patina Project"]
        ],
        tunes: ["996", "699", "969"]
    },
    {
        id: "pe00006",
        name: "Hypercar Hunters",
        duration: "10d",
        deckCrCap: 4500,
        reqs: { cr: { start: 700, end: 999 } },
        tracksets: [
            ["t00055", "t00016", "t00008", "t00038", "t00033"],    // top-end speed
            ["t00073", "t00068", "t00100", "t00018", "t00197"],    // circuit GT
            ["t00072", "t00067", "t00099", "t00150", "t00041"]     // wet circuit (rainy)
        ],
        ghostNames: [
            ["Veyron Veteran", "Chiron Chaser"],
            ["Track Annihilator", "Apex Predator"],
            ["Wet Track Wizard", "Storm Slayer"]
        ],
        tunes: ["996", "969", "699"]
    },
    {
        id: "pe00007",
        name: "Eco-Friendly Cup",
        duration: "5d",
        reqs: { fuelType: ["Hybrid", "Electric"], modelYear: { start: 2010, end: 2025 } },
        tracksets: [
            ["t00021", "t00023", "t00027", "t00029", "t00163"],    // urban / E-Prix
            ["t00163", "t00023", "t00021", "t00038", "t00100"],    // efficient circuits
            ["t00064", "t00100", "t00031", "t00038", "t00163"]     // handling-focused
        ],
        ghostNames: [
            ["Silent Streaker", "Volt Voyager"],
            ["Watt Warrior", "Charge Champion"],
            ["Regen Racer", "Battery Banshee"]
        ],
        tunes: ["969", "969", "699"]
    },
    {
        id: "pe00008",
        name: "JDM Legends",
        duration: "7d",
        deckCrCap: 2500,
        reqs: { country: ["JP"], cr: { start: 400, end: 650 }, modelYear: { start: 1980, end: 2010 } },
        tracksets: [
            ["t00064", "t00031", "t00219", "t00100", "t00073"],    // touge / mountain
            ["t00088", "t00033", "t00038", "t00041", "t00068"],    // wangan / highway
            ["t00100", "t00099", "t00031", "t00064", "t00041"]     // drift course twisty
        ],
        ghostNames: [
            ["Mt. Akina Master", "Initial Demon"],
            ["Wangan Wraith", "Devil-Z Echo"],
            ["Drift King", "Ebisu Specialist"]
        ],
        tunes: ["699", "996", "699"]
    },
    {
        id: "pe00009",
        name: "Drag Strip Domination",
        duration: "5d",
        reqs: { tyreType: ["Drag", "Slick", "Performance"], cr: { start: 400, end: 999 } },
        tracksets: [
            ["t00008", "t00055", "t00016", "t00038", "t00033"],    // sunny drag x3 + circuit
            ["t00006", "t00053", "t00014", "t00038", "t00088"],    // rainy drag
            ["t00055", "t00016", "t00008", "t00055", "t00016"]     // pure drag chaos
        ],
        ghostNames: [
            ["Quarter-Mile King", "Christmas Tree"],
            ["Wet Strip Wizard", "Tire Heater"],
            ["Burnout Boss", "Launch Control"]
        ],
        tunes: ["996", "996", "996"]
    },
    {
        id: "pe00010",
        name: "Off-Road Rampage",
        duration: "5d",
        reqs: { tyreType: ["All-Surface", "Off-Road"], driveType: ["AWD", "4WD"] },
        tracksets: [
            ["t00000", "t00009", "t00035", "t00049", "t00120"],    // dirt across the board
            ["t00007", "t00015", "t00028", "t00046", "t00003"],    // snow & ice
            ["t00004", "t00012", "t00036", "t00120", "t00124"]     // mud & gravel
        ],
        ghostNames: [
            ["Dust Devil", "Gravel Grinder"],
            ["Snow Slider", "Ice Tracker"],
            ["Mud Slinger", "Marsh Monster"]
        ],
        tunes: ["969", "969", "969"]
    },
    {
        id: "pe00011",
        name: "Lightweight League",
        duration: "5d",
        deckCrCap: 2000,
        reqs: { weight: { start: 600, end: 1300 }, cr: { start: 200, end: 600 } },
        tracksets: [
            ["t00100", "t00064", "t00031", "t00039", "t00219"],    // pure handling
            ["t00021", "t00023", "t00027", "t00038", "t00064"],    // tight & technical
            ["t00064", "t00100", "t00031", "t00073", "t00099"]     // pro handling course
        ],
        ghostNames: [
            ["Featherweight", "Sub-Tonner"],
            ["Karting Killer", "Apex Hawk"],
            ["String Specialist", "Cone Carver"]
        ],
        tunes: ["699", "699", "699"]
    }
];

// ============================================================================
// REWARD TIER PRESETS — admin-tunable defaults per "size" of event
// ============================================================================

function rewardsFor(durationDays, special) {
    // Scale rewards with duration — longer events deserve more.
    // (Fuse tokens removed — legacy field that's no longer awarded.)
    const mult = Math.max(1, durationDays / 5);
    const base = {
        money: Math.round(500_000 * mult),
        trophies: Math.round(100 * mult)
    };
    return [
        { rank: 1, money: base.money, trophies: base.trophies },
        { rank: 2, money: Math.round(base.money * 0.5), trophies: Math.round(base.trophies * 0.5) },
        { rank: 3, money: Math.round(base.money * 0.25), trophies: Math.round(base.trophies * 0.25) },
        { topPercent: 10, money: Math.round(base.money * 0.15) },
        { topPercent: 25, money: Math.round(base.money * 0.08) },
        { topPercent: 50, money: Math.round(base.money * 0.04) },
        { topPercent: 100, money: Math.round(base.money * 0.01) }
    ];
}

// ============================================================================
// BUILD + WRITE
// ============================================================================

const outDir = path.join(__dirname, "src", "pvpevents");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const summary = [];

for (const theme of THEMES) {
    const eligible = all.filter(c => matchesReqs(c, theme.reqs));

    if (eligible.length < 5) {
        console.warn(`⚠️ ${theme.name}: only ${eligible.length} eligible cars — skipping (need ≥ 5)`);
        continue;
    }

    // Build ghost decks per trackset (respecting deckCrCap if set)
    const cap = theme.deckCrCap || 0;
    const ghostDecks = {};
    let totalGhosts = 0;
    for (let i = 0; i < theme.tracksets.length; i++) {
        const names = theme.ghostNames[i] || ["Bot"];
        const tune = theme.tunes[i] || "969";
        ghostDecks[String(i)] = names.map(n => buildGhost(n, eligible, tune, cap));
        totalGhosts += ghostDecks[String(i)].length;
    }

    const days = parseInt(theme.duration);
    const tpl = {
        name: theme.name,
        duration: theme.duration,
        ticketCap: 5,
        ticketRegenMinutes: 30,
        matchCooldownSeconds: 30,
        deckCrCap: cap,
        reqs: theme.reqs,
        tracksets: theme.tracksets,
        ghostDecks,
        rewards: rewardsFor(days)
    };

    const outPath = path.join(outDir, `${theme.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(tpl, null, 4));

    summary.push({
        id: theme.id,
        name: theme.name,
        duration: theme.duration,
        eligibleCars: eligible.length,
        ghostCount: totalGhosts,
        deckCrCap: cap,
        rewardTiers: tpl.rewards.length
    });
    console.log(`✅ ${theme.id}.json — ${theme.name} (${eligible.length} eligible cars, ${totalGhosts} ghosts${cap > 0 ? `, CR cap ${cap}` : ""})`);
}

// Print final summary table
console.log("\n══════════════════════════════════════════════════════════");
console.log("  PVP TEMPLATE GENERATION SUMMARY");
console.log("══════════════════════════════════════════════════════════");
console.log(`  Generated ${summary.length} templates in src/pvpevents/`);
console.log("");
for (const s of summary) {
    const eligibleStr = String(s.eligibleCars).padStart(4);
    const dur = s.duration.padEnd(4);
    const capStr = s.deckCrCap > 0 ? `cap ${s.deckCrCap}`.padEnd(8) : "         ";
    console.log(`  ${s.id}  ${dur}  ${eligibleStr} cars  ${s.ghostCount} ghosts  ${capStr}  →  ${s.name}`);
}
console.log("\n  Restart the bot to load the new templates.");
console.log("  Then: cd-createpvp template <name>  for any of them.");
