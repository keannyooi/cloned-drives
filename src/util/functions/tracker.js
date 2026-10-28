"use strict";

const { DateTime } = require("luxon");
const trackingModel = require("../../models/trackingSchema.js");

// ============================================================================
// IN-MEMORY BUFFER - accumulated stats flushed to MongoDB periodically
// ============================================================================

function emptyBuffer() {
    return {
        commands: {},         // { commandName: count }
        activeUsers: new Set(),
        newPlayers: 0,
        economy: {
            moneyEarned: 0,
            moneySpent: 0,
            trophiesEarned: 0,
            trophiesSpent: 0,
            fuseTokensEarned: 0,
            fuseTokensSpent: 0
        },
        packsOpened: {},      // { packName: count }
        carsSold: 0,
        carsBought: { dealership: 0, blackmarket: 0 },
        eventsPlayed: 0,
        championshipsPlayed: 0,
        pvp: { attacks: 0, wins: 0, losses: 0, draws: 0 },
        codesRedeemed: 0,
        offersBought: 0,
        hiloGames: 0,
        exchanges: 0,
        voucherRedemptions: 0,
        commandErrors: 0,
        hourlyActivity: {}   // { "14": count }
    };
}

// The track* functions read buffer.<field> on every call, so flush() can swap
// each field for a fresh one and keep the old values as the batch it writes.
const buffer = emptyBuffer();

// Adds a batch that failed to write back into the live buffer, so the next
// flush sends it along with whatever was tracked since.
function mergeBack(batch) {
    for (const [key, value] of Object.entries(batch)) {
        if (value instanceof Set) {
            for (const item of value) buffer[key].add(item);
        }
        else if (typeof value === "number") {
            buffer[key] += value;
        }
        else {
            for (const [subKey, count] of Object.entries(value)) {
                buffer[key][subKey] = (buffer[key][subKey] || 0) + count;
            }
        }
    }
}

// ============================================================================
// PUBLIC TRACKING FUNCTIONS - call these from commands / index.js
// ============================================================================

/**
 * Track a command execution. Called from processCommand() in index.js.
 */
function trackCommand(commandName, userID) {
    buffer.commands[commandName] = (buffer.commands[commandName] || 0) + 1;
    buffer.activeUsers.add(userID);

    const hour = DateTime.now().hour.toString();
    buffer.hourlyActivity[hour] = (buffer.hourlyActivity[hour] || 0) + 1;
}

/**
 * Track money earned by a player (daily rewards, selling, event rewards, etc.)
 */
function trackMoneyEarned(amount) {
    if (amount > 0) buffer.economy.moneyEarned += amount;
}

/**
 * Track money spent by a player (packs, buycar, offers, pvp entry, etc.)
 */
function trackMoneySpent(amount) {
    if (amount > 0) buffer.economy.moneySpent += amount;
}

/**
 * Track trophies earned
 */
function trackTrophiesEarned(amount) {
    if (amount > 0) buffer.economy.trophiesEarned += amount;
}

/**
 * Track trophies spent
 */
function trackTrophiesSpent(amount) {
    if (amount > 0) buffer.economy.trophiesSpent += amount;
}

/**
 * Track fuse tokens earned
 */
function trackFuseTokensEarned(amount) {
    if (amount > 0) buffer.economy.fuseTokensEarned += amount;
}

/**
 * Track a pack opening
 */
function trackPackOpened(packName) {
    buffer.packsOpened[packName] = (buffer.packsOpened[packName] || 0) + 1;
}

/**
 * Track car(s) sold
 */
function trackCarsSold(count = 1) {
    buffer.carsSold += count;
}

/**
 * Track car(s) bought from dealership or black market
 */
function trackCarsBought(mode, count = 1) {
    if (mode === "bm") {
        buffer.carsBought.blackmarket += count;
    } else {
        buffer.carsBought.dealership += count;
    }
}

/**
 * Track an event round played (won)
 */
function trackEventPlayed() {
    buffer.eventsPlayed++;
}

/**
 * Track a championship round played (won)
 */
function trackChampionshipPlayed() {
    buffer.championshipsPlayed++;
}

/**
 * Track a PvP attack result
 */
function trackPvPAttack(result) {
    buffer.pvp.attacks++;
    if (result === "win") buffer.pvp.wins++;
    else if (result === "loss") buffer.pvp.losses++;
    else if (result === "draw") buffer.pvp.draws++;
}

/**
 * Track a code redemption
 */
function trackCodeRedeemed() {
    buffer.codesRedeemed++;
}

/**
 * Track an offer purchase
 */
function trackOfferBought() {
    buffer.offersBought++;
}

