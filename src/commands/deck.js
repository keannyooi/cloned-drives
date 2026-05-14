"use strict";

/**
 * cd-deck — manage saved 5-car decks for use in PvP events.
 *
 * Saved deck shape (lives on profile.decks):
 *   {
 *     name: "Speed Demons",
 *     hand: [ {carID, upgrade}, null, ..., {carID, upgrade} ],
 *     lockedEvent: "pvpe5"   // optional — pvpEventID this deck is built against
 *   }
 *
 * `hand` is always exactly 5 entries. Empty slots are null (deck is "incomplete"
 * and unusable in PvP until all 5 are filled).
 *
 * `lockedEvent` is optional — when set, `cd-deck setslot` validates each new car
 * against that event's reqs + deckCrCap so the player can't accidentally build
 * something that won't pass `cd-pvpplay`. The lock looks up the event live, so
 * if the event ends or its reqs change, the deck still works (with a warning).
 */

const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getCar } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const searchGarage = require("../util/functions/searchGarage.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const filterCheck = require("../util/functions/filterCheck.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const pvpEventModel = require("../models/pvpEventSchema.js");

const MAX_DECKS = 25;
const MAX_NAME_LENGTH = 32;
const SLOT_COUNT = 5;

module.exports = {
    name: "deck",
    aliases: ["decks"],
    usage: [
        "(no args — lists your decks)",
        "list",
        "create <name>",
        "create <name> | <event name>",
        "show <name>",
        "delete <name>",
        "rename <old name> <new name>     (pipes optional)",
        "lock <deck name> | <event name>",
        "unlock <deck name>",
        "setslot <deck name> <slot 1-5> <car name>     (pipes optional)",
        "clearslot <deck name> <slot 1-5>     (pipes optional)",
        "swap <deck name> <slot1> <slot2>     (pipes optional)"
    ],
    args: 0,
    category: "Gameplay",
    description: "Create and manage saved 5-car decks for use in PvP events.",
    async execute(message, args) {
        const playerData = await profileModel.findOne({ userID: message.author.id });
        if (!playerData) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, no profile found.",
                desc: "You need a profile before creating decks. Try `cd-daily` to get started.",
                author: message.author
            }).sendMessage();
        }

        // Defensive: make sure decks is an array
        if (!Array.isArray(playerData.decks)) playerData.decks = [];

        const subcmd = (args[0] || "list").toLowerCase();
        const rest = args.slice(1).join(" ").trim();

        switch (subcmd) {
            case "list":
                return listDecks(message, playerData);
            case "create":
                return createDeck(message, playerData, rest);
            case "show":
            case "view":
                return showDeck(message, playerData, rest);
            case "delete":
            case "remove":
                return deleteDeck(message, playerData, rest);
            case "rename":
                return renameDeck(message, playerData, rest);
            case "setslot":
            case "set":
                return setSlot(message, playerData, rest);
            case "clearslot":
            case "clear":
                return clearSlot(message, playerData, rest);
            case "swap":
                return swapSlots(message, playerData, rest);
            case "lock":
                return lockDeck(message, playerData, rest);
            case "unlock":
                return unlockDeck(message, playerData, rest);
            default:
                return new ErrorMessage({
                    channel: message.channel,
                    title: "Error, unknown deck subcommand.",
                    desc: "Run `cd-help deck` for the full list of subcommands.",
                    author: message.author
                }).displayClosest(subcmd).sendMessage();
        }
    }
};

// ============================================================================
// Subcommand handlers
// ============================================================================

