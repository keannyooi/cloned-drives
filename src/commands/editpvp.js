"use strict";

/**
 * cd-editpvp <event name> <subcommand> [...]
 *
 * Simple field edits (single value):
 *   name <new name>
 *   duration <Xd>            ← only while INACTIVE (e.g. "7d")
 *   extend <hours>           ← only while ACTIVE
 *   ticketcap <number>
 *   ticketregen <minutes>
 *   cooldown <seconds>
 *   deckcrcap <number>             ← total CR sum cap on player + ghost decks. 0 = disabled.
 *
 * Reqs (mirrors event reqs format):
 *   reqs <field> <value>         e.g. reqs cr 400-600, reqs make Ferrari, reqs isPrize false
 *   reqs clear <field>           remove a req
 *   reqs clear                   wipe all reqs
 *
 * Tracksets:
 *   trackset add <t1> <t2> <t3> <t4> <t5>
 *   trackset remove <index 1-N>      ← also removes ghosts for that trackset
 *   trackset replace <index> <t1> <t2> <t3> <t4> <t5>
 *
 * Ghost decks:
 *   ghost add <trackset index> <JSON>      JSON: {"name": "...", "deck": ["c00001",...x5], "upgrades": ["996",...x5]}
 *   ghost remove <trackset index> <ghost index>
 *
 * Rewards (tier list — qualifier shapes):
 *   reward add <JSON>                       JSON variants:
 *                                             {"rank": 1, "money": 1000000, ...}      single rank
 *                                             {"rankRange": [1, 3], "money": ...}     range of ranks (inclusive)
 *                                             {"topPercent": 10, "money": ...}        top N% of participants
 *   reward remove <index 1-N>
 *   reward removefield <index> <field>      Strip a single field (money/trophies/car/pack) from a tier
 *   reward clear
 *
 * Bulk replacement (powerful):
 *   bulk <JSON>                            JSON object with any of: duration, ticketCap, ticketRegenMinutes,
 *                                          matchCooldownSeconds, reqs, tracksets, ghostDecks, rewards.
 *                                          Each field replaces the entire current value.
 *
 * Reset (testing):
 *   reset entries                          wipe all player participation (only while inactive)
 */

const { DateTime } = require("luxon");
const { SuccessMessage, ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { getCar, getTrack } = require("../util/functions/dataManager.js");
const search = require("../util/functions/search.js");
const { parseDuration, validateDurationBounds } = require("../util/functions/pvpTickets.js");
const pvpEventModel = require("../models/pvpEventSchema.js");

const VALID_TUNES = ["000", "333", "666", "699", "969", "996"];

const REQ_RANGE_KEYS = ["cr", "modelYear", "topSpeed", "0to60", "handling", "weight"];
const REQ_ARRAY_KEYS = ["make", "country", "bodyStyle", "tyreType", "driveType", "fuelType", "enginePos", "gc", "tags", "collection", "hiddenTag"];
const REQ_BOOL_KEYS = ["isPrize"];
const REQ_STRING_KEYS = []; // (none right now, but future-proof)

module.exports = {
    name: "editpvp",
    aliases: ["editpvpevent"],
    usage: [
        "<name> name <new name>",
        "<name> duration <Xd>",
        "<name> extend <hours>",
        "<name> ticketcap <number>",
        "<name> ticketregen <minutes>",
        "<name> cooldown <seconds>",
        "<name> deckcrcap <number>",
        "<name> reqs <field> <value>",
        "<name> reqs clear [<field>]",
        "<name> trackset add <t1> <t2> <t3> <t4> <t5>",
        "<name> trackset remove <index>",
        "<name> trackset replace <index> <t1> <t2> <t3> <t4> <t5>",
        "<name> ghost add <trackset index> <JSON>",
        "<name> ghost remove <trackset index> <ghost index>",
        "<name> reward add <JSON>",
        "<name> reward remove <index>",
        "<name> reward removefield <index> <field>",
        "<name> reward clear",
        "<name> bulk <JSON>",
        "<name> reset entries"
    ],
    args: 3,
    category: "Events",
    description: "Edits a PvP event's settings, tracksets, ghost decks, or rewards.",
    async execute(message, args) {
        const events = await pvpEventModel.find();
        if (events.length === 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, no PvP events exist.",
                desc: "Create one first with `cd-createpvp`.",
                author: message.author
            }).sendMessage();
        }

        // Find the event by fuzzy-matching the leading args until we hit a known subcommand
        const subcommandKeywords = new Set([
            "name", "duration", "extend", "ticketcap", "ticketregen", "cooldown", "deckcrcap",
            "reqs", "trackset", "ghost", "reward", "bulk", "reset"
        ]);
        let splitIdx = -1;
        for (let i = 0; i < args.length; i++) {
            if (subcommandKeywords.has(args[i].toLowerCase())) {
                splitIdx = i;
                break;
            }
        }
        if (splitIdx < 1) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, edit syntax invalid.",
                desc: "Use: `cd-editpvp <event name> <subcommand> ...`. Run `cd-help editpvp` for the full list.",
                author: message.author
            }).sendMessage();
        }

        const eventQuery = args.slice(0, splitIdx).map(s => s.toLowerCase());
        const subcmd = args[splitIdx].toLowerCase();
        const subargs = args.slice(splitIdx + 1);

        await new Promise(resolve => resolve(search(message, eventQuery, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                const [pvpEvent, currentMessage] = response;
                await dispatch(message, pvpEvent, subcmd, subargs, currentMessage);
            })
            .catch(error => { throw error; });
    }
};

