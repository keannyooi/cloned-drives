"use strict";

const bot = require("../config/config.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { InfoMessage, ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { getCar } = require("../util/functions/dataManager.js");
const { 
    PVP_LEAGUES, 
    LEAGUE_ORDER,
    PVP_SETTINGS,
    getLeague
} = require("../util/consts/pvpConfig.js");
const { 
    getCurrentSeason, 
    getMostRecentSeason,
    isSeasonActive,
    getAllSeasons 
} = require("../util/consts/pvpSeasons.js");

// Optional import - season end processing may not be set up yet
let processSeasonEnd = null;
try {
    const seasonEndModule = require("../util/functions/pvpSeasonEnd.js");
    processSeasonEnd = seasonEndModule.processSeasonEnd;
} catch (e) {
    console.log("[PvP Admin] pvpSeasonEnd.js not found - season end commands disabled");
}

const carNameGen = require("../util/functions/carNameGen.js");
const searchUser = require("../util/functions/searchUser.js");
const pvpModel = require("../models/pvpSchema.js");
const profileModel = require("../models/profileSchema.js");

// Owner ID - only this user can end seasons
const OWNER_ID = "209038568138604546";

module.exports = {
    name: "pvpadmin",
    aliases: ["pvpmanage"],
    usage: ["<subcommand> [args]"],
    args: 1,
    category: "Admin",
    cooldown: 3,
    description: "Admin commands for managing PvP system.",
    adminOnly: true,
    
    async execute(message, args) {
        const subcommand = args[0]?.toLowerCase();
        
        switch (subcommand) {
            case "help":
                return showHelp(message);
            
            case "cleardefense":
                return clearDefense(message, args.slice(1));
            
            case "resetattacks":
                return resetAttacks(message, args.slice(1));
            
            case "setrating":
                return setRating(message, args.slice(1));
            
            case "viewplayer":
                return viewPlayer(message, args.slice(1));
            
            case "endseason":
                return endSeason(message, args.slice(1));
            
            case "previewend":
                return previewSeasonEnd(message, args.slice(1));
            
            case "resetplayer":
                return resetPlayer(message, args.slice(1));
            
            case "seasonstatus":
                return seasonStatus(message);
            
            default:
                const errorEmbed = new ErrorMessage({
                    channel: message.channel,
                    title: "Unknown Subcommand",
                    desc: `"${subcommand}" is not a valid subcommand.\n\nUse \`cd-pvpadmin help\` to see available commands.`,
                    author: message.author
                });
                return errorEmbed.sendMessage();
        }
    }
};

// =============================================================================
// HELP
// =============================================================================

async function showHelp(message) {
    let desc = `**Player Management:**\n`;
    desc += `\`cleardefense <user> [league]\` — Remove a player's defense\n`;
    desc += `\`resetattacks <user>\` — Reset a player's daily attack count\n`;
    desc += `\`setrating <user> <league> <rating>\` — Set a player's rating\n`;
    desc += `\`viewplayer <user>\` — View a player's PvP profile\n`;
    desc += `\`resetplayer <user>\` — Completely reset a player's PvP data\n\n`;
    
    desc += `**Season Management:**\n`;
    desc += `\`seasonstatus\` — View current season status\n`;
    desc += `\`previewend [league]\` — Preview season end results\n`;
    desc += `\`endseason [--force]\` — Process season end${processSeasonEnd ? "" : " *(requires pvpSeasonEnd.js)*"}\n`;
    
    const embed = new InfoMessage({
        channel: message.channel,
        title: "🔧 PvP Admin Commands",
        desc: desc,
        author: message.author,
        footer: "Use these commands carefully - they affect player data!"
    });
    
    return embed.sendMessage();
}

// =============================================================================
// CLEAR DEFENSE
// =============================================================================

async function clearDefense(message, args) {
    if (args.length < 1) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Missing Arguments",
            desc: "Usage: `cd-pvpadmin cleardefense <user> [league]`\n\nIf league is omitted, clears ALL defenses.",
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    // Find user (returns [GuildMember, currentMessage])
    const response = await searchUser(message, args[0].toLowerCase());
    if (!Array.isArray(response)) return;
    
    const [targetMember, currentMessage] = response;
    const targetUser = targetMember.user;
    const leagueName = args[1]?.toLowerCase();
    const pvpProfile = await pvpModel.findOne({ userID: targetUser.id });
    
    if (!pvpProfile) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "No PvP Profile",
            desc: `${targetUser.username} doesn't have a PvP profile.`,
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    if (leagueName) {
        // Clear specific league
        if (!PVP_LEAGUES[leagueName]) {
            const errorEmbed = new ErrorMessage({
                channel: message.channel,
                title: "Invalid League",
                desc: `"${leagueName}" is not a valid league.\n\nAvailable: ${LEAGUE_ORDER.join(", ")}`,
                author: message.author
            });
            return errorEmbed.sendMessage();
        }
        
        if (pvpProfile.leagueStats[leagueName]) {
            pvpProfile.leagueStats[leagueName].defense = [];
            pvpProfile.markModified(`leagueStats.${leagueName}`);
            await pvpProfile.save();
        }
        
        const successEmbed = new SuccessMessage({
            channel: message.channel,
            title: "Defense Cleared",
            desc: `Cleared ${targetUser.username}'s defense in **${PVP_LEAGUES[leagueName].name}**.`,
            author: message.author
        });
        return successEmbed.sendMessage();
        
    } else {
        // Clear all leagues
        for (const league of LEAGUE_ORDER) {
            if (pvpProfile.leagueStats[league]) {
                pvpProfile.leagueStats[league].defense = [];
            }
        }
        pvpProfile.markModified('leagueStats');
        await pvpProfile.save();
        
        const successEmbed = new SuccessMessage({
            channel: message.channel,
            title: "All Defenses Cleared",
            desc: `Cleared ${targetUser.username}'s defense in ALL leagues.`,
            author: message.author
        });
        return successEmbed.sendMessage();
    }
}

// =============================================================================
// RESET ATTACKS
// =============================================================================

async function resetAttacks(message, args) {
    if (args.length < 1) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Missing Arguments",
            desc: "Usage: `cd-pvpadmin resetattacks <user>`",
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    // Find user (returns [GuildMember, currentMessage])
    const response = await searchUser(message, args[0].toLowerCase());
    if (!Array.isArray(response)) return;
    
    const [targetMember, currentMessage] = response;
    const targetUser = targetMember.user;
    const pvpProfile = await pvpModel.findOne({ userID: targetUser.id });
    
    if (!pvpProfile) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "No PvP Profile",
            desc: `${targetUser.username} doesn't have a PvP profile.`,
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    // Attacks are tracked at profile level, not per-league
    // The league argument is ignored - attacks are shared across all leagues
    pvpProfile.attacksToday = 0;
    pvpProfile.lastAttackReset = new Date(0);
    await pvpProfile.save();
    
    const successEmbed = new SuccessMessage({
        channel: message.channel,
        title: "Attacks Reset",
        desc: `Reset ${targetUser.username}'s attack count to 0/${PVP_SETTINGS.maxAttacksPerDay}.`,
        author: message.author
    });
    return successEmbed.sendMessage();
}

// =============================================================================
// SET RATING
// =============================================================================

async function setRating(message, args) {
    if (args.length < 3) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Missing Arguments",
            desc: "Usage: `cd-pvpadmin setrating <user> <league> <rating>`",
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    // Find user (returns [GuildMember, currentMessage])
    const response = await searchUser(message, args[0].toLowerCase());
    if (!Array.isArray(response)) return;
    
    const [targetMember, currentMessage] = response;
    const targetUser = targetMember.user;
    const leagueName = args[1].toLowerCase();
    const newRating = parseInt(args[2]);
    
    if (!PVP_LEAGUES[leagueName]) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Invalid League",
            desc: `"${leagueName}" is not a valid league.\n\nAvailable: ${LEAGUE_ORDER.join(", ")}`,
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    if (isNaN(newRating) || newRating < 0 || newRating > 5000) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Invalid Rating",
            desc: "Rating must be a number between 0 and 5000.",
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    const pvpProfile = await pvpModel.findOne({ userID: targetUser.id });
    
    if (!pvpProfile) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "No PvP Profile",
            desc: `${targetUser.username} doesn't have a PvP profile.`,
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    const oldRating = pvpProfile.leagueStats[leagueName]?.rating || PVP_SETTINGS.baseRating;
    
    if (!pvpProfile.leagueStats[leagueName]) {
        pvpProfile.leagueStats[leagueName] = pvpModel.schema.methods.getDefaultLeagueStats.call(pvpProfile);
    }
    
    pvpProfile.leagueStats[leagueName].rating = newRating;
    
    // Update peak if new rating is higher
    if (newRating > (pvpProfile.leagueStats[leagueName].peakRating || 0)) {
        pvpProfile.leagueStats[leagueName].peakRating = newRating;
    }
    
    pvpProfile.markModified(`leagueStats.${leagueName}`);
    await pvpProfile.save();
    
    const successEmbed = new SuccessMessage({
        channel: message.channel,
        title: "Rating Updated",
        desc: `Changed ${targetUser.username}'s rating in **${PVP_LEAGUES[leagueName].name}**:\n\n${oldRating} → **${newRating}**`,
        author: message.author
    });
    return successEmbed.sendMessage();
}

// =============================================================================
// VIEW PLAYER
// =============================================================================

async function viewPlayer(message, args) {
    if (args.length < 1) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Missing Arguments",
            desc: "Usage: `cd-pvpadmin viewplayer <user>`",
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    // Find user (returns [GuildMember, currentMessage])
    const response = await searchUser(message, args[0].toLowerCase());
    if (!Array.isArray(response)) return;
    
    const [targetMember, currentMessage] = response;
    const targetUser = targetMember.user;
    const pvpProfile = await pvpModel.findOne({ userID: targetUser.id });
    
    if (!pvpProfile) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "No PvP Profile",
            desc: `${targetUser.username} doesn't have a PvP profile.`,
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    let desc = `**User ID:** ${targetUser.id}\n`;
    desc += `**Season ID:** ${pvpProfile.currentSeasonID || 1}\n`;
    desc += `**Attacks Today:** ${pvpProfile.attacksToday || 0}/${PVP_SETTINGS.maxAttacksPerDay}\n\n`;
    
    const fields = [];
    
    for (const league of LEAGUE_ORDER) {
        const stats = pvpProfile.leagueStats[league];
        if (!stats) continue;
        
        const hasDefense = stats.defense && stats.defense.length === 5;
        const totalGames = stats.attackWins + stats.attackLosses + (stats.draws || 0);
        
        if (totalGames > 0 || hasDefense) {
            let fieldValue = `Rating: ${stats.rating} (Peak: ${stats.peakRating})\n`;
            fieldValue += `Attacks: ${stats.attackWins}W-${stats.attackLosses}L`;
            if (stats.draws) fieldValue += `-${stats.draws}D`;
            fieldValue += `\n`;
            fieldValue += `Defense: ${stats.defenseWins}W-${stats.defenseLosses}L\n`;
            fieldValue += `Streak: ${stats.winStreak} (Best: ${stats.bestWinStreak})\n`;
            fieldValue += `Has Defense: ${hasDefense ? "✅" : "❌"}`;
            
            fields.push({
                name: PVP_LEAGUES[league].name,
                value: fieldValue,
                inline: true
            });
        }
    }
    
    if (fields.length === 0) {
        desc += `*No league activity yet.*`;
    }
    
    const embed = new InfoMessage({
        channel: message.channel,
        title: `🔍 PvP Profile — ${targetUser.username}`,
        desc: desc,
        author: message.author,
        fields: fields
    });
    
    return embed.sendMessage();
}

// =============================================================================
// RESET PLAYER
// =============================================================================

async function resetPlayer(message, args) {
    if (args.length < 1) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Missing Arguments",
            desc: "Usage: `cd-pvpadmin resetplayer <user>`\n\n⚠️ This completely deletes all PvP data for the player!",
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    // Find user (returns [GuildMember, currentMessage])
    const response = await searchUser(message, args[0].toLowerCase());
    if (!Array.isArray(response)) return;
    
    const [targetMember, currentMessage] = response;
    const targetUser = targetMember.user;
    
    // Confirmation check
    if (args[1] !== "--confirm") {
        const warnEmbed = new ErrorMessage({
            channel: message.channel,
            title: "⚠️ Confirm Reset",
            desc: `This will **permanently delete** all PvP data for ${targetUser.username}:\n• All league stats\n• All defenses\n• All battle history\n• Rating and streaks\n\nRun again with \`--confirm\` to proceed:\n\`cd-pvpadmin resetplayer ${args[0]} --confirm\``,
            author: message.author
        });
        return warnEmbed.sendMessage();
    }
    
    const result = await pvpModel.deleteOne({ userID: targetUser.id });
    
    if (result.deletedCount === 0) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "No PvP Profile",
            desc: `${targetUser.username} doesn't have a PvP profile to delete.`,
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    const successEmbed = new SuccessMessage({
        channel: message.channel,
        title: "Player Reset Complete",
        desc: `Deleted all PvP data for ${targetUser.username}.\n\nThey will start fresh if they use PvP again.`,
        author: message.author
    });
    return successEmbed.sendMessage();
}

// =============================================================================
// SEASON STATUS
// =============================================================================

async function seasonStatus(message) {
    const currentSeason = getCurrentSeason();
    const mostRecent = getMostRecentSeason();
    const isActive = isSeasonActive();
    
    let desc = "";
    
    if (isActive && currentSeason) {
        desc += `✅ **Season is ACTIVE**\n\n`;
        desc += `**Current Season:** ${currentSeason.name}\n`;
        desc += `**ID:** ${currentSeason.id}\n`;
        desc += `**Track Pool:** ${currentSeason.trackPool.name}\n`;
        desc += `**Start:** ${currentSeason.startDate.toISOString().split('T')[0]}\n`;
        desc += `**End:** ${currentSeason.endDate.toISOString().split('T')[0]}\n\n`;
    } else {
        desc += `⚠️ **No season currently active (OFF-SEASON)**\n\n`;
        desc += `**Most Recent Season:** ${mostRecent.name}\n`;
        desc += `**Ended:** ${mostRecent.endDate.toISOString().split('T')[0]}\n\n`;
    }
    
    // Count players
    const totalPlayers = await pvpModel.countDocuments({});
    const activeDefenses = await pvpModel.countDocuments({
        $or: LEAGUE_ORDER.map(l => ({ [`leagueStats.${l}.defense.0`]: { $exists: true } }))
    });
    
    desc += `**Total PvP Profiles:** ${totalPlayers}\n`;
    desc += `**Active Defenses:** ${activeDefenses}\n`;
    
    const embed = new InfoMessage({
        channel: message.channel,
        title: "📊 PvP Season Status",
        desc: desc,
        author: message.author,
        footer: "Use 'cd-pvpadmin endseason --force' to process season end"
    });
    
    return embed.sendMessage();
}

// =============================================================================
// PREVIEW SEASON END
// =============================================================================

async function previewSeasonEnd(message, args) {
    const leagueName = args[0]?.toLowerCase() || "epic";
    
    if (!PVP_LEAGUES[leagueName]) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Invalid League",
            desc: `"${leagueName}" is not a valid league.\n\nAvailable: ${LEAGUE_ORDER.join(", ")}`,
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    const season = getMostRecentSeason();
    const prizeSlots = season.prizeCarSlots || 3;
    
    // Get leaderboard
    const players = await pvpModel.find({
        [`leagueStats.${leagueName}.defense.0`]: { $exists: true }
    }).sort({ [`leagueStats.${leagueName}.rating`]: -1 }).limit(25);
    
    let desc = `**Season:** ${season.name}\n`;
    desc += `**Prize Slots:** Top ${prizeSlots}\n\n`;
    
    if (players.length === 0) {
        desc += `*No players with defenses in this league.*`;
    } else {
        desc += `**Leaderboard Preview:**\n`;
        
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const stats = p.leagueStats[leagueName];
            const totalGames = stats.attackWins + stats.attackLosses;
            const qualifies = totalGames >= (PVP_SETTINGS.minGamesForRewards || 10);
            
            const prizeIcon = i < prizeSlots ? "🏆" : "";
            const qualIcon = qualifies ? "✅" : "⚠️";
            
            desc += `${i + 1}. ${prizeIcon} ${qualIcon} <@${p.userID}> — ${stats.rating} (${totalGames} games)\n`;
        }
        
        desc += `\n✅ = Qualifies for rewards | ⚠️ = Needs ${PVP_SETTINGS.minGamesForRewards || 10} games`;
    }
    
    const embed = new InfoMessage({
        channel: message.channel,
        title: `📋 Season End Preview — ${PVP_LEAGUES[leagueName].name}`,
        desc: desc,
        author: message.author
    });
    
    return embed.sendMessage();
}