/**
 * Track a Hi-Lo game played
 */
function trackHiloGame() {
    buffer.hiloGames++;
}

/**
 * Track an exchange completed
 */
function trackExchange() {
    buffer.exchanges++;
}

/**
 * Track a voucher redemption (cd-voucher)
 */
function trackVoucherRedeemed() {
    buffer.voucherRedemptions++;
}

/**
 * Track a new player creation
 */
function trackNewPlayer() {
    buffer.newPlayers++;
}

/**
 * Track a command error
 */
function trackError() {
    buffer.commandErrors++;
}

// ============================================================================
// FLUSH - takes the buffered stats as a batch and writes it to MongoDB
// ============================================================================

async function flush() {
    const today = DateTime.now().toFormat("yyyy-MM-dd");

    // Take the batch and reset the buffer before the write: stats tracked
    // while it is in flight land in the fresh buffer instead of being wiped.
    const batch = { ...buffer };
    Object.assign(buffer, emptyBuffer());

    // Build $inc operations from the batch
    const inc = {};
    const addToSet = {};

    // Commands
    for (const [cmd, count] of Object.entries(batch.commands)) {
        if (count > 0) inc[`commands.${cmd}`] = count;
    }

    // Economy
    for (const [key, value] of Object.entries(batch.economy)) {
        if (value > 0) inc[`economy.${key}`] = value;
    }

    // Packs
    for (const [pack, count] of Object.entries(batch.packsOpened)) {
        if (count > 0) inc[`packsOpened.${pack}`] = count;
    }

    // Hourly activity
    for (const [hour, count] of Object.entries(batch.hourlyActivity)) {
        if (count > 0) inc[`hourlyActivity.${hour}`] = count;
    }

    // Simple counters
    if (batch.carsSold > 0) inc.carsSold = batch.carsSold;
    if (batch.carsBought.dealership > 0) inc["carsBought.dealership"] = batch.carsBought.dealership;
    if (batch.carsBought.blackmarket > 0) inc["carsBought.blackmarket"] = batch.carsBought.blackmarket;
    if (batch.eventsPlayed > 0) inc.eventsPlayed = batch.eventsPlayed;
    if (batch.championshipsPlayed > 0) inc.championshipsPlayed = batch.championshipsPlayed;
    if (batch.pvp.attacks > 0) inc["pvp.attacks"] = batch.pvp.attacks;
    if (batch.pvp.wins > 0) inc["pvp.wins"] = batch.pvp.wins;
    if (batch.pvp.losses > 0) inc["pvp.losses"] = batch.pvp.losses;
    if (batch.pvp.draws > 0) inc["pvp.draws"] = batch.pvp.draws;
    if (batch.codesRedeemed > 0) inc.codesRedeemed = batch.codesRedeemed;
    if (batch.offersBought > 0) inc.offersBought = batch.offersBought;
    if (batch.hiloGames > 0) inc.hiloGames = batch.hiloGames;
    if (batch.exchanges > 0) inc.exchanges = batch.exchanges;
    if (batch.voucherRedemptions > 0) inc.voucherRedemptions = batch.voucherRedemptions;
    if (batch.newPlayers > 0) inc.newPlayers = batch.newPlayers;
    if (batch.commandErrors > 0) inc.commandErrors = batch.commandErrors;

    // Active users go into $addToSet to avoid duplicates across flushes
    const activeUsersArray = [...batch.activeUsers];

    // Only write if there's something to write
    if (Object.keys(inc).length === 0 && activeUsersArray.length === 0) {
        return;
    }

    const update = {};
    if (Object.keys(inc).length > 0) update.$inc = inc;
    if (activeUsersArray.length > 0) update.$addToSet = { activeUsers: { $each: activeUsersArray } };

    try {
        await trackingModel.updateOne(
            { date: today },
            update,
            { upsert: true }
        );
    } catch (error) {
        // Kept for the next flush. A write that timed out after the server
        // applied it is counted twice — acceptable for analytics.
        console.error("[Tracker] Flush failed, keeping the batch for the next flush:", error.message);
        mergeBack(batch);
    }
}

module.exports = {
    trackCommand,
    trackMoneyEarned,
    trackMoneySpent,
    trackTrophiesEarned,
    trackTrophiesSpent,
    trackFuseTokensEarned,
    trackPackOpened,
    trackCarsSold,
    trackCarsBought,
    trackEventPlayed,
    trackChampionshipPlayed,
    trackPvPAttack,
    trackCodeRedeemed,
    trackOfferBought,
    trackHiloGame,
    trackExchange,
    trackVoucherRedeemed,
    trackNewPlayer,
    trackError,
    flush
};
