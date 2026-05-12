"use strict";

/**
 * END PVP EVENT
 * =============
 * Wraps up a PvP event:
 *   1. Builds final leaderboard from event.entries
 *   2. Distributes rewards by tier (each player gets only highest tier they qualify for)
 *   3. Saves a snapshot to pvpEventResultModel
 *   4. Deletes the active pvpEvent document
 *   5. Posts an end message + archived thread to #current-events (if it was active)
 *
 * Reward distribution:
 *   - rewards array supports: { rank: N, ... } and { topPercent: N, ... }
 *   - Each player gets ONLY the single highest tier they qualify for (no stacking)
 *   - Rewards added to player's `unclaimedRewards` array (claimed via cd-rewards)
 */

const bot = require("../../config/config.js");
const { InfoMessage } = require("../classes/classes.js");
const { currentEventsChannelID } = require("../consts/consts.js");
const { getTrack } = require("./dataManager.js");
const profileModel = require("../../models/profileSchema.js");
const pvpEventModel = require("../../models/pvpEventSchema.js");
const pvpEventResultModel = require("../../models/pvpEventResultSchema.js");

/**
 * Build a sorted leaderboard array from the entries object.
 * Sort: score DESC, then matchesPlayed ASC (fewer matches = better tiebreaker), then userID ASC.
 */
function buildLeaderboard(entries) {
    const list = [];
    for (const [userID, entry] of Object.entries(entries || {})) {
        list.push({
            userID,
            score: entry.score || 0,
            matchesPlayed: entry.matchesPlayed || 0,
            wins: entry.wins || 0,
            losses: entry.losses || 0,
            draws: entry.draws || 0
        });
    }
    list.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
        return a.userID.localeCompare(b.userID);
    });
    list.forEach((p, i) => { p.finalRank = i + 1; });
    return list;
}

/**
 * Determine the highest reward tier a given player qualifies for.
 * Tiers come in three flavours:
 *   - { rank: N, ... }              → exact rank
 *   - { rankRange: [start, end] }    → ranks `start` through `end` inclusive
 *   - { topPercent: N, ... }         → top N% of all participants
 *
 * Each player gets only ONE tier (the most generous they qualify for).
 * `rewards` is checked in order — assumed sorted from best to worst.
 *
 * Returns the matched tier object (with the reward fields), or null if none matched.
 */
function findRewardTier(rewards, finalRank, totalParticipants) {
    if (!Array.isArray(rewards) || rewards.length === 0) return null;
    for (const tier of rewards) {
        if (typeof tier.rank === "number" && finalRank === tier.rank) return tier;
        if (Array.isArray(tier.rankRange) && tier.rankRange.length === 2) {
            const [start, end] = tier.rankRange;
            if (typeof start === "number" && typeof end === "number"
                && finalRank >= start && finalRank <= end) return tier;
        }
        if (typeof tier.topPercent === "number") {
            const cutoff = Math.max(1, Math.ceil((tier.topPercent / 100) * totalParticipants));
            if (finalRank <= cutoff) return tier;
        }
    }
    return null;
}

/**
 * Push a tier's rewards into a player's unclaimedRewards.
 *
 * Convention (matches playevent / playchampionship / playcalendar):
 *   ONE reward field per unclaimedRewards entry — the cd-rewards claim flow uses
 *   Object.keys(reward)[0] to determine the type, so multi-field objects break it.
 *   We split each tier into N entries (one per reward field).
 *
 * Returns { success, error?: string }.
 */