// ============================================================================
// Dispatcher
// ============================================================================

async function dispatch(message, pvpEvent, subcmd, args, currentMessage) {
    try {
        switch (subcmd) {
            case "name":          return editName(message, pvpEvent, args, currentMessage);
            case "duration":      return editDuration(message, pvpEvent, args, currentMessage);
            case "extend":        return extendDuration(message, pvpEvent, args, currentMessage);
            case "ticketcap":     return editNumber(message, pvpEvent, "ticketCap", args, currentMessage, { min: 1, max: 100, label: "Ticket cap" });
            case "ticketregen":   return editNumber(message, pvpEvent, "ticketRegenMinutes", args, currentMessage, { min: 1, max: 1440, label: "Ticket regen (minutes)" });
            case "cooldown":      return editNumber(message, pvpEvent, "matchCooldownSeconds", args, currentMessage, { min: 0, max: 3600, label: "Match cooldown (seconds)" });
            case "deckcrcap":     return editNumber(message, pvpEvent, "deckCrCap", args, currentMessage, { min: 0, max: 9999, label: "Deck CR cap (0 = no cap)" });
            case "reqs":          return editReqs(message, pvpEvent, args, currentMessage);
            case "trackset":      return editTrackset(message, pvpEvent, args, currentMessage);
            case "ghost":         return editGhost(message, pvpEvent, args, currentMessage);
            case "reward":        return editReward(message, pvpEvent, args, currentMessage);
            case "bulk":          return editBulk(message, pvpEvent, args, currentMessage);
            case "reset":         return resetField(message, pvpEvent, args, currentMessage);
            default:
                return sendErr(message, "Error, unknown subcommand.", `Got "${subcmd}". Run \`cd-help editpvp\`.`, currentMessage);
        }
    } catch (err) {
        return sendErr(message, "Error during edit.", err.message, currentMessage);
    }
}

// ============================================================================
// Simple field editors
// ============================================================================

async function editName(message, pvpEvent, args, currentMessage) {
    const newName = args.join(" ").trim();
    if (!newName) return sendErr(message, "Error, new name required.", "Use: `cd-editpvp <name> name <new name>`", currentMessage);

    const dupe = await pvpEventModel.findOne({ name: newName, pvpEventID: { $ne: pvpEvent.pvpEventID } });
    if (dupe) return sendErr(message, "Error, name already taken.", `Another PvP event is named "${newName}".`, currentMessage);

    const previous = pvpEvent.name;
    await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { name: newName });
    return success(message, `Renamed "${previous}" → "${newName}".`, undefined, currentMessage);
}