async function listDecks(message, playerData) {
    if (playerData.decks.length === 0) {
        return new InfoMessage({
            channel: message.channel,
            title: "You have no saved decks.",
            desc: "Create one with `cd-deck create <name>`, then fill its 5 slots with `cd-deck setslot`.",
            author: message.author
        }).sendMessage();
    }

    // Pre-fetch all events the user has locks against so we can show event names.
    // (One query, mapped by ID — avoids N queries for N locked decks.)
    const lockedIDs = playerData.decks.map(d => d.lockedEvent).filter(Boolean);
    const eventByID = new Map();
    if (lockedIDs.length > 0) {
        try {
            const events = await pvpEventModel.find({ pvpEventID: { $in: lockedIDs } });
            for (const e of events) eventByID.set(e.pvpEventID, e);
        } catch { /* graceful fallback — show without names */ }
    }

    let list = "";
    for (const deck of playerData.decks) {
        // Defensive: legacy decks created before the schema settled may lack `hand`.
        const hand = Array.isArray(deck.hand) ? deck.hand : [];
        const filled = hand.filter(s => s !== null).length;
        const status = filled === SLOT_COUNT ? "✅ Ready" : `⚠️ ${filled}/${SLOT_COUNT}`;
        let lockTag = "";
        if (deck.lockedEvent) {
            const evt = eventByID.get(deck.lockedEvent);
            lockTag = evt ? ` 🔒 _${evt.name}_` : ` 🔒 _(event missing)_`;
        }
        list += `• **${deck.name}** — ${status}${lockTag}\n`;
    }

    return new InfoMessage({
        channel: message.channel,
        title: `${message.author.username}'s Decks (${playerData.decks.length}/${MAX_DECKS})`,
        desc: list,
        author: message.author,
        footer: "Use `cd-deck show <name>` to see deck contents."
    }).sendMessage();
}

async function createDeck(message, playerData, rest) {
    if (playerData.decks.length >= MAX_DECKS) {
        return sendErr(message, "Error, deck limit reached.",
            `You can have a maximum of ${MAX_DECKS} saved decks. Delete one first with \`cd-deck delete <name>\`.`);
    }

    // Allow `<name>` (unlocked) OR `<name> | <event name>` (locked at creation)
    const parts = rest.split("|").map(s => s.trim());
    const name = parts[0];
    const eventQuery = parts.length > 1 ? parts.slice(1).join("|").trim() : null;

    const validation = validateNewName(name, playerData.decks);
    if (validation.error) return sendErr(message, validation.error.title, validation.error.desc);

    let lockedEventID = null;
    if (eventQuery) {
        const lookup = await findEventByName(eventQuery);
        if (lookup.error) return sendErr(message, lookup.error.title, lookup.error.desc);
        lockedEventID = lookup.event.pvpEventID;
    }

    const newDeck = {
        name: validation.name,
        hand: Array(SLOT_COUNT).fill(null)
    };
    if (lockedEventID) newDeck.lockedEvent = lockedEventID;
    playerData.decks.push(newDeck);

    await profileModel.updateOne({ userID: message.author.id }, { decks: playerData.decks });

    return new SuccessMessage({
        channel: message.channel,
        title: `Created deck "${validation.name}"!`,
        desc: lockedEventID
            ? `Locked to **${eventQuery}** — \`cd-deck setslot\` will validate cars against this event's reqs + CR cap.\n\nNow fill its 5 slots with \`cd-deck setslot ${validation.name} | <slot> | <car name>\`.`
            : `Now fill its 5 slots with \`cd-deck setslot ${validation.name} | <slot> | <car name>\`.`,
        author: message.author
    }).sendMessage();
}

async function showDeck(message, playerData, name) {
    if (!name) return sendErr(message, "Error, deck name required.", "Use: `cd-deck show <name>` (partial match works).");
    if (!Array.isArray(playerData.decks) || playerData.decks.length === 0) {
        return sendErr(message, "You have no saved decks.", "Create one with `cd-deck create <name>`.");
    }

    // Try exact match first (preserves the fast path when the user types the full name)
    const exact = findDeck(playerData.decks, name);
    if (exact) {
        return renderDeck(message, playerData, exact);
    }

    // Fall through to fuzzy match — uses the same search.js helper as cd-events,
    // so multiple matches → select menu, no matches → "not found" error.
    const query = name.toLowerCase().split(/\s+/).filter(Boolean);
    return new Promise(resolve => resolve(search(message, query, playerData.decks, "deck")))
        .then(async (response) => {
            if (!Array.isArray(response)) return;
            const [deck, currentMessage] = response;
            await renderDeck(message, playerData, deck, currentMessage);
        })
        .catch(error => { throw error; });
}