async function grantTierToPlayer(userID, tier, eventName, finalRank) {
    const origin = `PvP Event: ${eventName} (Rank #${finalRank})`;
    const stripped = stripTierMeta(tier);
    const entries = [];

    for (const [key, value] of Object.entries(stripped)) {
        switch (key) {
            case "money":
            case "fuseTokens":
            case "trophies":
                if (typeof value === "number" && value > 0) entries.push({ [key]: value, origin });
                break;
            case "car": {
                // Accept both string carID and {carID, upgrade}
                const carObj = typeof value === "string" ? { carID: value, upgrade: "000" } : value;
                if (carObj?.carID) {
                    entries.push({
                        car: { carID: carObj.carID, upgrade: carObj.upgrade || "000" },
                        origin
                    });
                }
                break;
            }
            case "pack":
                if (typeof value === "string") entries.push({ pack: value, origin });
                break;
            default:
                break;
        }
    }

    if (entries.length === 0) return { success: false, error: "no valid reward fields in tier" };

    try {
        await profileModel.updateOne(
            { userID },
            { "$push": { unclaimedRewards: { "$each": entries } } }
        );
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/** Strip rank/rankRange/topPercent meta keys from a tier — leave only the reward fields. */
function stripTierMeta(tier) {
    const out = {};
    for (const [k, v] of Object.entries(tier)) {
        if (k === "rank" || k === "rankRange" || k === "topPercent") continue;
        out[k] = v;
    }
    return out;
}

async function endPvpEvent(pvpEvent, endedBy) {
    const wasActive = !!pvpEvent.isActive;

    // Atomic claim — prevents the scheduler and a manual cd-endpvp from both
    // ending the same event in parallel (would double-distribute rewards).
    // We flip isActive→false in the same op that gates entry into the rest of the function.
    if (wasActive) {
        const claimed = await pvpEventModel.findOneAndUpdate(
            { pvpEventID: pvpEvent.pvpEventID, isActive: true },
            { "$set": { isActive: false } }
        );
        if (!claimed) {
            console.log(`[PvP] ${pvpEvent.pvpEventID} already ended by another process — skipping duplicate end`);
            return;
        }
    }

    const entries = pvpEvent.entries || {};
    const leaderboard = buildLeaderboard(entries);
    const totalParticipants = leaderboard.length;
    const totalMatchesPlayed = leaderboard.reduce((sum, p) => sum + p.matchesPlayed, 0);

    // Distribute rewards
    const distribution = [];
    for (const player of leaderboard) {
        const tier = findRewardTier(pvpEvent.rewards, player.finalRank, totalParticipants);
        if (!tier) {
            player.rewardTier = null;
            continue;
        }
        let tierLabel;
        if (tier.rank !== undefined) tierLabel = `Rank ${tier.rank}`;
        else if (Array.isArray(tier.rankRange)) tierLabel = `Ranks ${tier.rankRange[0]}-${tier.rankRange[1]}`;
        else tierLabel = `Top ${tier.topPercent}%`;
        player.rewardTier = tierLabel;

        const result = await grantTierToPlayer(player.userID, tier, pvpEvent.name, player.finalRank);
        distribution.push({
            userID: player.userID,
            tier: tierLabel,
            rewards: stripTierMeta(tier),
            success: result.success,
            error: result.error
        });
    }

    // Archive
    try {
        await pvpEventResultModel.create({
            pvpEventID: pvpEvent.pvpEventID,
            eventName: pvpEvent.name,
            endedAt: new Date(),
            endedBy: endedBy || "system",
            wasActive,
            totalParticipants,
            totalMatchesPlayed,
            finalLeaderboard: leaderboard,
            rewardDistribution: distribution,
            eventConfig: {
                reqs: pvpEvent.reqs,
                tracksets: pvpEvent.tracksets,
                ghostDecks: pvpEvent.ghostDecks,
                rewards: pvpEvent.rewards,
                ticketCap: pvpEvent.ticketCap,
                ticketRegenMinutes: pvpEvent.ticketRegenMinutes,
                matchCooldownSeconds: pvpEvent.matchCooldownSeconds,
                deadline: pvpEvent.deadline
            },
            finalEntries: entries
        });
    } catch (err) {
        console.error(`Failed to save PvP event results for ${pvpEvent.pvpEventID}: ${err.message}`);
    }

    // Delete active document
    await pvpEventModel.deleteOne({ pvpEventID: pvpEvent.pvpEventID });

    // Public end announcement (only for events that were live)
    if (wasActive) {
        try {
            const channel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
            await channel.send(`**The ${pvpEvent.name} PvP event has officially ended! Rewards have been distributed — claim them with \`cd-rewards\`.**`);

            // Top 10 leaderboard summary in a thread
            const thread = await channel.threads.create({
                name: `${pvpEvent.pvpEventID} - ${pvpEvent.name}`,
                autoArchiveDuration: 60,
                invitable: false
            });
            await thread.join();

            const top10 = leaderboard.slice(0, 10);
            let leaderboardLines = "";
            for (const p of top10) {
                const medal = p.finalRank === 1 ? "🥇" : p.finalRank === 2 ? "🥈" : p.finalRank === 3 ? "🥉" : `**#${p.finalRank}**`;
                leaderboardLines += `${medal} <@${p.userID}> — ${p.score} pts (${p.wins}W / ${p.losses}L / ${p.draws}D)${p.rewardTier ? ` • _${p.rewardTier}_` : ""}\n`;
            }
            if (!leaderboardLines) leaderboardLines = "_No participants._";

            const summary = new InfoMessage({
                channel: thread,
                title: `${pvpEvent.name} — Final Standings`,
                desc: leaderboardLines,
                author: bot.user,
                fields: [
                    { name: "Total Participants", value: String(totalParticipants), inline: true },
                    { name: "Total Matches", value: String(totalMatchesPlayed), inline: true },
                    { name: "Tracksets", value: String((pvpEvent.tracksets || []).length), inline: true }
                ]
            });
            await summary.sendMessage();
            await thread.setArchived(true);
        } catch (err) {
            console.error(`Failed to post PvP event end message: ${err.message}`);
        }
    }
}

module.exports = endPvpEvent;