async function editDuration(message, pvpEvent, args, currentMessage) {
    if (pvpEvent.isActive) return sendErr(message, "Error, can't change duration on a live event.", "Use `cd-editpvp <name> extend <hours>` instead.", currentMessage);
    const raw = args[0];
    const parsed = parseDuration(raw);
    if (!parsed) {
        return sendErr(message, "Error, duration must be `<number><unit>`.",
            "Supported units: `m` (minutes), `h` (hours), `d` (days), `w` (weeks). Examples: `30m`, `1h`, `7d`, `2w`.", currentMessage);
    }
    const boundsError = validateDurationBounds(parsed);
    if (boundsError) return sendErr(message, "Error, duration too long.", boundsError, currentMessage);

    await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { deadline: parsed.raw });
    return success(message, `Duration set to ${parsed.amount} ${parsed.label}(s).`, undefined, currentMessage);
}

async function extendDuration(message, pvpEvent, args, currentMessage) {
    if (!pvpEvent.isActive) return sendErr(message, "Error, can only extend active events.", "Use `duration` to set the duration of an inactive event.", currentMessage);
    const hours = parseInt(args[0], 10);
    if (isNaN(hours) || hours < 1) return sendErr(message, "Error, hours must be a positive number.", `Got "${args[0]}".`, currentMessage);
    const newDeadline = DateTime.fromISO(pvpEvent.deadline).plus({ hours }).toISO();
    await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { deadline: newDeadline });
    return success(message, `Extended by ${hours} hour(s).`, `New end: <t:${Math.floor(DateTime.fromISO(newDeadline).toSeconds())}:R>`, currentMessage);
}

async function editNumber(message, pvpEvent, field, args, currentMessage, { min, max, label }) {
    const n = parseInt(args[0], 10);
    if (isNaN(n) || n < min || n > max) return sendErr(message, `Error, ${label} must be between ${min} and ${max}.`, `Got "${args[0]}".`, currentMessage);
    await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { [field]: n });
    return success(message, `${label} set to **${n}**.`, undefined, currentMessage);
}

// ============================================================================
// Reqs editor (mirrors editevent's reqs handling)
// ============================================================================

async function editReqs(message, pvpEvent, args, currentMessage) {
    if (args.length === 0) return sendErr(message, "Error, reqs syntax invalid.", "Use: `reqs <field> <value>` or `reqs clear [<field>]`.", currentMessage);

    if (args[0].toLowerCase() === "clear") {
        const reqs = pvpEvent.reqs || {};
        if (args[1]) {
            const field = args[1];
            if (!(field in reqs)) return sendErr(message, "Error, that req field is not set.", `"${field}" isn't currently a req on this event.`, currentMessage);
            delete reqs[field];
        }
        else {
            for (const k of Object.keys(reqs)) delete reqs[k];
        }
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { reqs });
        return success(message, args[1] ? `Cleared req \`${args[1]}\`.` : "Cleared all reqs.", undefined, currentMessage);
    }

    const field = args[0];
    const valueRaw = args.slice(1).join(" ").trim();
    if (!valueRaw) return sendErr(message, "Error, value required.", `Provide a value after the field name.`, currentMessage);

    const reqs = pvpEvent.reqs || {};
    let parsed;
    try {
        parsed = parseReqValue(field, valueRaw);
    } catch (err) {
        return sendErr(message, "Error, invalid req value.", err.message, currentMessage);
    }
    reqs[field] = parsed;
    await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { reqs });
    return success(message, `Set req \`${field}\` = \`${JSON.stringify(parsed)}\`.`, undefined, currentMessage);
}

