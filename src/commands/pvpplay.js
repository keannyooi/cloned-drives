"use strict";

/**
 * cd-pvpplay <event name>                    — pick from a dropdown of qualifying saved decks
 * cd-pvpplay <event name> deck <deck name>   — power-user shortcut: skip the dropdown
 *
 * Saved decks are now mandatory — players need a complete (5/5) saved deck that
 * meets the event's reqs and CR cap. Use `cd-deck create` + `cd-deck setslot` to
 * build one. Locking a deck to an event (`cd-deck create <name> | <event>`) makes
 * sure it'll qualify automatically.
 *
 * Match flow:
 *   1. Validate event, profile, tickets, cooldown
 *   2. Random trackset rolled
 *   3. Build opponent pool (3 closest by rank, ghost fallback)
 *   4. Player picks an opponent
 *   5. Player picks a qualifying saved deck (auto-skipped if only 1 qualifies)
 *   6. Slot assignment review (swap pairs + confirm)
 *   7. Spend ticket
 *   8. Run 5 races sequentially (race() posts each result)
 *   9. Compute match score with per-race floor of |10|
 *  10. Apply leaderboard delta with rank-distance multiplier ×0.05
 *  11. Update snapshot for THIS trackset only
 *  12. Persist all updates + show match summary embed
 *
 * Cancellation at any UI step before step 7 = no ticket spent.
 */

const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { DateTime } = require("luxon");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime, defaultWaitTime } = require("../util/consts/consts.js");
const { getCar, getTrack } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const filterCheck = require("../util/functions/filterCheck.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const createCar = require("../util/functions/createCar.js");
const race = require("../util/functions/race.js");
const profileModel = require("../models/profileSchema.js");
const pvpEventModel = require("../models/pvpEventSchema.js");
const {
    newEntry,
    applyRegen,
    secondsUntilNextTicket,
    spendTicket,
    formatDuration,
    buildLeaderboard
} = require("../util/functions/pvpTickets.js");

const SLOT_COUNT = 5;
const RANK_DISTANCE_MULTIPLIER = 0.05;
const PER_RACE_MIN_MAGNITUDE = 10;

module.exports = {
    name: "pvpplay",
    aliases: ["pvprace", "pvpmatch"],
    usage: [
        "<event name>",
        "<event name> deck <deck name>"
    ],
    args: 1,
    category: "Gameplay",
    description: "Spend a ticket to play a PvP match for a specific event.",
    async execute(message, args) {
        // Detect "deck <name>" suffix
        let savedDeckName = null;
        const deckIdx = args.findIndex(a => a.toLowerCase() === "deck");
        let queryArgs = args;
        if (deckIdx > 0 && deckIdx < args.length - 1) {
            savedDeckName = args.slice(deckIdx + 1).join(" ").trim();
            queryArgs = args.slice(0, deckIdx);
        }

        if (queryArgs.length === 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, event name required.",
                desc: "Use: `cd-pvpplay <event name>` or `cd-pvpplay <event name> deck <deck name>`",
                author: message.author
            }).sendMessage();
        }

        const events = await pvpEventModel.find({ isActive: true });
        if (events.length === 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, no active PvP events.",
                desc: "Use `cd-pvp` to see when events go live.",
                author: message.author
            }).sendMessage();
        }

        const playerData = await profileModel.findOne({ userID: message.author.id });
        if (!playerData) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, no profile found.",
                desc: "Use `cd-daily` to register.",
                author: message.author
            }).sendMessage();
        }

        await new Promise(resolve => resolve(search(message, queryArgs.map(a => a.toLowerCase()), events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                const [pvpEvent, currentMessage] = response;
                await runMatchFlow(message, pvpEvent, playerData, savedDeckName, currentMessage);
            })
            .catch(error => { throw error; });
    }
};

// ============================================================================
// Main flow
// ============================================================================