/** Render a deck's details in an InfoMessage. Extracted so both the exact-match
 *  and fuzzy-match paths can call it. */
async function renderDeck(message, playerData, deck, currentMessage) {
    let list = "";
    let totalCR = 0;
    for (let i = 0; i < SLOT_COUNT; i++) {
        const slot = deck.hand[i];
        if (!slot) {
            list += `**Slot ${i + 1}:** _(empty)_\n`;
        }
        else {
            const car = getCar(slot.carID);
            const cr = car?.cr || 0;
            totalCR += cr;
            const carName = car ? carNameGen({ currentCar: car, rarity: true, upgrade: slot.upgrade }) : `Unknown (${slot.carID})`;
            list += `**Slot ${i + 1}:** ${carName} _(CR ${cr})_\n`;
        }
    }

    const filled = deck.hand.filter(s => s !== null).length;
    const ready = filled === SLOT_COUNT;

    // Resolve lock for context + sanity check
    const { event: lockedEvent, missing } = await lookupLockedEvent(deck);
    const fields = [];
    if (deck.lockedEvent) {
        if (missing) {
            fields.push({
                name: "🔒 Lock",
                value: `_(Event missing — original lock referenced \`${deck.lockedEvent}\` which no longer exists. Run \`cd-deck unlock ${deck.name}\` to clear.)_`,
                inline: false
            });
        }
        else {
            const issues = checkHandAgainstEvent(deck.hand, lockedEvent);
            const capDisplay = lockedEvent.deckCrCap > 0 ? `${totalCR}/${lockedEvent.deckCrCap}` : `${totalCR}`;
            const lockValue = [
                `Locked to **${lockedEvent.name}** _(${lockedEvent.pvpEventID})_`,
                `💎 Total CR: **${capDisplay}**`,
                issues.length === 0
                    ? `✅ All slots fit this event's reqs and CR cap.`
                    : `⚠️ **${issues.length} issue(s):**\n• ${issues.join("\n• ")}`
            ].join("\n");
            fields.push({ name: "🔒 Lock", value: lockValue, inline: false });
        }
    }
    else {
        fields.push({ name: "💎 Total CR", value: String(totalCR), inline: true });
    }

    return new InfoMessage({
        channel: message.channel,
        title: `Deck: ${deck.name}`,
        desc: list,
        author: message.author,
        fields,
        footer: ready ? "✅ Ready for PvP" : `⚠️ ${filled}/${SLOT_COUNT} slots filled — fill the rest before using in PvP`
    }).sendMessage({ currentMessage });
}

async function deleteDeck(message, playerData, name) {
    const deck = findDeck(playerData.decks, name);
    if (!deck) return sendErr(message, "Error, deck not found.", `No deck named "${name}".`);

    const confirmationMessage = new InfoMessage({
        channel: message.channel,
        title: `Delete the deck "${deck.name}"?`,
        desc: "This is permanent.",
        author: message.author
    });

    await confirm(message, confirmationMessage, async (currentMessage) => {
        const idx = playerData.decks.indexOf(deck);
        playerData.decks.splice(idx, 1);
        await profileModel.updateOne({ userID: message.author.id }, { decks: playerData.decks });

        return new SuccessMessage({
            channel: message.channel,
            title: `Deleted deck "${deck.name}".`,
            author: message.author
        }).sendMessage({ currentMessage });
    }, playerData.settings?.buttonstyle);
}