function parseReqValue(field, raw) {
    if (REQ_RANGE_KEYS.includes(field)) {
        const m = raw.match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/);
        if (!m) throw new Error(`Range fields use \`<start>-<end>\` (got "${raw}").`);
        return { start: Number(m[1]), end: Number(m[2]) };
    }
    if (REQ_ARRAY_KEYS.includes(field)) {
        return raw.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (REQ_BOOL_KEYS.includes(field)) {
        const lc = raw.toLowerCase();
        if (lc === "true") return true;
        if (lc === "false") return false;
        throw new Error(`Boolean fields must be "true" or "false" (got "${raw}").`);
    }
    if (REQ_STRING_KEYS.includes(field)) return raw;
    throw new Error(`Unknown req field "${field}".`);
}

// ============================================================================
// Trackset editor
// ============================================================================

async function editTrackset(message, pvpEvent, args, currentMessage) {
    if (pvpEvent.isActive) return sendErr(message, "Error, can't modify tracksets on a live event.", "End the event or wait for expiry first.", currentMessage);
    const op = (args[0] || "").toLowerCase();
    const tracksets = JSON.parse(JSON.stringify(pvpEvent.tracksets || []));
    const ghosts = JSON.parse(JSON.stringify(pvpEvent.ghostDecks || {}));

    if (op === "add") {
        const tracks = args.slice(1);
        const validation = validateTracks(tracks);
        if (validation.error) return sendErr(message, "Error, invalid trackset.", validation.error, currentMessage);
        tracksets.push(validation.ids);
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { tracksets });
        return success(message, `Added trackset #${tracksets.length}.`, validation.ids.join(" → "), currentMessage);
    }

    if (op === "remove") {
        const idx = parseInt(args[1], 10);
        if (isNaN(idx) || idx < 1 || idx > tracksets.length) return sendErr(message, "Error, invalid trackset index.", `Got "${args[1]}", have ${tracksets.length} trackset(s).`, currentMessage);
        const removed = tracksets.splice(idx - 1, 1);
        // Reindex ghost decks: shift higher indices down by 1, drop the removed one
        const newGhosts = {};
        for (const [k, v] of Object.entries(ghosts)) {
            const ki = parseInt(k, 10);
            if (ki < idx - 1) newGhosts[String(ki)] = v;
            else if (ki > idx - 1) newGhosts[String(ki - 1)] = v;
            // ki === idx - 1 → drop
        }
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { tracksets, ghostDecks: newGhosts });
        return success(message, `Removed trackset #${idx}.`, `Removed: ${removed[0].join(" → ")}`, currentMessage);
    }

    if (op === "replace") {
        const idx = parseInt(args[1], 10);
        if (isNaN(idx) || idx < 1 || idx > tracksets.length) return sendErr(message, "Error, invalid trackset index.", `Got "${args[1]}".`, currentMessage);
        const tracks = args.slice(2);
        const validation = validateTracks(tracks);
        if (validation.error) return sendErr(message, "Error, invalid trackset.", validation.error, currentMessage);
        tracksets[idx - 1] = validation.ids;
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { tracksets });
        return success(message, `Replaced trackset #${idx}.`, validation.ids.join(" → "), currentMessage);
    }

    return sendErr(message, "Error, unknown trackset operation.", "Use: `add`, `remove`, or `replace`.", currentMessage);
}

function validateTracks(arr) {
    if (!Array.isArray(arr) || arr.length !== 5) return { error: "A trackset must have exactly 5 track IDs." };
    const ids = [];
    for (const raw of arr) {
        const cleaned = raw.endsWith(".json") ? raw.slice(0, -5) : raw;
        if (!getTrack(cleaned)) return { error: `Track \`${cleaned}\` not found.` };
        ids.push(cleaned);
    }
    return { ids };
}

// ============================================================================
// Ghost deck editor (JSON-based)
// ============================================================================