async function runMatchFlow(message, pvpEvent, playerData, savedDeckName, currentMessage) {
    // 0. Refuse new matches if the deadline already passed — even if isActive is still true,
    // the next 3-minute scheduler tick will end the event. Don't let a player squeeze in a match
    // between the deadline and cleanup.
    if (pvpEvent.deadline && pvpEvent.deadline !== "unlimited") {
        const deadline = DateTime.fromISO(pvpEvent.deadline);
        if (deadline.isValid && deadline < DateTime.now()) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, this PvP event has ended.",
                desc: `**${pvpEvent.name}** is awaiting cleanup — final standings are being processed. Check \`cd-pvp\` for currently-playable events.`,
                author: message.author
            }).sendMessage({ currentMessage });
        }
    }

    // 1. Get / create entry, apply regen
    const entries = pvpEvent.entries || {};
    const isNewPlayer = !entries[message.author.id];
    const entry = entries[message.author.id] || newEntry(pvpEvent);
    const ticketsBeforeRegen = entry.tickets;
    applyRegen(entry, pvpEvent.ticketCap, pvpEvent.ticketRegenMinutes);

    // 1b. If the player already has a DB entry AND regen actually added tickets,
    // persist the regen update right now. Otherwise the atomic spend filter later
    // will check against the stale (pre-regen) DB state and fail with "ticket spend failed".
    // We only update the two regen-relevant fields so we don't clobber concurrent updates
    // (e.g. admin ticket grants) to score / matchesPlayed / etc.
    if (!isNewPlayer && entry.tickets !== ticketsBeforeRegen) {
        try {
            await pvpEventModel.updateOne(
                { pvpEventID: pvpEvent.pvpEventID },
                { "$set": {
                    [`entries.${message.author.id}.tickets`]: entry.tickets,
                    [`entries.${message.author.id}.lastTicketUse`]: entry.lastTicketUse
                }}
            );
        } catch (err) {
            console.error(`[PvP] Failed to persist regen for ${message.author.id}: ${err.message}`);
            // Continue anyway — worst case the atomic spend below catches it
        }
    }

    // 2. Validate tickets
    if (entry.tickets <= 0) {
        const wait = secondsUntilNextTicket(entry, pvpEvent.ticketCap, pvpEvent.ticketRegenMinutes);
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, no tickets available.",
            desc: wait !== null ? `Next ticket in **${formatDuration(wait)}**.` : "Wait a bit and try again.",
            author: message.author
        }).sendMessage({ currentMessage });
    }

    // 3. Validate cooldown
    if (entry.lastMatchEnd) {
        const lastEnd = DateTime.fromISO(entry.lastMatchEnd);
        const cooldownEnd = lastEnd.plus({ seconds: pvpEvent.matchCooldownSeconds });
        const remaining = cooldownEnd.diff(DateTime.now(), "seconds").seconds;
        if (remaining > 0) {
            return new ErrorMessage({
                channel: message.channel,
                title: "Error, match cooldown active.",
                desc: `You can play another match in **${formatDuration(Math.ceil(remaining))}**.`,
                author: message.author
            }).sendMessage({ currentMessage });
        }
    }

    // 4. Roll a random trackset
    if (!Array.isArray(pvpEvent.tracksets) || pvpEvent.tracksets.length === 0) {
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, this event has no tracksets configured.",
            desc: "Tell an admin to set up tracksets via `cd-editpvp`.",
            author: message.author
        }).sendMessage({ currentMessage });
    }
    const tracksetIdx = Math.floor(Math.random() * pvpEvent.tracksets.length);
    const trackset = pvpEvent.tracksets[tracksetIdx];

    // 5. Build opponent pool
    const opponents = buildOpponentPool(pvpEvent, message.author.id, tracksetIdx);
    if (opponents.length === 0) {
        // Should be impossible if startpvp validation passed (every trackset has ≥1 ghost)
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, no opponents available.",
            desc: "No real player snapshots and no ghost decks for this trackset. Tell an admin to add ghost decks.",
            author: message.author
        }).sendMessage({ currentMessage });
    }

    // 6. Show opponent picker
    const opponentSelection = await pickOpponent(message, pvpEvent, trackset, tracksetIdx, opponents, currentMessage);
    if (!opponentSelection) return; // cancelled / timed out — no ticket spent
    const { chosenOpponent, currentMessage: cm2 } = opponentSelection;

    // 7. Pick a saved deck — either by name (power-user shortcut) or via dropdown of qualifying decks
    const deckCrCap = pvpEvent.deckCrCap || 0;
    let playerDeck;
    if (savedDeckName) {
        playerDeck = await loadSavedDeck(message, playerData, savedDeckName, pvpEvent.reqs, deckCrCap, cm2);
        if (!playerDeck) return; // error already shown
    }
    else {
        playerDeck = await pickQualifyingDeck(message, playerData, pvpEvent, deckCrCap, cm2);
        if (!playerDeck) return; // no qualifying / cancelled / timed out
    }

    // 8. Slot assignment review (swap + confirm) — pass everything so the embed
    // can show opponent + trackset alongside the player's deck.
    const finalDeck = await reviewAndConfirm(message, playerDeck, pvpEvent.name, deckCrCap, chosenOpponent, trackset, tracksetIdx, pvpEvent.tracksets.length);
    if (!finalDeck) return; // cancelled — no ticket spent

    // 9. Spend ticket atomically — write the post-regen entry as a whole, but
    // protect against concurrent ticket spends by requiring tickets >= 1 in the filter.
    // (Bot.execList already prevents the SAME user from running two pvpplay calls at once,
    // but cd-pvpadmin grant from owner runs as a different user with no lock collision.)
    spendTicket(entry);
    const postSpendEntry = JSON.parse(JSON.stringify(entry));
    const spendResult = await pvpEventModel.findOneAndUpdate(
        {
            pvpEventID: pvpEvent.pvpEventID,
            // Either the player has no entry yet (first match) OR they have ≥1 ticket
            $or: [
                { [`entries.${message.author.id}`]: { $exists: false } },
                { [`entries.${message.author.id}.tickets`]: { $gte: 1 } }
            ]
        },
        { "$set": { [`entries.${message.author.id}`]: postSpendEntry } }
    );
    if (!spendResult) {
        return new ErrorMessage({
            channel: message.channel,
            title: "Error, ticket spend failed.",
            desc: "Something raced ahead of you on this event. Try again in a moment.",
            author: message.author
        }).sendMessage();
    }

    // 10. Run the 5 races. If any race throws (image timeout, network glitch),
    // refund the ticket so the player isn't out a play for nothing.
    // NOTE: createCar() returns [carModule, carSpecs] — destructure to get just the data.
    // PvP races run with BOTH `disablegraphics: true` (skip canvas/image work, ~3-5s saved
    // per race) AND `silentResult: true` (skip the per-race result message). The summary
    // embed at the end has all the info anyway.
    const unitPref = playerData.settings?.unitpreference;
    const playerCars = finalDeck.map(d => createCar(d, unitPref, true)[0]);
    const opponentCars = chosenOpponent.deck.map((carID, i) => createCar({ carID, upgrade: chosenOpponent.upgrades[i] }, unitPref, true)[0]);
    const trackObjs = trackset.map(tid => getTrack(tid));

    const raceResults = []; // [{ raceNum, raw, floored, trackName }]
    let matchScore = 0;

    try {
        for (let i = 0; i < SLOT_COUNT; i++) {
            const raw = await race(message, playerCars[i], opponentCars[i], trackObjs[i], /*disablegraphics*/ true, /*silentResult*/ true);
            const floored = applyPerRaceFloor(raw);
            matchScore += floored;
            raceResults.push({ raceNum: i + 1, raw, floored, trackName: trackObjs[i].trackName });
        }
    } catch (err) {
        // Refund the ticket — atomic increment so we don't clobber concurrent updates
        try {
            await pvpEventModel.updateOne(
                { pvpEventID: pvpEvent.pvpEventID },
                { "$inc": { [`entries.${message.author.id}.tickets`]: 1 } }
            );
        } catch (refundErr) {
            console.error(`[PvP] Ticket refund failed for ${message.author.id}: ${refundErr.message}`);
        }
        await new ErrorMessage({
            channel: message.channel,
            title: "Error, race failed mid-match.",
            desc: "Your ticket has been refunded. Try again — if it keeps happening, ping an admin.",
            author: message.author
        }).sendMessage();
        throw err;
    }

    // 11. Compute leaderboard delta with rank-distance multiplier
    const leaderboardBefore = buildLeaderboard(pvpEvent.entries);
    const playerRow = leaderboardBefore.find(r => r.userID === message.author.id);
    const playerRank = playerRow ? playerRow.rank : (leaderboardBefore.length + 1);
    let opponentRank = leaderboardBefore.length + 1; // default for ghost / unranked
    if (chosenOpponent.type === "real") {
        const opponentRow = leaderboardBefore.find(r => r.userID === chosenOpponent.userID);
        opponentRank = opponentRow ? opponentRow.rank : opponentRank;
    }

    const delta = computeLeaderboardDelta(matchScore, playerRank, opponentRank);

    // 12. Update player entry
    if (matchScore > 0) entry.wins += 1;
    else if (matchScore < 0) entry.losses += 1;
    else entry.draws += 1;

    if (matchScore !== 0) {
        entry.score = (entry.score || 0) + delta;
    }

    entry.matchesPlayed = (entry.matchesPlayed || 0) + 1;
    entry.lastMatchEnd = DateTime.now().toISO();
    entry.snapshots = entry.snapshots || {};
    entry.snapshots[String(tracksetIdx)] = {
        deck: finalDeck.map(d => d.carID),
        upgrades: finalDeck.map(d => d.upgrade),
        updatedAt: DateTime.now().toISO()
    };

    // 13. Persist player entry (full $set) + opponent score (atomic $inc).
    // Using $inc on the opponent's score field is critical: if the opponent is
    // simultaneously playing their own match, $set on their full entry would
    // clobber their concurrent updates. $inc only touches the score field atomically.
    const setUpdates = { [`entries.${message.author.id}`]: entry };
    const incUpdates = {};
    if (chosenOpponent.type === "real" && matchScore !== 0 && pvpEvent.entries[chosenOpponent.userID]) {
        incUpdates[`entries.${chosenOpponent.userID}.score`] = -delta;
    }

    const updateOps = { "$set": setUpdates };
    if (Object.keys(incUpdates).length > 0) updateOps["$inc"] = incUpdates;

    await pvpEventModel.updateOne({ pvpEventID: pvpEvent.pvpEventID }, updateOps);

    // 14. Re-fetch fresh leaderboard to compute the player's NEW rank.
    // This is one extra DB read but cheap, and the rank is the most asked-for
    // post-match info ("did I climb?"). Falls back gracefully if the read fails.
    let rankInfo = { newRank: null, oldRank: playerRank, totalParticipants: leaderboardBefore.length };
    try {
        const freshEvent = await pvpEventModel.findOne({ pvpEventID: pvpEvent.pvpEventID }).lean();
        if (freshEvent) {
            const newLb = buildLeaderboard(freshEvent.entries);
            const newRow = newLb.find(r => r.userID === message.author.id);
            rankInfo = {
                newRank: newRow ? newRow.rank : null,
                oldRank: playerRank,
                totalParticipants: newLb.length
            };
        }
    } catch (err) {
        console.error(`[PvP] Failed to fetch post-match leaderboard: ${err.message}`);
    }

    // 15. Show match summary
    await showMatchSummary(message, pvpEvent, chosenOpponent, raceResults, matchScore, delta, entry, rankInfo);
}

