"use strict";

const { DateTime } = require("luxon");
const trackingModel = require("../../models/trackingSchema.js");

// ============================================================================
// IN-MEMORY BUFFER - accumulated stats flushed to MongoDB periodically
// ============================================================================

const buffer = {
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
    commandErrors: 0,
    hourlyActivity: {}   // { "14": count }
};

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
// FLUSH - writes buffered stats to MongoDB, then resets the buffer
// ============================================================================

async function flush() {
    const today = DateTime.now().toFormat("yyyy-MM-dd");

    // Build $inc operations from buffer
    const inc = {};
    const addToSet = {};

    // Commands
    for (const [cmd, count] of Object.entries(buffer.commands)) {
        if (count > 0) inc[`commands.${cmd}`] = count;
    }

    // Economy
    for (const [key, value] of Object.entries(buffer.economy)) {
        if (value > 0) inc[`economy.${key}`] = value;
    }

    // Packs
    for (const [pack, count] of Object.entries(buffer.packsOpened)) {
        if (count > 0) inc[`packsOpened.${pack}`] = count;
    }

    // Hourly activity
    for (const [hour, count] of Object.entries(buffer.hourlyActivity)) {
        if (count > 0) inc[`hourlyActivity.${hour}`] = count;
    }

    // Simple counters
    if (buffer.carsSold > 0) inc.carsSold = buffer.carsSold;
    if (buffer.carsBought.dealership > 0) inc["carsBought.dealership"] = buffer.carsBought.dealership;
    if (buffer.carsBought.blackmarket > 0) inc["carsBought.blackmarket"] = buffer.carsBought.blackmarket;
    if (buffer.eventsPlayed > 0) inc.eventsPlayed = buffer.eventsPlayed;
    if (buffer.championshipsPlayed > 0) inc.championshipsPlayed = buffer.championshipsPlayed;
    if (buffer.pvp.attacks > 0) inc["pvp.attacks"] = buffer.pvp.attacks;
    if (buffer.pvp.wins > 0) inc["pvp.wins"] = buffer.pvp.wins;
    if (buffer.pvp.losses > 0) inc["pvp.losses"] = buffer.pvp.losses;
    if (buffer.pvp.draws > 0) inc["pvp.draws"] = buffer.pvp.draws;
    if (buffer.codesRedeemed > 0) inc.codesRedeemed = buffer.codesRedeemed;
    if (buffer.offersBought > 0) inc.offersBought = buffer.offersBought;
    if (buffer.hiloGames > 0) inc.hiloGames = buffer.hiloGames;
    if (buffer.exchanges > 0) inc.exchanges = buffer.exchanges;
    if (buffer.newPlayers > 0) inc.newPlayers = buffer.newPlayers;
    if (buffer.commandErrors > 0) inc.commandErrors = buffer.commandErrors;

    // Active users go into $addToSet to avoid duplicates across flushes
    const activeUsersArray = [...buffer.activeUsers];

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
        console.error("[Tracker] Flush failed:", error.message);
    }

    // Reset buffer
    buffer.commands = {};
    buffer.activeUsers.clear();
    buffer.newPlayers = 0;
    buffer.economy = { moneyEarned: 0, moneySpent: 0, trophiesEarned: 0, trophiesSpent: 0, fuseTokensEarned: 0, fuseTokensSpent: 0 };
    buffer.packsOpened = {};
    buffer.carsSold = 0;
    buffer.carsBought = { dealership: 0, blackmarket: 0 };
    buffer.eventsPlayed = 0;
    buffer.championshipsPlayed = 0;
    buffer.pvp = { attacks: 0, wins: 0, losses: 0, draws: 0 };
    buffer.codesRedeemed = 0;
    buffer.offersBought = 0;
    buffer.hiloGames = 0;
    buffer.exchanges = 0;
    buffer.commandErrors = 0;
    buffer.hourlyActivity = {};
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
    trackNewPlayer,
    trackError,
    flush
};