async function editGhost(message, pvpEvent, args, currentMessage) {
    if (pvpEvent.isActive) return sendErr(message, "Error, can't modify ghost decks on a live event.", "End the event or wait for expiry first.", currentMessage);
    const op = (args[0] || "").toLowerCase();
    const tracksets = pvpEvent.tracksets || [];
    const ghosts = JSON.parse(JSON.stringify(pvpEvent.ghostDecks || {}));

    if (op === "add") {
        const tsIdx = parseInt(args[1], 10);
        if (isNaN(tsIdx) || tsIdx < 1 || tsIdx > tracksets.length) {
            return sendErr(message, "Error, invalid trackset index.", `Got "${args[1]}", have ${tracksets.length} trackset(s).`, currentMessage);
        }
        const jsonRaw = args.slice(2).join(" ").trim();
        if (!jsonRaw) return sendErr(message, "Error, JSON required.", `Use: \`ghost add <trackset index> {"name":"...","deck":[...x5],"upgrades":[...x5]}\``, currentMessage);

        let parsed;
        try { parsed = JSON.parse(jsonRaw); }
        catch (err) { return sendErr(message, "Error, JSON parse failed.", err.message, currentMessage); }

        const v = validateGhostDeck(parsed);
        if (v.error) return sendErr(message, "Error, invalid ghost deck.", v.error, currentMessage);

        const key = String(tsIdx - 1);
        if (!ghosts[key]) ghosts[key] = [];
        ghosts[key].push(v.ghost);
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { ghostDecks: ghosts });
        return success(message, `Added ghost deck #${ghosts[key].length} to trackset #${tsIdx}.`, `Name: ${v.ghost.name}`, currentMessage);
    }

    if (op === "remove") {
        const tsIdx = parseInt(args[1], 10);
        const ghostIdx = parseInt(args[2], 10);
        if (isNaN(tsIdx) || isNaN(ghostIdx)) return sendErr(message, "Error, indices must be numbers.", `Got "${args[1]}" and "${args[2]}".`, currentMessage);
        const key = String(tsIdx - 1);
        if (!ghosts[key] || ghostIdx < 1 || ghostIdx > ghosts[key].length) {
            return sendErr(message, "Error, ghost not found.", `Trackset #${tsIdx} has ${ghosts[key]?.length ?? 0} ghost(s).`, currentMessage);
        }
        const removed = ghosts[key].splice(ghostIdx - 1, 1);
        if (ghosts[key].length === 0) delete ghosts[key];
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { ghostDecks: ghosts });
        return success(message, `Removed ghost #${ghostIdx} from trackset #${tsIdx}.`, `Name: ${removed[0].name}`, currentMessage);
    }

    return sendErr(message, "Error, unknown ghost operation.", "Use: `add` or `remove`.", currentMessage);
}

function validateGhostDeck(obj) {
    if (typeof obj !== "object" || obj === null) return { error: "Must be an object." };
    if (!obj.name || typeof obj.name !== "string") return { error: "Missing or invalid `name`." };
    if (!Array.isArray(obj.deck) || obj.deck.length !== 5) return { error: "`deck` must be exactly 5 carIDs." };
    if (!Array.isArray(obj.upgrades) || obj.upgrades.length !== 5) return { error: "`upgrades` must be exactly 5 tune values." };
    const cleanDeck = [];
    for (const id of obj.deck) {
        const cleaned = String(id).endsWith(".json") ? String(id).slice(0, -5) : String(id);
        if (!getCar(cleaned)) return { error: `Car \`${cleaned}\` not found.` };
        cleanDeck.push(cleaned);
    }
    for (const u of obj.upgrades) {
        if (!VALID_TUNES.includes(String(u))) return { error: `Invalid tune value "${u}". Valid: ${VALID_TUNES.join(", ")}.` };
    }
    return { ghost: { name: obj.name, deck: cleanDeck, upgrades: obj.upgrades.map(String) } };
}

// ============================================================================
// Reward tier editor (JSON-based)
// ============================================================================