// ============================================================================
// Opponent pool
// ============================================================================

/**
 * Build the displayable opponent pool for a match.
 * Rules (per spec):
 *   - Try to show 3 opponents (closest by rank distance to the player)
 *   - Player rank #1: show 2 closest below them (no need for ghost)
 *   - Player last: show 2 closest above + 1 ghost
 *   - Fewer than enough real opponents: fill remaining slots with random ghosts
 *   - Always at least 1 ghost shown if there are zero real opponents matching this trackset
 */
function buildOpponentPool(pvpEvent, viewerID, tracksetIdx) {
    const tsKey = String(tracksetIdx);
    const ghostList = (pvpEvent.ghostDecks?.[tsKey] || []);

    // Real candidates: every other player who has a snapshot for THIS trackset
    const allEntries = pvpEvent.entries || {};
    const leaderboard = buildLeaderboard(allEntries);
    const realCandidates = [];
    for (const row of leaderboard) {
        if (row.userID === viewerID) continue;
        const e = allEntries[row.userID];
        const snap = e?.snapshots?.[tsKey];
        if (!snap || !Array.isArray(snap.deck) || snap.deck.length !== 5) continue;
        realCandidates.push({
            type: "real",
            userID: row.userID,
            rank: row.rank,
            score: row.score,
            deck: snap.deck,
            upgrades: snap.upgrades
        });
    }

    // Determine viewer's rank for "closest" calculation
    const viewerRow = leaderboard.find(r => r.userID === viewerID);
    const viewerRank = viewerRow ? viewerRow.rank : (leaderboard.length + 1);

    // Sort real candidates by abs distance from viewer's rank (closest first)
    realCandidates.sort((a, b) => Math.abs(a.rank - viewerRank) - Math.abs(b.rank - viewerRank));

    // Special case: player rank #1 → only show 2 below
    // Special case: player at last → 2 above + 1 ghost
    let needed = 3;
    let realToTake = Math.min(needed, realCandidates.length);

    // If viewer is rank #1 with at least 2 real opponents, just take 2 (no ghost)
    if (viewerRank === 1 && realCandidates.length >= 2) {
        realToTake = 2;
        needed = 2;
    }
    // If viewer is at last position, force a ghost (only 2 reals + 1 ghost)
    else if (viewerRank === leaderboard.length && realCandidates.length >= 2 && ghostList.length > 0) {
        realToTake = 2;
        needed = 3;
    }

    const reals = realCandidates.slice(0, realToTake);

    // Fill remaining slots with random ghosts
    const ghostsTaken = [];
    if (reals.length < needed && ghostList.length > 0) {
        const shuffled = [...ghostList].sort(() => Math.random() - 0.5);
        for (let i = 0; i < shuffled.length && reals.length + ghostsTaken.length < needed; i++) {
            ghostsTaken.push({
                type: "ghost",
                name: shuffled[i].name || `Ghost ${i + 1}`,
                deck: shuffled[i].deck,
                upgrades: shuffled[i].upgrades
            });
        }
    }

    return [...reals, ...ghostsTaken];
}

