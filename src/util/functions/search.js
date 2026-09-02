"use strict";

const { StringSelectMenuBuilder } = require("discord.js");
const { trophyEmojiID } = require("../consts/consts.js");
const { getCar, getTrack, getPack } = require("./dataManager.js");
const { isBMCar, isPrizeLike } = require("./cardType.js");
const carNameGen = require("./carNameGen.js");
const processResults = require("./corefiles/processResults.js");

const listGen = {
    "car": item => {
        let currentCar = getCar(item);
        return isBMCar(currentCar) ? "jowhdgeuwrljoehfujbek" : carNameGen({ currentCar, removePrizeTag: true }); //this may be the dirtiest hack of all time but eh, it works
    },
    "carWithBM": item => {
        let currentCar = getCar(item);
        return carNameGen({ currentCar, removePrizeTag: true });
    },
    "dealership": item => {
        let currentCar = getCar(item.carID);
        return carNameGen({ currentCar, removePrizeTag: true });
    },
    "pack": item => {
        let details = getPack(item);
        return details["packName"];
    },
    "track": item => {
        let details = getTrack(item);
        return details["trackName"];
    },
    "id": item => typeof item === "string" ? item.replace(".json", "") : item.id,
    "event": item => item.name,
	"championships": item => item.name,
    "offer": item => item.name,
    "offerTemplate": item => item.offerName,
    "pvpEventTemplate": item => item.name,
    "packBattleTemplate": item => item.name,
    "deck": item => item.name,
    "calendar": item => item.name,
    "packbattle": item => item.name
};

// Direct-ID patterns per search type: typing the ID always works, everywhere.
const ID_PATTERNS = {
    "car": /^c\d{5}$/,
    "carWithBM": /^c\d{5}$/,
    "track": /^t\d{5}$/,
    "pack": /^p\d{5}$/
};

/**
 * Lowercase and strip the punctuation that makes names unsearchable:
 * "Mercedes-AMG" -> "mercedesamg" so the query "amg" can hit it, "S/T" -> "st",
 * "F-150" -> "f150". Parens and quotes go too (they never carry meaning here).
 */
function normalize(text) {
    return String(text).toLocaleLowerCase("en").replace(/[()"'’.\-\/]/g, "");
}

/**
 * Relevance for one item against the query parts. 0 = no match. Per part:
 * exact-token 3, token-prefix 2, anywhere-in-the-joined-name 1 (which is what
 * lets "gt2rs" or "musta" land). All parts must match somewhere or the item
 * scores 0 — same AND semantics as before, just far more forgiving about
 * punctuation and partial words.
 */
function scoreItem(name, queryParts) {
    const tokens = String(name).toLocaleLowerCase("en").replace(/[()"'’]/g, "").split(" ").map(normalize).filter(Boolean);
    const joined = tokens.join("");
    let score = 0;
    for (const part of queryParts) {
        if (tokens.includes(part)) score += 3;
        else if (tokens.some(token => token.startsWith(part))) score += 2;
        else if (joined.includes(part)) score += 1;
        else return 0;
    }
    return score;
}

async function search(message, query, searchList, type, currentMessage) {
    // Check if listGen[type] is a function
    if (typeof listGen[type] !== 'function') {
        throw new Error(`Invalid search type: ${type}`);
    }

    const queryParts = query.map(normalize).filter(Boolean);

    // Typing an exact ID (c01074 / t00042 / p00041) resolves directly — the
    // guides recommend IDs as the safe input, so they must work in every
    // command that searches, not just the ones that special-case them.
    if (ID_PATTERNS[type] && queryParts.length === 1 && ID_PATTERNS[type].test(queryParts[0])) {
        const hit = searchList.find(item => typeof item === "string" && item.slice(0, 6) === queryParts[0]);
        if (hit) return [hit, currentMessage];
    }

    // Score everything, keep matches, best first. Ties break alphabetically so
    // sibling generations sit adjacent in the picker with their years visible.
    const scored = [];
    for (const item of searchList) {
        const name = listGen[type](item);
        const score = queryParts.length === 0 ? 0 : scoreItem(name, queryParts);
        if (score > 0) scored.push({ item, name, score });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    // Discord's dropdown caps at 25 — show the 25 BEST matches instead of
    // refusing to show anything (the old behaviour was a dead end for queries
    // like "mustang"). processResults renders the "broad search" notice.
    const totalMatches = scored.length;
    const searchResults = scored.slice(0, 25).map(entry => entry.item);

    return processResults(message, searchResults, () => {
        const options = [];
        for (let i = 0; i < searchResults.length; i++) {
            let searchedCar = (type === "car" || type === "carWithBM") ? getCar(searchResults[i]) : {};
            options.push({
                label: listGen[type](searchResults[i]),
                value: `${i + 1}`
            });
            if (isPrizeLike(searchedCar)) {
                options[i].emoji = `<trophies:${trophyEmojiID}>`;
            }
        }

        let list = new StringSelectMenuBuilder()
            .setCustomId("search")
            .setPlaceholder("Select something...")
            .addOptions(...options);
        return list;
    }, type, currentMessage, totalMatches)
    .catch(throwError => {
        // Legacy contract: a rejection VALUE that is a function renders the
        // "did you mean" error. Anything else is a real exception — rethrow it
        // instead of crashing on throwError-is-not-a-function and burying it.
        if (typeof throwError !== "function") throw throwError;
        return throwError(query.join(" "), searchList.map(i => listGen[type](i).toLowerCase()));
    });
}

module.exports = search;
// The matcher is shared with searchGarage (and the BM submission resolver) so
// buying, selling and submitting all agree on what a name means.
module.exports._match = { normalize, scoreItem };