// =============================================================================
// END SEASON
// =============================================================================

async function endSeason(message, args) {
    // Owner-only check
    if (message.author.id !== OWNER_ID) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Permission Denied",
            desc: "Only the bot owner can end seasons.",
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    // Check if season end module is available
    if (!processSeasonEnd) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Module Not Available",
            desc: "Season end processing is not configured.\n\nMake sure `pvpSeasonEnd.js` is in `util/functions/`.",
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    const force = args.includes("--force");
    const dryRun = args.includes("--dry-run");
    
    const season = getMostRecentSeason();
    const isActive = isSeasonActive();
    
    if (isActive && !force) {
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Season Still Active",
            desc: `**${season.name}** hasn't ended yet!\n\nEnds: ${season.endDate.toISOString()}\n\nUse \`--force\` to process anyway (for testing).`,
            author: message.author
        });
        return errorEmbed.sendMessage();
    }
    
    // Confirmation
    if (!dryRun && !args.includes("--confirm")) {
        const warnEmbed = new ErrorMessage({
            channel: message.channel,
            title: "⚠️ Confirm Season End",
            desc: `This will:\n• Award prize cars to top players\n• Distribute rating rewards\n• Reset all ratings to 1000\n• Reset win streaks\n• Clear all defenses\n\nUse \`--dry-run\` to preview without changes.\nUse \`--confirm\` to proceed.\n\n\`cd-pvpadmin endseason ${force ? "--force " : ""}--confirm\``,
            author: message.author
        });
        return warnEmbed.sendMessage();
    }
    
    const processingEmbed = new InfoMessage({
        channel: message.channel,
        title: dryRun ? "🔍 Dry Run - Season End Preview" : "⏳ Processing Season End...",
        desc: `Processing **${season.name}**...\n\nThis may take a moment.`,
        author: message.author
    });
    const processingMsg = await processingEmbed.sendMessage();
    
    try {
        const result = await processSeasonEnd({ dryRun, force });
        
        if (!result.success) {
            const errorEmbed = new ErrorMessage({
                channel: message.channel,
                title: "Season End Failed",
                desc: `Error: ${result.reason || result.error}`,
                author: message.author
            });
            return errorEmbed.sendMessage({ currentMessage: processingMsg });
        }
        
        const { results } = result;
        
        let desc = `**Season:** ${results.season.name}\n\n`;
        desc += `**Summary:**\n`;
        desc += `• Players Processed: ${results.totalPlayersProcessed}\n`;
        desc += `• Rewards Distributed: ${results.totalRewardsDistributed}\n`;
        desc += `• Prize Cars Awarded: ${results.totalPrizeCarsAwarded}\n`;
        desc += `• Ratings Reset: ${results.ratingsReset}\n`;
        
        if (dryRun) {
            desc += `\n*This was a dry run - no changes were made.*`;
        }
        
        const successEmbed = new SuccessMessage({
            channel: message.channel,
            title: dryRun ? "✅ Dry Run Complete" : "✅ Season End Complete",
            desc: desc,
            author: message.author
        });
        return successEmbed.sendMessage({ currentMessage: processingMsg });
        
    } catch (error) {
        console.error("Season end error:", error);
        
        const errorEmbed = new ErrorMessage({
            channel: message.channel,
            title: "Season End Error",
            desc: `An error occurred:\n\`${error.message}\``,
            author: message.author
        });
        return errorEmbed.sendMessage({ currentMessage: processingMsg });
    }
}