// ============================================================================
// Opponent picker UI
// ============================================================================

async function pickOpponent(message, pvpEvent, trackset, tracksetIdx, opponents, currentMessage) {
    // Build trackset preview
    const trackPreview = trackset.map((tid, i) => `${i + 1}. ${getTrack(tid)?.trackName || tid}`).join("\n");

    // Build the select menu
    const selectOptions = opponents.map((opp, i) => {
        let label, desc;
        if (opp.type === "real") {
            label = `#${opp.rank} • ${truncate(opp.userID, 80)}`; // userID — username fetched below
            desc = `Score: ${opp.score} pts`;
        }
        else {
            label = `👻 ${truncate(opp.name, 80)}`;
            desc = `Ghost deck`;
        }
        return { label, description: desc, value: String(i) };
    });

    // Try to resolve usernames for real opponents
    for (let i = 0; i < opponents.length; i++) {
        if (opponents[i].type !== "real") continue;
        try {
            const u = await message.client.users.fetch(opponents[i].userID);
            if (u?.username) selectOptions[i].label = `#${opponents[i].rank} • ${truncate(u.username, 80)}`;
        } catch {}
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId("pvp_opponent_pick")
        .setPlaceholder("Choose an opponent…")
        .addOptions(...selectOptions);
    const cancelBtn = new ButtonBuilder()
        .setCustomId("pvp_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger);

    const trackSummary = `**Trackset ${tracksetIdx + 1} (${pvpEvent.tracksets.length} possible)**\n${trackPreview}`;
    const oppSummary = opponents.map((opp, i) => {
        const name = opp.type === "real" ? selectOptions[i].label.replace(/^#\d+ • /, "") : `👻 ${opp.name}`;
        const cars = opp.deck.map((cid, j) => carNameGen({ currentCar: getCar(cid), rarity: true, upgrade: opp.upgrades[j] })).join("\n");
        return `**${name}**\n${cars}`;
    }).join("\n\n");

    const teaser = new InfoMessage({
        channel: message.channel,
        title: `${pvpEvent.name} — Pick your opponent`,
        desc: `${trackSummary}\n\n${oppSummary}`,
        author: message.author,
        footer: `${defaultChoiceTime / 1000} seconds to choose. Picking nothing won't spend a ticket.`
    });

    const sentMessage = await teaser.sendMessage({
        currentMessage,
        buttons: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(cancelBtn)],
        preserve: true
    });

    return new Promise((resolve) => {
        const collector = sentMessage.message.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: defaultChoiceTime
        });
        collector.on("collect", async (interaction) => {
            try {
                await interaction.deferUpdate();
                if (interaction.customId === "pvp_cancel") {
                    collector.stop("cancelled");
                    return;
                }
                if (interaction.customId === "pvp_opponent_pick") {
                    const idx = parseInt(interaction.values[0], 10);
                    collector.stop("picked");
                    resolve({ chosenOpponent: opponents[idx], currentMessage: sentMessage });
                }
            } catch (err) { console.error("opponent pick error:", err.message); }
        });
        collector.on("end", async (_, reason) => {
            if (reason === "picked") return;
            try { await sentMessage.removeButtons(); } catch {}
            if (reason !== "cancelled") {
                // timed out
                await new InfoMessage({
                    channel: message.channel,
                    title: "Timed out — no opponent chosen.",
                    desc: "Your ticket was not spent.",
                    author: message.author
                }).sendMessage();
            }
            else {
                await new InfoMessage({
                    channel: message.channel,
                    title: "Match cancelled.",
                    desc: "Your ticket was not spent.",
                    author: message.author
                }).sendMessage();
            }
            resolve(null);
        });
    });
}