async function editReward(message, pvpEvent, args, currentMessage) {
    const op = (args[0] || "").toLowerCase();
    const rewards = JSON.parse(JSON.stringify(pvpEvent.rewards || []));

    if (op === "add") {
        const jsonRaw = args.slice(1).join(" ").trim();
        if (!jsonRaw) return sendErr(message, "Error, JSON required.", `Use: \`reward add {"rank":1,"money":1000000}\` or \`reward add {"topPercent":10,"fuseTokens":50}\``, currentMessage);
        let parsed;
        try { parsed = JSON.parse(jsonRaw); }
        catch (err) { return sendErr(message, "Error, JSON parse failed.", err.message, currentMessage); }
        const v = validateRewardTier(parsed);
        if (v.error) return sendErr(message, "Error, invalid reward tier.", v.error, currentMessage);
        rewards.push(v.tier);
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { rewards });
        return success(message, `Added reward tier #${rewards.length}.`, JSON.stringify(v.tier), currentMessage);
    }

    if (op === "remove") {
        const idx = parseInt(args[1], 10);
        if (isNaN(idx) || idx < 1 || idx > rewards.length) return sendErr(message, "Error, invalid tier index.", `Got "${args[1]}", have ${rewards.length} tier(s).`, currentMessage);
        const removed = rewards.splice(idx - 1, 1);
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { rewards });
        return success(message, `Removed reward tier #${idx}.`, JSON.stringify(removed[0]), currentMessage);
    }

    if (op === "removefield") {
        const idx = parseInt(args[1], 10);
        if (isNaN(idx) || idx < 1 || idx > rewards.length) return sendErr(message, "Error, invalid tier index.", `Got "${args[1]}", have ${rewards.length} tier(s).`, currentMessage);
        const field = args[2];
        if (!field) return sendErr(message, "Error, field name required.", "Use: `reward removefield <index> <fieldname>` (e.g. `fuseTokens`, `money`, `trophies`, `car`, `pack`).", currentMessage);
        const protectedKeys = new Set(["rank", "topPercent"]);
        if (protectedKeys.has(field)) return sendErr(message, "Error, can't remove tier identifier.", "`rank` and `topPercent` define the tier itself — use `reward remove` to drop the whole tier instead.", currentMessage);
        const tier = rewards[idx - 1];
        if (!(field in tier)) return sendErr(message, "Error, that field isn't on this tier.", `Tier #${idx} has: ${Object.keys(tier).filter(k => !protectedKeys.has(k)).join(", ") || "_(no reward fields)_"}.`, currentMessage);

        // Refuse if removing this would leave the tier with no actual rewards
        const rewardFields = Object.keys(tier).filter(k => !protectedKeys.has(k));
        if (rewardFields.length === 1) {
            return sendErr(message, "Error, that's the tier's only reward field.", `Removing \`${field}\` would leave tier #${idx} empty. Use \`reward remove ${idx}\` to drop the whole tier instead.`, currentMessage);
        }

        delete tier[field];
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { rewards });
        return success(message, `Removed \`${field}\` from reward tier #${idx}.`, JSON.stringify(tier), currentMessage);
    }

    if (op === "clear") {
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { rewards: [] });
        return success(message, "Cleared all reward tiers.", undefined, currentMessage);
    }

    return sendErr(message, "Error, unknown reward operation.", "Use: `add`, `remove`, `removefield`, or `clear`.", currentMessage);
}

