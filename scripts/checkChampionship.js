"use strict";

/**
 * CHAMPIONSHIP BEATABILITY CHECK
 * ==============================
 * Proves every round of a chapter can actually be won: for each round it sweeps
 * every car in the game at every tune, keeps only those passing the round's
 * requirements (with OR logic, exactly as cd-playchampionship filters), and
 * scores them with the SAME evalScore the real race uses. A "beatable" verdict
 * comes with the winning car as the witness; "IMPOSSIBLE" means no car in the
 * game can clear that round.
 *
 * Also validates the round data itself (IDs resolve, tunes legal, reward shape)
 * via the same validator cd-createchampionship uses, so one run answers both
 * "is it well-formed?" and "is it winnable?".
 *
 * Usage:
 *   node scripts/checkChampionship.js src/championships/ch00001.json   template file
 *   node scripts/checkChampionship.js --db "1 Welcome to Cloned Drives!"  live DB doc
 *   add --verbose for the winning car on every round (not just problems)
 *
 * Exit code 0 = every round beatable and valid; 1 = problems found.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");

require("../src/config/config.js");
const dm = require("../src/util/functions/dataManager.js");
dm.initialize(path.join(__dirname, "..", "src"));
const { getCar, getTrack } = dm;
const { modifiedBase } = require("../src/util/functions/cardType.js");
const { bestPossibleResult } = require("../src/util/functions/raceWeekFeasibility.js");
const { getAvailableTunes } = require("../src/util/functions/calcTune.js");
const { _internals } = require("../src/commands/createchampionship.js");
const { validateTemplateRound } = _internals;

const VERBOSE = process.argv.includes("--verbose");
const STRICT = process.argv.includes("--strict");
const args = process.argv.slice(2).filter(arg => arg !== "--verbose" && arg !== "--strict");

// Authoring convention: rounds not written yet are gated behind an impossible
// CR requirement (cr 9999-9999) so nobody can progress past the authored part.
// Reported as WALL, not as a failure — pass --strict to treat walls as errors
// (e.g. before declaring a chapter finished).
const isWall = reqs => !!(reqs && reqs.cr && typeof reqs.cr.start === "number" && reqs.cr.start >= 9000);

function carLabel(carID) {
    const car = getCar(carID);
    if (!car) return carID;
    const base = modifiedBase(car);
    const make = Array.isArray(base.make) ? base.make[0] : base.make;
    return `${make} ${base.model} (${base.modelYear}) CR${base.cr}`;
}

async function loadRoster() {
    if (args[0] === "--db") {
        const name = args.slice(1).join(" ");
        if (!name) { console.log("Usage: node scripts/checkChampionship.js --db <championship name>"); process.exit(1); }
        const { connect, connection, disconnect } = require("mongoose");
        const champModel = require("../src/models/championshipsSchema.js");
        await connect(process.env.MONGO_PW);
        console.log(`connected to database: ${connection.name}`);
        const champ = await champModel.findOne({ name }).lean();
        await disconnect();
        if (!champ) {
            console.log(`❌ No championship named "${name}" in the database.`);
            process.exit(1);
        }
        return { label: `${champ.name} (${champ.championshipID}, ${champ.isActive ? "ACTIVE" : "staged"})`, roster: champ.roster || [] };
    }

    const file = args[0];
    if (!file) {
        console.log("Usage: node scripts/checkChampionship.js <template.json | --db \"name\"> [--verbose]");
        process.exit(1);
    }
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.roster)) { console.log("❌ File has no roster array."); process.exit(1); }
    return { label: `${parsed.name || file} (template, ${parsed.roster.length} rounds)`, roster: parsed.roster };
}

(async () => {
    const { label, roster } = await loadRoster();
    console.log(`\nChecking: ${label}\n`);

    const validTunes = getAvailableTunes();
    let impossible = 0, invalid = 0, walls = 0;

    for (const [i, round] of roster.entries()) {
        const tag = round._round || `Round ${i + 1}`;

        const shapeError = validateTemplateRound(round, i, validTunes);
        if (shapeError) {
            invalid++;
            console.log(`❌ ${tag}: INVALID — ${shapeError}`);
            continue;
        }

        const track = getTrack(round.track);
        const result = bestPossibleResult({
            opponent: { carID: round.carID.slice(0, 6), upgrade: String(round.upgrade) },
            track,
            reqs: round.reqs || {},
            applyOrLogic: true
        });

        if (!(result.score > 0) && isWall(round.reqs) && !STRICT) {
            walls++;
            console.log(`🧱 ${tag}: WALL — intentional impossible req (cr ${round.reqs.cr.start}+); rounds past here are gated`);
        }
        else if (!(result.score > 0)) {
            impossible++;
            console.log(`❌ ${tag}: IMPOSSIBLE — vs ${carLabel(round.carID)} [${round.upgrade}] on ${track.trackName}`);
            console.log(`      reqs ${JSON.stringify(round.reqs || {})} — ${result.eligible} car(s) eligible, best margin ${result.score === -Infinity ? "n/a" : result.score}`);
        }
        else if (VERBOSE) {
            console.log(`✅ ${tag}: ${carLabel(result.carID)} [${result.tune}] wins by ${result.score} (vs ${carLabel(round.carID)} [${round.upgrade}], ${track.trackName})`);
        }
    }

    console.log(`\n${roster.length} rounds — ${roster.length - impossible - invalid - walls} beatable, ${walls} wall(s), ${impossible} impossible, ${invalid} invalid`);
    if (impossible + invalid === 0) console.log(walls > 0 ? `✅ Every authored round is valid and beatable (${walls} construction wall(s) noted).` : "✅ Every round is valid and beatable.");
    process.exit(impossible + invalid > 0 ? 1 : 0);
})().catch(error => {
    console.error("❌ Failed:", error.stack || error.message);
    process.exit(1);
});