// ============================================================================
// Saved deck loader
// ============================================================================

async function loadSavedDeck(message, playerData, deckName, reqs, deckCrCap, currentMessage) {
    const lc = deckName.toLowerCase();
    const deck = (playerData.decks || []).find(d => d.name.toLowerCase() === lc);
    if (!deck) {
        await new ErrorMessage({
            channel: message.channel,
            title: "Error, deck not found.",
            desc: `You have no saved deck named "${deckName}". Use \`cd-deck list\` to see your decks.`,
            author: message.author
        }).sendMessage({ currentMessage });
        return null;
    }
    if (!Array.isArray(deck.hand) || deck.hand.length !== SLOT_COUNT || deck.hand.some(s => !s)) {
        await new ErrorMessage({
            channel: message.channel,
            title: "Error, saved deck is incomplete.",
            desc: `"${deck.name}" doesn't have all 5 slots filled. Run \`cd-deck show ${deck.name}\` to see what's missing.`,
            author: message.author
        }).sendMessage({ currentMessage });
        return null;
    }

    // Validate each car still owned + meets reqs.
    // Ownership is checked CUMULATIVELY — if a deck has 2 slots of the same (carID,tune),
    // the player must own ≥2 of that combo. Otherwise a deck saved when the player had
    // multiple copies could still be played after they sold down to one.
    const deckUsage = new Map(); // key: "carID|tune" → count of slots using it
    for (const s of deck.hand) {
        const key = `${s.carID}|${s.upgrade}`;
        deckUsage.set(key, (deckUsage.get(key) || 0) + 1);
    }
    let totalCR = 0;
    for (let i = 0; i < SLOT_COUNT; i++) {
        const slot = deck.hand[i];
        const garageCar = playerData.garage.find(g => g.carID === slot.carID);
        const owned = garageCar?.upgrades?.[slot.upgrade] || 0;
        const needed = deckUsage.get(`${slot.carID}|${slot.upgrade}`) || 1;
        if (owned < needed) {
            const car = getCar(slot.carID);
            const carName = car ? carNameGen({ currentCar: car, rarity: true, upgrade: slot.upgrade }) : `${slot.carID} (tune ${slot.upgrade})`;
            await new ErrorMessage({
                channel: message.channel,
                title: `Error, not enough copies for slot ${i + 1}.`,
                desc: `"${deck.name}" uses **${needed}× ${carName}** but you only own **${owned}×**. Edit the deck with \`cd-deck setslot\` to swap that slot out.`,
                author: message.author
            }).sendMessage({ currentMessage });
            return null;
        }
        if (Object.keys(reqs || {}).length > 0) {
            if (!filterCheck({ car: { carID: slot.carID, upgrade: slot.upgrade }, filter: reqs, applyOrLogic: false })) {
                const car = getCar(slot.carID);
                await new ErrorMessage({
                    channel: message.channel,
                    title: `Error, slot ${i + 1} doesn't meet event reqs.`,
                    desc: `**${carNameGen({ currentCar: car, rarity: true, upgrade: slot.upgrade })}** doesn't meet this event's requirements.`,
                    author: message.author
                }).sendMessage({ currentMessage });
                return null;
            }
        }
        totalCR += getCar(slot.carID)?.cr || 0;
    }

    // Validate deck CR cap if set
    if (deckCrCap > 0 && totalCR > deckCrCap) {
        await new ErrorMessage({
            channel: message.channel,
            title: "Error, deck exceeds CR cap.",
            desc: `"${deck.name}" totals **${totalCR} CR** but this event caps decks at **${deckCrCap} CR**. Edit the deck with \`cd-deck setslot\` to swap in lower-CR cars.`,
            author: message.author
        }).sendMessage({ currentMessage });
        return null;
    }

    return deck.hand.map(s => ({ carID: s.carID, upgrade: s.upgrade }));
}

// ============================================================================
// Saved-deck picker — filters to decks that qualify for this event,
// auto-skips if only one qualifies, otherwise shows a dropdown.
// ============================================================================

/**
 * Validate a saved deck against an event's reqs + CR cap + ownership.
 * Returns { ok, issues: string[], totalCR } — `ok` is true iff all checks pass.
 */