async function renameDeck(message, playerData, rest) {
    const parsed = parseRenameArgs(rest, playerData.decks);
    if (parsed.error) return sendErr(message, "Error, rename syntax invalid.", parsed.error);
    const { deck, newName } = parsed;

    const validation = validateNewName(newName, playerData.decks);
    if (validation.error) return sendErr(message, validation.error.title, validation.error.desc);

    const previous = deck.name;
    deck.name = validation.name;
    await profileModel.updateOne({ userID: message.author.id }, { decks: playerData.decks });

    return new SuccessMessage({
        channel: message.channel,
        title: `Renamed "${previous}" → "${deck.name}".`,
        author: message.author
    }).sendMessage();
}

async function setSlot(message, playerData, rest) {
    const parsed = parseSetslotArgs(rest, playerData.decks);
    if (parsed.error) return sendErr(message, "Error, setslot syntax invalid.", parsed.error);
    const { deck, slot, carQuery } = parsed;

    // If the deck is locked to an event, look up the event for live validation.
    // Gracefully degrade if the event was deleted or no events exist anymore.
    const { event: lockedEvent, missing: lockMissing } = await lookupLockedEvent(deck);

    // Use searchGarage to fuzzy-match a car the player owns
    const query = carQuery.toLowerCase().split(" ");
    await new Promise(resolve => resolve(searchGarage({
        message,
        query,
        garage: playerData.garage,
        amount: 1
    })))
        .then(async (response) => {
            if (!Array.isArray(response)) return;
            const [garageCar, currentMessage] = response;

            // Pick a tune they own at least 1 of
            await new Promise(resolve => resolve(selectUpgrade({
                message,
                currentCar: garageCar,
                amount: 1,
                currentMessage
            })))
                .then(async (upgradeResponse) => {
                    if (!Array.isArray(upgradeResponse)) return;
                    const [upgrade, currentMessage2] = upgradeResponse;
                    const car = getCar(garageCar.carID);
                    const carName = carNameGen({ currentCar: car, rarity: true, upgrade });

                    // Ownership check — accounting for copies already used in OTHER slots of this deck.
                    // Without this, a player with 1× Civic at 996 could put it in 5 slots since each
                    // slot independently sees "owned: 1 ≥ 1 ✓". Count the other slots first.
                    const owned = garageCar.upgrades?.[upgrade] || 0;
                    const usedInOtherSlots = deck.hand.reduce((sum, s, idx) => {
                        if (idx === slot - 1) return sum; // skip the slot being replaced
                        if (s && s.carID === garageCar.carID && s.upgrade === upgrade) return sum + 1;
                        return sum;
                    }, 0);
                    if (owned < usedInOtherSlots + 1) {
                        return new ErrorMessage({
                            channel: message.channel,
                            title: `Error, you don't own enough copies.`,
                            desc: `You own **${owned}× ${carName}** but **${usedInOtherSlots}** is already used in other slot${usedInOtherSlots === 1 ? "" : "s"} of "${deck.name}". You'd need at least **${usedInOtherSlots + 1}** to place another.`,
                            author: message.author
                        }).sendMessage({ currentMessage: currentMessage2 });
                    }

                    // Lock-aware validation
                    if (lockedEvent) {
                        // Per-car reqs check
                        const reqs = lockedEvent.reqs || {};
                        if (Object.keys(reqs).length > 0) {
                            if (!filterCheck({ car: { carID: garageCar.carID, upgrade }, filter: reqs, applyOrLogic: false })) {
                                return new ErrorMessage({
                                    channel: message.channel,
                                    title: `Error, "${car.model}" doesn't meet ${lockedEvent.name} reqs.`,
                                    desc: `This deck is locked to **${lockedEvent.name}**. Pick a different car, or unlock with \`cd-deck unlock ${deck.name}\`.`,
                                    author: message.author
                                }).sendMessage({ currentMessage: currentMessage2 });
                            }
                        }
                        // Deck CR cap check (sum of slots, with this slot replaced)
                        const cap = lockedEvent.deckCrCap || 0;
                        if (cap > 0) {
                            const newCarCR = car?.cr || 0;
                            let totalCR = newCarCR;
                            for (let i = 0; i < SLOT_COUNT; i++) {
                                if (i === slot - 1) continue;
                                const s = deck.hand[i];
                                if (s) totalCR += getCar(s.carID)?.cr || 0;
                            }
                            if (totalCR > cap) {
                                const otherCR = totalCR - newCarCR;
                                const remaining = cap - otherCR;
                                return new ErrorMessage({
                                    channel: message.channel,
                                    title: `Error, would bust the ${lockedEvent.name} CR cap.`,
                                    desc: `**${carName}** is **${newCarCR} CR**, but with the rest of your deck (${otherCR} CR) you only have **${remaining} CR** left in the budget. Pick a lower-CR car or swap out other slots first.`,
                                    author: message.author
                                }).sendMessage({ currentMessage: currentMessage2 });
                            }
                        }
                    }

                    // Save
                    deck.hand[slot - 1] = { carID: garageCar.carID, upgrade };
                    await profileModel.updateOne({ userID: message.author.id }, { decks: playerData.decks });

                    let descLines = [`**${carName}** is now in slot ${slot}.`];
                    if (lockMissing) {
                        descLines.push(`\n⚠️ This deck is locked to a PvP event that no longer exists — validation was skipped. Use \`cd-deck unlock ${deck.name}\` to clear the lock.`);
                    }
                    if (lockedEvent && lockedEvent.deckCrCap > 0) {
                        const totalCR = deck.hand.reduce((s, slot) => s + (slot ? (getCar(slot.carID)?.cr || 0) : 0), 0);
                        descLines.push(`\n💎 Total CR: **${totalCR}/${lockedEvent.deckCrCap}**`);
                    }

                    return new SuccessMessage({
                        channel: message.channel,
                        title: `Slot ${slot} of "${deck.name}" set!`,
                        desc: descLines.join(""),
                        author: message.author,
                        thumbnail: car?.["racehud"]
                    }).sendMessage({ currentMessage: currentMessage2 });
                })
                .catch(error => { throw error; });
        })
        .catch(error => { throw error; });
}

