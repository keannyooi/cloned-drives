"use strict";

// Roster editing shared by cd-editevent and cd-editchampionship. The two
// commands are near-copies; the pieces that had no reason to differ live here
// so a fix (a new tune stage, a new req key) lands in both at once.

const { getCar, getTrack, getCarFiles, getTrackFiles, getPackFiles, getDriver } = require("./dataManager.js");
const { modifiedBase, usesReferenceStats, normalizeTypeName, TYPE_NAMES } = require("./cardType.js");
const { isValidTune, getAvailableTunes } = require("./calcTune.js");
const { rarityOf } = require("./raceWeekEvents.js");
const filterCheck = require("./filterCheck.js");
const sortCars = require("./sortCars.js");

// The file for an exact ID ("c01230" or "c01230.json", any case). A prefix
// used to be enough ("c0123" matched c01230.json) and the partial ID was
// stored, leaving a round pointing at a car that doesn't exist.
function findFileByID(files, id) {
    const wanted = String(id).toLowerCase().replace(/\.json$/, "");
    return files.find(file => file.slice(0, 6) === wanted);
}

// ---- Shared validation constants ----
const reqKeyMap = {
    cr: "cr", make: "make", tags: "tags", collection: "collection",
    bodystyle: "bodyStyle", bodyStyle: "bodyStyle", hiddenTag: "hiddenTag", hiddentag: "hiddenTag",
    modelyear: "modelYear", modelYear: "modelYear",
    seatcount: "seatCount", seatCount: "seatCount",
    enginepos: "enginePos", enginePos: "enginePos",
    drivetype: "driveType", driveType: "driveType",
    fueltype: "fuelType", fuelType: "fuelType",
    tyretype: "tyreType", tyreType: "tyreType",
    country: "country", gc: "gc", creator: "creator",
    abs: "abs", tcs: "tcs",
    isPrize: "isPrize", isprize: "isPrize",
    isStock: "isStock", isstock: "isStock",
    isBM: "isBM", isbm: "isBM",
    cardType: "cardType", cardtype: "cardType",
    search: "search"
};
const arrayKeys = ["make", "tags", "collection", "bodyStyle", "hiddenTag"];
const rangeKeys = ["cr", "modelYear", "seatCount"];
const stringKeys = ["country", "tyreType", "driveType", "enginePos", "fuelType", "gc", "creator"];
const booleanKeys = ["abs", "tcs", "isPrize", "isStock", "isBM"];

/**
 * Parses and validates `bulk` input: "1 {...}" or "1 {...} 2 {...} 3 {...}".
 * Every round is checked before any is applied.
 * @returns {{ error: { title, desc } } | { rounds: [{ roundNum, data, carFile, trackFile }] }}
 */