function evaluateDeckForEvent(deck, event, garage) {
    const issues = [];
    const cap = event.deckCrCap || 0;
    const reqs = event.reqs || {};
    let totalCR = 0;

    if (!Array.isArray(deck.hand) || deck.hand.length !== SLOT_COUNT) {
        return { ok: false, issues: [`Wrong slot count`], totalCR: 0 };
    }

    // Pre-count how many slots use each unique (carID, tune) combo, so we can do
    // CUMULATIVE ownership checks instead of per-slot. Otherwise a deck with 3×
    // CERV III at 996 would qualify even if the player only owns 1.
    const deckUsage = new Map();
    for (const s of deck.hand) {
        if (!s) continue;
        const key = `${s.carID}|${s.upgrade}`;
        deckUsage.set(key, (deckUsage.get(key) || 0) + 1);
    }
    const flaggedKeys = new Set(); // dedupe — only flag each (carID,tune) once

    for (let i = 0; i < SLOT_COUNT; i++) {
        const slot = deck.hand[i];
        if (!slot) { issues.push(`Slot ${i + 1} empty`); continue; }

        // Cumulative ownership: total copies needed across the deck for this combo
        const key = `${slot.carID}|${slot.upgrade}`;
        const needed = deckUsage.get(key) || 1;
        const garageCar = garage.find(g => g.carID === slot.carID);
        const owned = garageCar?.upgrades?.[slot.upgrade] || 0;
        if (owned < needed) {
            if (!flaggedKeys.has(key)) {
                flaggedKeys.add(key);
                const car = getCar(slot.carID);
                const carLabel = car?.model || slot.carID;
                issues.push(`Need ${needed}× ${carLabel} (tune ${slot.upgrade}) — only own ${owned}`);
            }
            continue;
        }

        const car = getCar(slot.carID);
        if (!car) { issues.push(`Slot ${i + 1}: car ${slot.carID} not found`); continue; }
        totalCR += car.cr || 0;

        if (Object.keys(reqs).length > 0) {
            if (!filterCheck({ car: { carID: slot.carID, upgrade: slot.upgrade }, filter: reqs, applyOrLogic: false })) {
                issues.push(`Slot ${i + 1} (${car.model}) doesn't meet reqs`);
            }
        }
    }
    if (cap > 0 && totalCR > cap) {
        issues.push(`Total CR ${totalCR} > cap ${cap}`);
    }
    return { ok: issues.length === 0, issues, totalCR };
}

async function pickQualifyingDeck(message, playerData, pvpEvent, deckCrCap, currentMessage) {
    const allDecks = Array.isArray(playerData.decks) ? playerData.decks : [];

    // ── 0. Player has no decks at all ────────────────────────────────────
    if (allDecks.length === 0) {
        await new ErrorMessage({
            channel: message.channel,
            title: "Error, no saved decks.",
            desc: `You need a saved deck to play PvP.\n\nQuick start (locks a new deck to this event so it'll always qualify):\n\`\`\`\ncd-deck create MyDeck | ${pvpEvent.name}\ncd-deck setslot MyDeck 1 <car name>\ncd-deck setslot MyDeck 2 <car name>\ncd-deck setslot MyDeck 3 <car name>\ncd-deck setslot MyDeck 4 <car name>\ncd-deck setslot MyDeck 5 <car name>\n\`\`\``,
            author: message.author
        }).sendMessage({ currentMessage });
        return null;
    }

    // ── 1. Evaluate each deck against this event ─────────────────────────
    const qualifying = [];
    const rejected = [];
    for (const deck of allDecks) {
        const verdict = evaluateDeckForEvent(deck, pvpEvent, playerData.garage);
        if (verdict.ok) qualifying.push({ deck, totalCR: verdict.totalCR });
        else rejected.push({ deck, issues: verdict.issues });
    }

    // ── 2. None qualify — explain why ────────────────────────────────────
    if (qualifying.length === 0) {
        const sample = rejected.slice(0, 3)
            .map(r => `**${r.deck.name}** — ${r.issues.slice(0, 2).join("; ")}`)
            .join("\n");
        const reqsLine = (pvpEvent.reqs && Object.keys(pvpEvent.reqs).length > 0)
            ? `**Reqs:** ${reqDisplay(pvpEvent.reqs) || "(invalid)"}`
            : "**Reqs:** _none_";
        const capLine = pvpEvent.deckCrCap > 0 ? `\n**Deck CR cap:** ${pvpEvent.deckCrCap}` : "";
        await new ErrorMessage({
            channel: message.channel,
            title: "Error, none of your decks qualify for this event.",
            desc: `${reqsLine}${capLine}\n\n**Issues with your decks:**\n${sample}${rejected.length > 3 ? `\n_(+${rejected.length - 3} more)_` : ""}\n\nFix one or build a new deck locked to this event:\n\`cd-deck create <name> | ${pvpEvent.name}\``,
            author: message.author
        }).sendMessage({ currentMessage });
        return null;
    }

    // ── 3. Exactly one qualifies — auto-use, no dropdown ─────────────────
    if (qualifying.length === 1) {
        await new InfoMessage({
            channel: message.channel,
            title: `Using deck "${qualifying[0].deck.name}"`,
            desc: `_(Only one of your decks qualifies for **${pvpEvent.name}**.)_`,
            author: message.author
        }).sendMessage({ currentMessage });
        return qualifying[0].deck.hand.map(s => ({ carID: s.carID, upgrade: s.upgrade }));
    }

    // ── 4. Multiple qualify — show dropdown ──────────────────────────────
    // Discord caps select-menu options at 25
    const shown = qualifying.slice(0, 25);
    const options = shown.map(({ deck, totalCR }) => {
        const capStr = deckCrCap > 0 ? `${totalCR}/${deckCrCap}` : `${totalCR}`;
        return {
            label: deck.name.slice(0, 100),
            description: `CR: ${capStr}`.slice(0, 100),
            value: deck.name
        };
    });
    const menu = new StringSelectMenuBuilder()
        .setCustomId("pvp_deck_pick")
        .setPlaceholder("Choose a deck for this match…")
        .addOptions(...options);
    const cancelBtn = new ButtonBuilder().setCustomId("pvp_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger);

    const teaser = new InfoMessage({
        channel: message.channel,
        title: `Pick a deck for ${pvpEvent.name}`,
        desc: `**${qualifying.length}** of your saved decks qualify${qualifying.length > 25 ? " _(showing first 25)_" : ""}.`,
        author: message.author,
        footer: `${defaultChoiceTime / 1000}s to choose. Cancelling won't spend a ticket.`
    });

    const sentMessage = await teaser.sendMessage({
        currentMessage,
        buttons: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(cancelBtn)],
        preserve: true
    });

    return new Promise((resolve) => {
        const collector = sentMessage.message.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: defaultChoiceTime
        });
        collector.on("collect", async (interaction) => {
            try {
                await interaction.deferUpdate();
                if (interaction.customId === "pvp_cancel") {
                    collector.stop("cancelled");
                    return;
                }
                if (interaction.customId === "pvp_deck_pick") {
                    const picked = qualifying.find(q => q.deck.name === interaction.values[0]);
                    if (!picked) { collector.stop("invalid"); return; }
                    collector.stop("picked");
                    resolve(picked.deck.hand.map(s => ({ carID: s.carID, upgrade: s.upgrade })));
                }
            } catch (err) { console.error("deck pick error:", err.message); }
        });
        collector.on("end", async (_, reason) => {
            if (reason === "picked") return;
            try { await sentMessage.removeButtons(); } catch {}
            await new InfoMessage({
                channel: message.channel,
                title: reason === "cancelled" ? "Match cancelled." : "Timed out — no deck chosen.",
                desc: "Your ticket was not spent.",
                author: message.author
            }).sendMessage();
            resolve(null);
        });
    });
}