async function clearSlot(message, playerData, rest) {
    const parsed = parseClearslotArgs(rest, playerData.decks);
    if (parsed.error) return sendErr(message, "Error, clearslot syntax invalid.", parsed.error);
    const { deck, slot } = parsed;

    if (deck.hand[slot - 1] === null) {
        return sendErr(message, "Slot is already empty.", `Slot ${slot} of "${deck.name}" has no car assigned.`);
    }

    deck.hand[slot - 1] = null;
    await profileModel.updateOne({ userID: message.author.id }, { decks: playerData.decks });

    return new SuccessMessage({
        channel: message.channel,
        title: `Cleared slot ${slot} of "${deck.name}".`,
        author: message.author
    }).sendMessage();
}

async function swapSlots(message, playerData, rest) {
    const parsed = parseSwapArgs(rest, playerData.decks);
    if (parsed.error) return sendErr(message, "Error, swap syntax invalid.", parsed.error);
    const { deck, slot1, slot2 } = parsed;

    if (slot1 === slot2) {
        return sendErr(message, "Slots must be different.", "You can't swap a slot with itself.");
    }

    [deck.hand[slot1 - 1], deck.hand[slot2 - 1]] = [deck.hand[slot2 - 1], deck.hand[slot1 - 1]];
    await profileModel.updateOne({ userID: message.author.id }, { decks: playerData.decks });

    return new SuccessMessage({
        channel: message.channel,
        title: `Swapped slots ${slot1} and ${slot2} in "${deck.name}".`,
        author: message.author
    }).sendMessage();
}