function validateBulkRounds(rawBulk, rosterLength) {
    const carFiles = getCarFiles();
    const trackFiles = getTrackFiles();
    const packFiles = getPackFiles();

    // ---- Parse round/JSON pairs from the raw input ----
    const bulkRounds = [];
    let parseIdx = 0;

    while (parseIdx < rawBulk.length) {
        // Skip whitespace
        while (parseIdx < rawBulk.length && rawBulk[parseIdx] === " ") parseIdx++;
        if (parseIdx >= rawBulk.length) break;

        // Read round number
        let numStr = "";
        while (parseIdx < rawBulk.length && rawBulk[parseIdx] >= "0" && rawBulk[parseIdx] <= "9") {
            numStr += rawBulk[parseIdx];
            parseIdx++;
        }
        if (!numStr) {
            return { error: {
                title: "Error, expected a round number.",
                desc: `Parsing failed near position ${parseIdx}. Format: \`bulk <round> <JSON> [<round> <JSON> ...]\``
            } };
        }

        // Skip whitespace
        while (parseIdx < rawBulk.length && rawBulk[parseIdx] === " ") parseIdx++;

        // Read JSON by counting braces
        if (parseIdx >= rawBulk.length || rawBulk[parseIdx] !== "{") {
            return { error: {
                title: "Error, expected a JSON object after round number.",
                desc: `Expected \`{\` after round ${numStr}. Format: \`bulk <round> <JSON> [<round> <JSON> ...]\``
            } };
        }

        let depth = 0, jsonStart = parseIdx;
        while (parseIdx < rawBulk.length) {
            if (rawBulk[parseIdx] === "{") depth++;
            else if (rawBulk[parseIdx] === "}") depth--;
            parseIdx++;
            if (depth === 0) break;
        }

        if (depth !== 0) {
            return { error: {
                title: "Error, unmatched braces in JSON.",
                desc: `The JSON for round ${numStr} has unmatched \`{\` or \`}\`. Check your formatting.`
            } };
        }

        bulkRounds.push({ roundNum: parseInt(numStr), jsonStr: rawBulk.slice(jsonStart, parseIdx) });
    }

    if (bulkRounds.length === 0) {
        return { error: {
            title: "Error, no round data provided.",
            desc: "Format: `bulk <round> <JSON>` or `bulk <round> <JSON> <round> <JSON> ...`"
        } };
    }

    // ---- Validate all rounds before applying any ----
    const validatedBulkRounds = [];
    for (const entry of bulkRounds) {
        const roundLabel = `Round ${entry.roundNum}`;

        // Validate round number
        if (entry.roundNum < 1 || entry.roundNum > rosterLength) {
            return { error: {
                title: `Error, invalid round number in bulk data.`,
                desc: `${roundLabel}: must be between 1 and ${rosterLength}.`
            } };
        }

        // Parse JSON
        let roundData;
        try {
            roundData = JSON.parse(entry.jsonStr);
        } catch (e) {
            return { error: {
                title: `Error, invalid JSON for ${roundLabel}.`,
                desc: `\`${e.message}\`\nMake sure your JSON is properly formatted.`
            } };
        }

        // Validate required fields
        if (!roundData.carID || !roundData.upgrade || !roundData.track) {
            return { error: {
                title: `Error, missing required fields in ${roundLabel}.`,
                desc: "Each round JSON must contain at least `carID`, `upgrade`, and `track`."
            } };
        }

        // Validate car
        let bulkCarFile = findFileByID(carFiles, roundData.carID);
        if (!bulkCarFile) {
            return { error: {
                title: `Error, car not found in ${roundLabel}.`,
                desc: `No car found with ID \`${roundData.carID}\`.`
            } };
        }

        // Validate track
        let bulkTrackFile = findFileByID(trackFiles, roundData.track);
        if (!bulkTrackFile) {
            return { error: {
                title: `Error, track not found in ${roundLabel}.`,
                desc: `No track found with ID \`${roundData.track}\`.`
            } };
        }

        // Validate upgrade
        if (!isValidTune(roundData.upgrade)) {
            return { error: {
                title: `Error, invalid upgrade in ${roundLabel}.`,
                desc: "Valid upgrades are `000`, `333`, `666`, `996`, `969`, and `699`."
            } };
        }

        // Validate and normalize reqs
        let validatedReqs = {};
        if (roundData.reqs && typeof roundData.reqs === "object") {
            const bulkErrors = [];
            for (const [rawKey, value] of Object.entries(roundData.reqs)) {
                const key = reqKeyMap[rawKey];
                if (!key) {
                    bulkErrors.push(`Unknown req key: \`${rawKey}\``);
                    continue;
                }

                if (key === "cardType") {
                    const arrayValue = Array.isArray(value) ? value : [value];
                    const normalized = [];
                    for (const val of arrayValue) {
                        const canonical = normalizeTypeName(String(val));
                        if (!canonical) {
                            bulkErrors.push(`\`cardType\` value \`${val}\` isn't a valid card type (valid: ${TYPE_NAMES.join(", ")})`);
                        }
                        else {
                            normalized.push(canonical.toLowerCase());
                        }
                    }
                    validatedReqs[key] = normalized;
                } else if (arrayKeys.includes(key)) {
                    const arrayValue = Array.isArray(value) ? value : [value];
                    const normalized = arrayValue.map(v => String(v).toLowerCase());
                    for (const val of normalized) {
                        const exists = carFiles.some(file => {
                            const car = getCar(file);
                            const ref = modifiedBase(car);
                            if (key === "collection") {
                                return Array.isArray(car[key]) && car[key].some(c => c.toLowerCase() === val);
                            }
                            if (key === "hiddenTag") {
                                return Array.isArray(car[key]) && car[key].some(t => t.toLowerCase() === val);
                            }
                            const field = ref[key];
                            if (Array.isArray(field)) return field.some(t => t.toLowerCase() === val);
                            return typeof field === "string" && field.toLowerCase() === val;
                        });
                        if (!exists) {
                            bulkErrors.push(`\`${key}\` value \`${val}\` doesn't match any car in the game`);
                        }
                    }
                    validatedReqs[key] = normalized;
                } else if (rangeKeys.includes(key)) {
                    if (typeof value !== "object" || value.start === undefined || value.end === undefined) {
                        bulkErrors.push(`\`${key}\` must be an object with start and end, e.g. {"start": 0, "end": 100}`);
                        continue;
                    }
                    const start = parseInt(value.start);
                    const end = parseInt(value.end);
                    if (isNaN(start) || isNaN(end)) {
                        bulkErrors.push(`\`${key}\` start and end must be numbers`);
                        continue;
                    }
                    if (end < start) {
                        bulkErrors.push(`\`${key}\` end (${end}) must be >= start (${start})`);
                        continue;
                    }
                    validatedReqs[key] = { start, end };
                } else if (stringKeys.includes(key)) {
                    const normalized = String(value).toLowerCase();
                    const exists = carFiles.some(file => {
                        const car = getCar(file);
                        return !usesReferenceStats(car) && typeof car[key] === "string" && car[key].toLowerCase() === normalized;
                    });
                    if (!exists) {
                        bulkErrors.push(`\`${key}\` value \`${normalized}\` doesn't match any car in the game`);
                    }
                    validatedReqs[key] = normalized;
                } else if (booleanKeys.includes(key)) {
                    if (typeof value !== "boolean") {
                        bulkErrors.push(`\`${key}\` must be true or false`);
                        continue;
                    }
                    validatedReqs[key] = value;
                } else if (key === "search") {
                    validatedReqs[key] = String(value).toLowerCase();
                }
            }

            if (bulkErrors.length > 0) {
                return { error: {
                    title: `Error, invalid reqs in ${roundLabel}.`,
                    desc: bulkErrors.join("\n")
                } };
            }
        }

        // Validate rewards
        let validatedRewards = {};
        if (roundData.rewards && typeof roundData.rewards === "object") {
            const rewardErrors = [];
            for (const [key, value] of Object.entries(roundData.rewards)) {
                switch (key) {
                    case "money":
                    case "fuseTokens":
                    case "trophies":
                        if (isNaN(value) || parseInt(value) < 0) {
                            rewardErrors.push(`\`${key}\` must be a non-negative number`);
                        } else {
                            validatedRewards[key] = parseInt(value);
                        }
                        break;
                    case "car": {
                        // Accept both: "car": "c08298" (defaults to 000) and "car": {"carID": "c08298", "upgrade": "996"}
                        let carReward = typeof value === "string" ? { carID: value, upgrade: "000" } : value;
                        let rewardCarFile = carReward && carReward.carID ? findFileByID(carFiles, carReward.carID) : null;
                        if (!carReward || !carReward.carID) {
                            rewardErrors.push("`car` reward must have a `carID` field (or just a car ID string)");
                        } else if (!rewardCarFile) {
                            rewardErrors.push(`Car \`${carReward.carID}\` not found`);
                        } else if (!isValidTune(carReward.upgrade || "000")) {
                            rewardErrors.push(`Invalid upgrade \`${carReward.upgrade}\` for car reward`);
                        } else {
                            validatedRewards.car = { carID: rewardCarFile.slice(0, 6), upgrade: carReward.upgrade || "000" };
                        }
                        break;
                    }
                    case "pack": {
                        let rewardPackFile = findFileByID(packFiles, value);
                        if (!rewardPackFile) {
                            rewardErrors.push(`Pack \`${value}\` not found`);
                        } else {
                            validatedRewards.pack = rewardPackFile.slice(0, 6);
                        }
                        break;
                    }
                    case "driver": {
                        // Resolve once and check the driver object (as addreward does): rarityOf("d00038.json")
                        // would miss the serialised check, and the stored ID must be the bare driverID.
                        const rewardDriver = typeof value === "string" ? getDriver(value.toLowerCase()) : null;
                        if (!rewardDriver) {
                            rewardErrors.push(`Driver \`${value}\` not found`);
                        } else if (rarityOf(rewardDriver) === "serialised") {
                            rewardErrors.push(`Driver \`${value}\` is serialised — serialised drivers cannot be awarded`);
                        } else if (rewardDriver.recruitExclusive === true) {
                            rewardErrors.push(`Driver \`${value}\` is recruit-exclusive — only obtainable from \`cd-recruit\` or an offer`);
                        } else {
                            validatedRewards.driver = rewardDriver.driverID;
                        }
                        break;
                    }
                    default:
                        rewardErrors.push(`Unknown reward type: \`${key}\``);
                }
            }
            if (rewardErrors.length > 0) {
                return { error: {
                    title: `Error, invalid rewards in ${roundLabel}.`,
                    desc: rewardErrors.join("\n")
                } };
            }
        }

        validatedBulkRounds.push({
            roundNum: entry.roundNum,
            data: {
                carID: bulkCarFile.slice(0, 6),
                upgrade: roundData.upgrade,
                track: bulkTrackFile.slice(0, 6),
                reqs: validatedReqs,
                rewards: validatedRewards
            },
            carFile: bulkCarFile,
            trackFile: bulkTrackFile
        });
    }

    return { rounds: validatedBulkRounds };
}