// ============================================================================
// Slot assignment review (swap + confirm)
// ============================================================================

async function reviewAndConfirm(message, deck, eventName, deckCrCap, chosenOpponent, trackset, tracksetIdx, totalTracksets) {
    // Build the 10 swap pair options (1↔2, 1↔3, ..., 4↔5)
    const swapOptions = [];
    for (let a = 1; a < SLOT_COUNT; a++) {
        for (let b = a + 1; b <= SLOT_COUNT; b++) {
            swapOptions.push({ label: `Swap slots ${a} ↔ ${b}`, value: `${a},${b}` });
        }
    }
    const swapMenu = new StringSelectMenuBuilder()
        .setCustomId("pvp_swap")
        .setPlaceholder("Swap two slots…")
        .addOptions(...swapOptions);
    const confirmBtn = new ButtonBuilder().setCustomId("pvp_confirm").setLabel("Confirm").setStyle(ButtonStyle.Success);
    const cancelBtn = new ButtonBuilder().setCustomId("pvp_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger);

    // Resolve opponent display name (real player username or ghost name)
    let opponentLabel;
    if (chosenOpponent.type === "real") {
        try {
            const u = await message.client.users.fetch(chosenOpponent.userID);
            opponentLabel = `<@${chosenOpponent.userID}> (${u.username}) — Rank #${chosenOpponent.rank}, ${chosenOpponent.score} pts`;
        } catch {
            opponentLabel = `<@${chosenOpponent.userID}> — Rank #${chosenOpponent.rank}, ${chosenOpponent.score} pts`;
        }
    }
    else {
        opponentLabel = `👻 **${chosenOpponent.name}** _(ghost deck)_`;
    }

    // Build per-slot pairing line: "Slot N: YourCar  vs  TheirCar  @ TrackName"
    function describePairings(d) {
        const lines = [];
        for (let i = 0; i < SLOT_COUNT; i++) {
            const yourCar = carNameGen({ currentCar: getCar(d[i].carID), rarity: true, upgrade: d[i].upgrade });
            const theirCar = carNameGen({ currentCar: getCar(chosenOpponent.deck[i]), rarity: true, upgrade: chosenOpponent.upgrades[i] });
            const track = getTrack(trackset[i])?.trackName || trackset[i];
            lines.push(`**Race ${i + 1}** _(${track})_\n  ${yourCar}\n  vs ${theirCar}`);
        }
        const totalCR = d.reduce((sum, slot) => sum + (getCar(slot.carID)?.cr || 0), 0);
        const oppCR = chosenOpponent.deck.reduce((sum, cid) => sum + (getCar(cid)?.cr || 0), 0);
        const yourCRLine = deckCrCap > 0
            ? `💎 **Your Deck CR: ${totalCR}/${deckCrCap}**`
            : `💎 **Your Deck CR: ${totalCR}**`;
        const oppCRLine = `💎 **Opponent Deck CR: ${oppCR}**`;
        return lines.join("\n\n") + `\n\n${yourCRLine}\n${oppCRLine}`;
    }

    const reviewEmbed = new InfoMessage({
        channel: message.channel,
        title: `${eventName} — Match Review`,
        desc: `**Opponent:** ${opponentLabel}\n**Trackset:** ${tracksetIdx + 1} of ${totalTracksets}\n​\n${describePairings(deck)}`,
        author: message.author,
        footer: "Swap any pair to change which of YOUR cars races each slot. Confirm to start."
    });

    const sent = await reviewEmbed.sendMessage({
        buttons: [new ActionRowBuilder().addComponents(swapMenu), new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)],
        preserve: true
    });

    return new Promise((resolve) => {
        const collector = sent.message.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: defaultChoiceTime
        });
        collector.on("collect", async (interaction) => {
            try {
                await interaction.deferUpdate();
                if (interaction.customId === "pvp_confirm") {
                    collector.stop("confirmed");
                }
                else if (interaction.customId === "pvp_cancel") {
                    collector.stop("cancelled");
                }
                else if (interaction.customId === "pvp_swap") {
                    const [aStr, bStr] = interaction.values[0].split(",");
                    const a = parseInt(aStr, 10) - 1;
                    const b = parseInt(bStr, 10) - 1;
                    [deck[a], deck[b]] = [deck[b], deck[a]];
                    sent.embed.description = `**Opponent:** ${opponentLabel}\n**Trackset:** ${tracksetIdx + 1} of ${totalTracksets}\n​\n${describePairings(deck)}`;
                    await sent.message.edit({ embeds: [sent.embed] });
                }
            } catch (err) { console.error("review error:", err.message); }
        });
        collector.on("end", async (_, reason) => {
            try { await sent.removeButtons(); } catch {}
            if (reason === "confirmed") return resolve(deck);
            await new InfoMessage({
                channel: message.channel,
                title: reason === "cancelled" ? "Match cancelled." : "Timed out — no confirmation received.",
                desc: "Your ticket was not spent.",
                author: message.author
            }).sendMessage();
            resolve(null);
        });
    });
}