function validateRewardTier(obj) {
    if (typeof obj !== "object" || obj === null) return { error: "Must be an object." };
    const hasRank = typeof obj.rank === "number" && obj.rank >= 1;
    const hasPercent = typeof obj.topPercent === "number" && obj.topPercent > 0 && obj.topPercent <= 100;
    const hasRange = Array.isArray(obj.rankRange) && obj.rankRange.length === 2
        && typeof obj.rankRange[0] === "number" && typeof obj.rankRange[1] === "number"
        && obj.rankRange[0] >= 1 && obj.rankRange[1] >= obj.rankRange[0];

    const qualifiers = [hasRank, hasPercent, hasRange].filter(Boolean).length;
    if (qualifiers === 0) {
        return { error: "Tier needs one qualifier: `rank` (number ≥ 1), `rankRange` ([start, end] with start ≤ end), or `topPercent` (1–100)." };
    }
    if (qualifiers > 1) {
        return { error: "Tier can only have one qualifier — pick `rank`, `rankRange`, OR `topPercent`." };
    }

    // Has at least one reward field?
    // (fuseTokens removed — legacy field no longer awarded.)
    const rewardKeys = ["money", "trophies", "car", "pack"];
    const present = rewardKeys.filter(k => obj[k] !== undefined);
    if (present.length === 0) return { error: `Tier needs at least one reward field (${rewardKeys.join(", ")}).` };
    if (obj.fuseTokens !== undefined) return { error: "`fuseTokens` is no longer a supported reward — remove it." };

    // Validate types
    for (const k of ["money", "trophies"]) {
        if (obj[k] !== undefined && (typeof obj[k] !== "number" || obj[k] < 0)) {
            return { error: `\`${k}\` must be a non-negative number.` };
        }
    }
    if (obj.car !== undefined) {
        let carObj = obj.car;
        if (typeof carObj === "string") carObj = { carID: carObj, upgrade: "000" };
        if (!carObj.carID || !getCar(carObj.carID)) return { error: `Reward car \`${carObj.carID}\` not found.` };
        if (carObj.upgrade && !VALID_TUNES.includes(String(carObj.upgrade))) return { error: `Invalid car upgrade "${carObj.upgrade}".` };
        obj.car = { carID: carObj.carID, upgrade: carObj.upgrade || "000" };
    }
    if (obj.pack !== undefined && typeof obj.pack !== "string") return { error: "`pack` must be a pack ID string." };

    return { tier: obj };
}

// ============================================================================
// Bulk JSON edit
// ============================================================================