// regentracks: the tracks to pick from for a surface type, or null when the
// type isn't one of asphalt / dirt / snow.
function regenTrackPool(randomizeType) {
    const surfaces = {
        asphalt: ["Asphalt"],
        dirt: ["Dirt", "Gravel"],
        snow: ["Snow", "Ice"]
    }[randomizeType];
    if (!surfaces) return null;
    return getTrackFiles().filter(track => surfaces.includes(getTrack(track)["surface"]));
}

// regenopponents: one random car per round from the cars passing `filter`,
// sorted by CR ascending, each on a random tune. Null when no car passes.
function regenOpponents(filter, roundCount) {
    const tunes = getAvailableTunes();
    const ownsEveryTune = Object.fromEntries(tunes.map(tune => [tune, 1]));
    const regenPool = getCarFiles().filter(car => filterCheck({
        car: { carID: car.slice(0, 6), ...ownsEveryTune },
        filter
    }));
    if (regenPool.length < 1) return null;

    let opponentIDs = [];
    for (let i = 0; i < roundCount; i++) {
        opponentIDs[i] = regenPool[Math.floor(Math.random() * regenPool.length)].slice(0, 6);
    }
    opponentIDs = sortCars(opponentIDs, "cr", "ascending");
    return opponentIDs.map(carID => ({ carID, upgrade: tunes[Math.floor(Math.random() * tunes.length)] }));
}

module.exports = { validateBulkRounds, regenTrackPool, regenOpponents, findFileByID, isValidTune, getAvailableTunes };