// ============================================================================
// Match scoring
// ============================================================================

/** Snap individual race score to magnitude ≥ 10 (preserve sign). 0 stays 0. */
function applyPerRaceFloor(rawScore) {
    if (rawScore === 0) return 0;
    const sign = rawScore > 0 ? 1 : -1;
    const mag = Math.max(PER_RACE_MIN_MAGNITUDE, Math.abs(rawScore));
    return sign * mag;
}

/**
 * Leaderboard delta with rank-distance multiplier.
 *   - Wins vs higher-ranked opponent → bonus
 *   - Losses to higher-ranked opponent → reduced penalty
 *   - Wins vs lower-ranked opponent → reduced reward
 *   - Losses to lower-ranked opponent → bigger penalty
 *
 * Implementation: align rank distance with win/loss sign so the multiplier always
 * pushes "good outcomes" (beating better players, losing close to worse players)
 * in the favourable direction.
 */
function computeLeaderboardDelta(matchScore, playerRank, opponentRank) {
    if (matchScore === 0) return 0;
    const winSign = matchScore > 0 ? 1 : -1;
    const rawDistance = playerRank - opponentRank; // positive = opponent is higher-ranked (lower number = better rank)
    const signedDistance = winSign * rawDistance;
    const multiplier = Math.max(0.1, 1 + signedDistance * RANK_DISTANCE_MULTIPLIER);
    return Math.round(matchScore * multiplier);
}

// ============================================================================
// Match summary
// ============================================================================

async function showMatchSummary(message, pvpEvent, opponent, raceResults, matchScore, delta, entry, rankInfo) {
    const opponentLabel = opponent.type === "real" ? `<@${opponent.userID}>` : `👻 ${opponent.name}`;

    let outcome, color;
    if (matchScore > 0) { outcome = "🏁 **VICTORY**"; }
    else if (matchScore < 0) { outcome = "💥 **DEFEAT**"; }
    else { outcome = "🤝 **DRAW** (no leaderboard change)"; }

    let breakdown = "";
    for (const r of raceResults) {
        const sign = r.floored > 0 ? "+" : (r.floored < 0 ? "" : "±");
        const prefix = r.floored > 0 ? "🟢" : (r.floored < 0 ? "🔴" : "⚪");
        const flooredNote = (Math.abs(r.raw) < PER_RACE_MIN_MAGNITUDE && r.raw !== 0) ? ` _(raw ${r.raw}, floored to ${r.floored})_` : "";
        breakdown += `${prefix} **Race ${r.raceNum}** — ${r.trackName}: ${sign}${r.floored}${flooredNote}\n`;
    }

    // Build rank display: "#4 of 12" with arrow showing direction of change.
    // Lower rank number = better position, so #5 → #4 is an improvement (↑).
    let rankValue = "_unranked_";
    if (rankInfo && rankInfo.newRank !== null) {
        const total = rankInfo.totalParticipants;
        const newR = rankInfo.newRank;
        const oldR = rankInfo.oldRank;
        if (oldR === newR || oldR == null) {
            rankValue = `#${newR} of ${total}`;
        }
        else if (newR < oldR) {
            // climbed (e.g. #5 → #4)
            const climb = oldR - newR;
            rankValue = `#${newR} of ${total} _(↑${climb} from #${oldR})_`;
        }
        else {
            // fell (e.g. #3 → #5)
            const drop = newR - oldR;
            rankValue = `#${newR} of ${total} _(↓${drop} from #${oldR})_`;
        }
    }

    const fields = [
        { name: "Race-by-race", value: breakdown, inline: false },
        { name: "Match Score", value: `${matchScore > 0 ? "+" : ""}${matchScore}`, inline: true },
        { name: "Leaderboard Δ", value: `${delta > 0 ? "+" : ""}${delta}`, inline: true },
        { name: "New Score", value: String(entry.score || 0), inline: true },
        { name: "Rank", value: rankValue, inline: true },
        { name: "Record", value: `${entry.wins}W / ${entry.losses}L / ${entry.draws}D`, inline: true },
        { name: "Tickets Left", value: `${entry.tickets} / ${pvpEvent.ticketCap}`, inline: true },
        { name: "Cooldown", value: `${pvpEvent.matchCooldownSeconds}s`, inline: true }
    ];

    await new InfoMessage({
        channel: message.channel,
        title: `${pvpEvent.name} — ${outcome}`,
        desc: `**Opponent:** ${opponentLabel}`,
        author: message.author,
        fields
    }).sendMessage();
}

// ============================================================================
// Tiny helpers
// ============================================================================

function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