async function editBulk(message, pvpEvent, args, currentMessage) {
    if (pvpEvent.isActive) return sendErr(message, "Error, can't bulk-edit a live event.", "Bulk edits are restricted to inactive events.", currentMessage);
    const jsonRaw = args.join(" ").trim();
    if (!jsonRaw) return sendErr(message, "Error, JSON required.", "Use: `bulk <JSON object>`.", currentMessage);
    let parsed;
    try { parsed = JSON.parse(jsonRaw); }
    catch (err) { return sendErr(message, "Error, JSON parse failed.", err.message, currentMessage); }

    const updates = {};
    const issues = [];

    if (parsed.duration !== undefined) {
        const dParsed = parseDuration(parsed.duration);
        if (!dParsed) issues.push(`\`duration\` must be \`<number><unit>\` (m/h/d/w), e.g. "1h", "30m", "7d".`);
        else {
            const dErr = validateDurationBounds(dParsed);
            if (dErr) issues.push(`\`duration\`: ${dErr}`);
            else updates.deadline = dParsed.raw;
        }
    }
    if (parsed.ticketCap !== undefined) {
        if (typeof parsed.ticketCap !== "number" || parsed.ticketCap < 1 || parsed.ticketCap > 100) issues.push("`ticketCap` must be 1–100.");
        else updates.ticketCap = parsed.ticketCap;
    }
    if (parsed.ticketRegenMinutes !== undefined) {
        if (typeof parsed.ticketRegenMinutes !== "number" || parsed.ticketRegenMinutes < 1) issues.push("`ticketRegenMinutes` must be ≥ 1.");
        else updates.ticketRegenMinutes = parsed.ticketRegenMinutes;
    }
    if (parsed.matchCooldownSeconds !== undefined) {
        if (typeof parsed.matchCooldownSeconds !== "number" || parsed.matchCooldownSeconds < 0) issues.push("`matchCooldownSeconds` must be ≥ 0.");
        else updates.matchCooldownSeconds = parsed.matchCooldownSeconds;
    }
    if (parsed.deckCrCap !== undefined) {
        if (typeof parsed.deckCrCap !== "number" || parsed.deckCrCap < 0) issues.push("`deckCrCap` must be ≥ 0 (0 = no cap).");
        else updates.deckCrCap = parsed.deckCrCap;
    }
    if (parsed.reqs !== undefined) {
        if (typeof parsed.reqs !== "object" || parsed.reqs === null) issues.push("`reqs` must be an object.");
        else updates.reqs = parsed.reqs; // trust user — same shape as event reqs
    }
    if (parsed.tracksets !== undefined) {
        if (!Array.isArray(parsed.tracksets)) issues.push("`tracksets` must be an array.");
        else {
            const cleaned = [];
            for (let i = 0; i < parsed.tracksets.length; i++) {
                const v = validateTracks(parsed.tracksets[i]);
                if (v.error) issues.push(`tracksets[${i}]: ${v.error}`);
                else cleaned.push(v.ids);
            }
            if (issues.length === 0) updates.tracksets = cleaned;
        }
    }
    if (parsed.ghostDecks !== undefined) {
        if (typeof parsed.ghostDecks !== "object" || parsed.ghostDecks === null) issues.push("`ghostDecks` must be an object.");
        else {
            const cleaned = {};
            for (const [k, arr] of Object.entries(parsed.ghostDecks)) {
                if (!Array.isArray(arr)) { issues.push(`ghostDecks["${k}"] must be an array.`); continue; }
                cleaned[k] = [];
                for (let i = 0; i < arr.length; i++) {
                    const v = validateGhostDeck(arr[i]);
                    if (v.error) issues.push(`ghostDecks["${k}"][${i}]: ${v.error}`);
                    else cleaned[k].push(v.ghost);
                }
            }
            if (issues.length === 0) updates.ghostDecks = cleaned;
        }
    }
    if (parsed.rewards !== undefined) {
        if (!Array.isArray(parsed.rewards)) issues.push("`rewards` must be an array.");
        else {
            const cleaned = [];
            for (let i = 0; i < parsed.rewards.length; i++) {
                const v = validateRewardTier(parsed.rewards[i]);
                if (v.error) issues.push(`rewards[${i}]: ${v.error}`);
                else cleaned.push(v.tier);
            }
            if (issues.length === 0) updates.rewards = cleaned;
        }
    }

    if (issues.length > 0) {
        return sendErr(message, "Error, bulk edit had issues.", `**Issues:**\n• ${issues.join("\n• ")}\n\nNo changes were applied.`, currentMessage);
    }
    if (Object.keys(updates).length === 0) {
        return sendErr(message, "Error, no recognised fields in bulk JSON.", "Supported: duration, ticketCap, ticketRegenMinutes, matchCooldownSeconds, reqs, tracksets, ghostDecks, rewards.", currentMessage);
    }

    await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, updates);
    return success(message, "Bulk edit applied.", `Updated fields: ${Object.keys(updates).join(", ")}.`, currentMessage);
}

// ============================================================================
// Reset
// ============================================================================

async function resetField(message, pvpEvent, args, currentMessage) {
    if (pvpEvent.isActive) return sendErr(message, "Error, can't reset entries on a live event.", "End the event first.", currentMessage);
    const what = (args[0] || "").toLowerCase();
    if (what === "entries") {
        await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, { entries: {} });
        return success(message, "Cleared all participant entries.", undefined, currentMessage);
    }
    return sendErr(message, "Error, unknown reset target.", "Currently only `reset entries` is supported.", currentMessage);
}

// ============================================================================
// Tiny helpers
// ============================================================================

function sendErr(message, title, desc, currentMessage) {
    return new ErrorMessage({
        channel: message.channel,
        title,
        desc,
        author: message.author
    }).sendMessage({ currentMessage });
}

function success(message, title, desc, currentMessage) {
    return new SuccessMessage({
        channel: message.channel,
        title,
        desc,
        author: message.author
    }).sendMessage({ currentMessage });
}