async function lockDeck(message, playerData, rest) {
    const parts = rest.split("|").map(s => s.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return sendErr(message, "Error, lock syntax invalid.",
            "Use: `cd-deck lock <deck name> | <event name>`");
    }
    const [deckName, eventQuery] = parts;

    const deck = findDeck(playerData.decks, deckName);
    if (!deck) return sendErr(message, "Error, deck not found.", `No deck named "${deckName}".`);

    const lookup = await findEventByName(eventQuery);
    if (lookup.error) return sendErr(message, lookup.error.title, lookup.error.desc);

    deck.lockedEvent = lookup.event.pvpEventID;
    await profileModel.updateOne({ userID: message.author.id }, { decks: playerData.decks });

    // Sanity-check current hand against the lock and warn if anything no longer fits.
    const issues = checkHandAgainstEvent(deck.hand, lookup.event);

    return new SuccessMessage({
        channel: message.channel,
        title: `Locked "${deck.name}" to ${lookup.event.name}.`,
        desc: issues.length === 0
            ? `Future \`cd-deck setslot\` calls will validate against this event's reqs and CR cap.`
            : `Future \`cd-deck setslot\` calls will validate against this event's reqs and CR cap.\n\n⚠️ **Existing hand has ${issues.length} issue(s):**\n• ${issues.join("\n• ")}\n\nYou can still play but won't pass \`cd-pvpplay\` until they're fixed.`,
        author: message.author
    }).sendMessage();
}

async function unlockDeck(message, playerData, name) {
    const deck = findDeck(playerData.decks, name);
    if (!deck) return sendErr(message, "Error, deck not found.", `No deck named "${name}".`);
    if (!deck.lockedEvent) return sendErr(message, "Deck isn't locked.", `"${deck.name}" has no event lock.`);

    delete deck.lockedEvent;
    await profileModel.updateOne({ userID: message.author.id }, { decks: playerData.decks });

    return new SuccessMessage({
        channel: message.channel,
        title: `Unlocked "${deck.name}".`,
        desc: "Future `cd-deck setslot` calls will skip event-based validation.",
        author: message.author
    }).sendMessage();
}

// ============================================================================
// Helpers
// ============================================================================

/** Case-insensitive deck lookup by name. */
function findDeck(decks, name) {
    if (!name) return null;
    const lc = name.toLowerCase();
    return decks.find(d => d.name.toLowerCase() === lc) || null;
}

/**
 * Find a PvP event by name (active OR draft). Returns:
 *   { event }                     — exact / unique match
 *   { error: { title, desc } }    — no events exist, no match found, or ambiguous
 */
async function findEventByName(query) {
    const events = await pvpEventModel.find({});

    // Fallback: no PvP events at all
    if (events.length === 0) {
        return { error: {
            title: "Error, no PvP events available.",
            desc: "There are no PvP events to lock to. Ask an admin to create one with `cd-createpvp`, or create the deck without a lock by leaving off `| <event>`."
        } };
    }

    const lc = query.toLowerCase();
    const exact = events.find(e => e.name.toLowerCase() === lc);
    if (exact) return { event: exact };

    const partial = events.filter(e => e.name.toLowerCase().includes(lc));
    if (partial.length === 0) {
        const all = events.map(e => `\`${e.name}\``).join(", ");
        return { error: {
            title: "Error, event not found.",
            desc: `No PvP event named "${query}". Available: ${all}.`
        } };
    }
    if (partial.length > 1) {
        const names = partial.map(e => `\`${e.name}\``).join(", ");
        return { error: {
            title: "Error, ambiguous event name.",
            desc: `Multiple events match "${query}": ${names}. Be more specific.`
        } };
    }
    return { event: partial[0] };
}

/**
 * Look up the event a deck is currently locked to. Returns { event, missing }:
 *   - missing=true if the lock points to a deleted/expired event (handled gracefully)
 */
async function lookupLockedEvent(deck) {
    if (!deck.lockedEvent) return { event: null, missing: false };
    const event = await pvpEventModel.findOne({ pvpEventID: deck.lockedEvent });
    if (!event) return { event: null, missing: true };
    return { event, missing: false };
}

/**
 * Check a deck's hand against an event's reqs + CR cap.
 * Returns array of human-readable issue strings (empty if all good).
 */
function checkHandAgainstEvent(hand, event) {
    const issues = [];
    const cap = event.deckCrCap || 0;
    const reqs = event.reqs || {};
    let totalCR = 0;
    let allFilled = true;
    for (let i = 0; i < SLOT_COUNT; i++) {
        const slot = hand[i];
        if (!slot) { allFilled = false; continue; }
        const car = getCar(slot.carID);
        if (!car) { issues.push(`Slot ${i + 1}: car not found (${slot.carID})`); continue; }
        totalCR += car.cr || 0;
        if (Object.keys(reqs).length > 0) {
            if (!filterCheck({ car: { carID: slot.carID, upgrade: slot.upgrade }, filter: reqs, applyOrLogic: false })) {
                issues.push(`Slot ${i + 1} (${car.model}) doesn't meet event reqs`);
            }
        }
    }
    if (allFilled && cap > 0 && totalCR > cap) {
        issues.push(`Total CR ${totalCR} exceeds event cap ${cap}`);
    }
    return issues;
}

/**
 * Validate a new deck name. Returns either:
 *   { name: trimmedName }  — valid, use the trimmed version
 *   { error: { title, desc } } — validation failure
 */
function validateNewName(rawName, existingDecks) {
    const name = (rawName || "").trim();
    if (!name) {
        return { error: { title: "Error, deck name required.", desc: "Provide a name after the subcommand." } };
    }
    if (name.length > MAX_NAME_LENGTH) {
        return { error: { title: "Error, deck name too long.", desc: `Maximum ${MAX_NAME_LENGTH} characters.` } };
    }
    if (name.includes("|")) {
        return { error: { title: "Error, name cannot contain `|`.", desc: "The pipe is used as a delimiter in deck commands." } };
    }
    if (existingDecks.some(d => d.name.toLowerCase() === name.toLowerCase())) {
        return { error: { title: "Error, name already taken.", desc: `You already have a deck named "${name}".` } };
    }
    return { name };
}

/** Parse "1"-"5" into an int 1-5, or null if invalid. */
function parseSlot(str) {
    const n = parseInt(str, 10);
    if (isNaN(n) || n < 1 || n > SLOT_COUNT) return null;
    return n;
}

/** True iff `str` is exactly one of "1".."5" (no surrounding chars). */
function isSlotToken(str) {
    return /^[1-5]$/.test(str);
}

/**
 * Parse the args of `setslot <deck> <slot> <car>` allowing pipes OR pipe-free.
 *
 * Pipe-free strategy: scan the tokens for the FIRST one that's a standalone slot digit (1-5)
 * AND whose preceding tokens form a real deck name. Everything after = car query.
 *
 * Returns { deck, slot, carQuery } or { error: "..." }.
 */
function parseSetslotArgs(rest, decks) {
    if (rest.includes("|")) {
        const parts = rest.split("|").map(s => s.trim());
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
            return { error: "Use: `cd-deck setslot <deck name> | <slot 1-5> | <car name>`" };
        }
        const deck = findDeck(decks, parts[0]);
        if (!deck) return { error: `No deck named "${parts[0]}".` };
        const slot = parseSlot(parts[1]);
        if (slot === null) return { error: `Slot must be 1-${SLOT_COUNT}, got "${parts[1]}".` };
        return { deck, slot, carQuery: parts[2] };
    }

    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) {
        return { error: "Need at least 3 parts: deck name, slot, car name." };
    }
    for (let i = 1; i < tokens.length - 1; i++) {
        if (!isSlotToken(tokens[i])) continue;
        const deckName = tokens.slice(0, i).join(" ");
        const deck = findDeck(decks, deckName);
        if (!deck) continue;
        const carQuery = tokens.slice(i + 1).join(" ");
        if (!carQuery) continue;
        return { deck, slot: parseInt(tokens[i], 10), carQuery };
    }
    return { error: "Couldn't match a deck name + slot. Try `cd-deck list` to check your decks, or use the explicit pipe syntax: `<deck> | <slot> | <car>`." };
}

/**
 * Parse `<deck> <slot>` for clearslot. Last token is the slot, rest is the deck name.
 * Returns { deck, slot } or { error }.
 */
function parseClearslotArgs(rest, decks) {
    if (rest.includes("|")) {
        const parts = rest.split("|").map(s => s.trim());
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return { error: "Use: `cd-deck clearslot <deck name> | <slot 1-5>`" };
        }
        const deck = findDeck(decks, parts[0]);
        if (!deck) return { error: `No deck named "${parts[0]}".` };
        const slot = parseSlot(parts[1]);
        if (slot === null) return { error: `Slot must be 1-${SLOT_COUNT}, got "${parts[1]}".` };
        return { deck, slot };
    }

    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return { error: "Need 2 parts: deck name and slot." };
    const lastIdx = tokens.length - 1;
    if (!isSlotToken(tokens[lastIdx])) {
        return { error: `Last token must be a slot 1-${SLOT_COUNT}, got "${tokens[lastIdx]}".` };
    }
    const deckName = tokens.slice(0, lastIdx).join(" ");
    const deck = findDeck(decks, deckName);
    if (!deck) return { error: `No deck named "${deckName}".` };
    return { deck, slot: parseInt(tokens[lastIdx], 10) };
}

/**
 * Parse `<deck> <slot1> <slot2>` for swap. Last two tokens are slots, rest is deck name.
 */
function parseSwapArgs(rest, decks) {
    if (rest.includes("|")) {
        const parts = rest.split("|").map(s => s.trim());
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
            return { error: "Use: `cd-deck swap <deck name> | <slot1> | <slot2>`" };
        }
        const deck = findDeck(decks, parts[0]);
        if (!deck) return { error: `No deck named "${parts[0]}".` };
        const s1 = parseSlot(parts[1]);
        const s2 = parseSlot(parts[2]);
        if (s1 === null || s2 === null) return { error: `Slots must both be 1-${SLOT_COUNT}.` };
        return { deck, slot1: s1, slot2: s2 };
    }

    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) return { error: "Need 3 parts: deck name, slot1, slot2." };
    const last = tokens.length - 1;
    if (!isSlotToken(tokens[last]) || !isSlotToken(tokens[last - 1])) {
        return { error: `Last two tokens must be slots 1-${SLOT_COUNT}.` };
    }
    const deckName = tokens.slice(0, last - 1).join(" ");
    const deck = findDeck(decks, deckName);
    if (!deck) return { error: `No deck named "${deckName}".` };
    return { deck, slot1: parseInt(tokens[last - 1], 10), slot2: parseInt(tokens[last], 10) };
}

/**
 * Parse `<old name> <new name>` for rename. Greedy: try splits where the prefix matches
 * an existing deck name, longest match first.
 */
function parseRenameArgs(rest, decks) {
    if (rest.includes("|")) {
        const parts = rest.split("|").map(s => s.trim());
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            return { error: "Use: `cd-deck rename <old name> | <new name>`" };
        }
        const deck = findDeck(decks, parts[0]);
        if (!deck) return { error: `No deck named "${parts[0]}".` };
        return { deck, newName: parts[1] };
    }

    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return { error: "Need 2 parts: old name and new name." };

    // Try longest prefix first — match the longest possible existing deck name from the front
    for (let split = tokens.length - 1; split >= 1; split--) {
        const oldName = tokens.slice(0, split).join(" ");
        const deck = findDeck(decks, oldName);
        if (deck) {
            const newName = tokens.slice(split).join(" ");
            return { deck, newName };
        }
    }
    return { error: "Couldn't find a matching deck name as the prefix. Try `cd-deck list`, or use the explicit pipe syntax: `<old> | <new>`." };
}

function sendErr(message, title, desc) {
    return new ErrorMessage({
        channel: message.channel,
        title,
        desc,
        author: message.author
    }).sendMessage();
}
