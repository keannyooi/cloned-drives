"use strict";

const bot = require("../config/config.js");
const { ActionRowBuilder } = require("discord.js");
const { InfoMessage } = require("../util/classes/classes.js");
const { getCar } = require("../util/functions/dataManager.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { 
    PVP_LEAGUES, 
    LEAGUE_ORDER
} = require("../util/consts/pvpConfig.js");
const { 
    getCurrentSeason, 
    getMostRecentSeason,
    isSeasonActive,
    getSeasonTimeRemaining 
} = require("../util/consts/pvpSeasons.js");
const { getBannedCars } = require("../util/consts/pvpBans.js");
const { getEffectiveCR } = require("../util/functions/pvpUtils.js");
const carNameGen = require("../util/functions/carNameGen.js");
const pvpModel = require("../models/pvpSchema.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "pvpseason",
    aliases: ["pvps", "pvpprizes"],
    usage: ["[prizes]"],
    args: 0,
    category: "PvP",
    cooldown: 5,
    description: "View current PvP season information, track pool, and prize cars.",
    
    async execute(message, args) {
        // Use getMostRecentSeason to always have something to show
        const season = isSeasonActive() ? getCurrentSeason() : getMostRecentSeason();
        const timeRemaining = getSeasonTimeRemaining();
        const isActive = isSeasonActive();
        
        // Check if showing prizes specifically
        if (args.length > 0 && args[0].toLowerCase() === "prizes") {
            return showPrizes(message, season, timeRemaining, isActive);
        }
        
        // Get player's PvP profile for ranking info
        const pvpProfile = await pvpModel.findOne({ userID: message.author.id });
        
        return showSeasonOverview(message, season, timeRemaining, pvpProfile, isActive);
    }
};

async function showSeasonOverview(message, season, timeRemaining, pvpProfile, isActive) {
    const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
    const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
    const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);
    
    let desc = "";
    
    // Season status
    if (!isActive) {
        desc += `⏳ **OFF-SEASON** — PvP battles are paused!\n\n`;
        desc += `*The next season will be announced soon.*\n\n`;
        desc += `**Last Season:** ${season.name}\n`;
        desc += `**Ended:** ${season.endDate.toISOString().split('T')[0]}\n\n`;
    } else if (timeRemaining.expired) {
        desc += `⚠️ **Season has ended!** Rewards are being processed.\n\n`;
    } else {
        desc += `📅 **Ends in:** ${timeRemaining.days}d ${timeRemaining.hours}h ${timeRemaining.minutes}m\n\n`;
    }
    
    // Season description
    desc += `*${season.description}*\n\n`;
    
    // Track Pool
    desc += `**🛣️ TRACK POOL: ${season.trackPool.name}**\n`;
    desc += `*${season.trackPool.description}*\n`;
    desc += `Surfaces: ${season.trackPool.surfaces.join(", ")} | Weather: ${Object.entries(season.trackPool.weatherWeights).map(([w, p]) => `${Math.round(p * 100)}% ${w}`).join(", ")}\n\n`;
    
    // Banned cars summary
    let totalBans = 0;
    for (const league of LEAGUE_ORDER) {
        totalBans += getBannedCars(league, season.id).length;
    }
    desc += `**🚫 BANNED CARS**\n`;
    if (totalBans > 0) {
        desc += `${totalBans} cars banned across leagues\n`;
        desc += `Use \`cd-pvpbans\` for details\n\n`;
    } else {
        desc += `No bans this season!\n\n`;
    }
    
    // Hand rules reminder
    desc += `**📋 HAND RULES**\n`;
    desc += `• Max 2 copies of same car (any tune)\n`;
    desc += `• All cars must be within league CR range\n`;
    desc += `• Total CR must fit within league budget\n\n`;
    
    // Rating rewards
    desc += `**💰 RATING REWARDS**\n`;
    
    // ratingRewards is an array of { rating, money, trophies }
    const rewards = season.ratingRewards || [];
    const sortedRewards = [...rewards].sort((a, b) => a.rating - b.rating);
    
    for (const reward of sortedRewards) {
        // Check if player has reached this threshold in any league
        let reached = false;
        if (pvpProfile) {
            for (const league of LEAGUE_ORDER) {
                if (pvpProfile.leagueStats[league]?.peakRating >= reward.rating) {
                    reached = true;
                    break;
                }
            }
        }
        
        const checkmark = reached ? "✅" : "⬜";
        desc += `${checkmark} **${reward.rating}+** — ${moneyEmoji}${reward.money.toLocaleString()}`;
        if (reward.fuseTokens) desc += ` + ${fuseEmoji}${reward.fuseTokens}`;
        if (reward.trophies) desc += ` + ${trophyEmoji}${reward.trophies}`;
        desc += `\n`;
    }
    
    const embed = new InfoMessage({
        channel: message.channel,
        title: `🏆 ${season.name}`,
        desc: desc,
        author: message.author,
        footer: "cd-pvpseason prizes | cd-pvpleaderboard <league>"
    });
    
    return embed.sendMessage();
}

async function showPrizes(message, season, timeRemaining, isActive) {
    let desc = "";
    
    if (!isActive) {
        desc += `⏳ **OFF-SEASON** — Check back when a new season begins!\n\n`;
        desc += `**Last Season:** ${season.name}\n\n`;
    } else if (timeRemaining.expired) {
        desc += `⚠️ **Season has ended!**\n\n`;
    } else {
        desc += `📅 **${timeRemaining.days}d ${timeRemaining.hours}h remaining**\n\n`;
    }
    
    desc += `Top finishers in each league earn exclusive prize cars!\n\n`;
    
    // Get player's current rankings
    const pvpProfile = await pvpModel.findOne({ userID: message.author.id });
    
    const fields = [];
    const prizeSlots = season.prizeCarSlots || 3; // Default to top 3
    
    for (const league of LEAGUE_ORDER) {
        const leagueConfig = PVP_LEAGUES[league];
        const prizeCarID = season.prizeCars?.[league];
        
        if (!prizeCarID) {
            // No prize car for this league
            continue;
        }
        
        const prizeCar = getCar(prizeCarID);
        if (!prizeCar) continue;
        
        const carName = carNameGen({ currentCar: prizeCar, rarity: true });
        const carCR = getEffectiveCR(prizeCarID);
        
        let fieldValue = `**${carName}**\n`;
        fieldValue += `CR: ${carCR}\n`;
        fieldValue += `Top ${prizeSlots} earn this car\n`;
        
        // Show player's rank if they have one
        if (pvpProfile && pvpProfile.leagueStats[league]) {
            const stats = pvpProfile.leagueStats[league];
            const totalGames = stats.attackWins + stats.attackLosses;
            
            if (totalGames >= 5) { // Minimum games for ranking
                // Get player's rank
                const higherRated = await pvpModel.countDocuments({
                    [`leagueStats.${league}.peakRating`]: { $gt: stats.peakRating }
                });
                const rank = higherRated + 1;
                
                if (rank <= prizeSlots) {
                    fieldValue += `✅ **Your Rank: #${rank}** (In prize position!)`;
                } else {
                    const gap = rank - prizeSlots;
                    fieldValue += `Your Rank: #${rank} (${gap} away from prize)`;
                }
            } else {
                fieldValue += `Play ${5 - totalGames} more games to rank`;
            }
        }
        
        fields.push({
            name: `${leagueConfig.name}`,
            value: fieldValue,
            inline: true
        });
    }
    
    // If no prize cars configured
    if (fields.length === 0) {
        desc += `*No prize cars have been configured for this season yet.*\n\nCheck back later!`;
    }
    
    const embed = new InfoMessage({
        channel: message.channel,
        title: `🏆 Season Prizes — ${season.name}`,
        desc: desc,
        author: message.author,
        fields: fields,
        footer: "Compete for exclusive prize cars!"
    });
    
    return embed.sendMessage();
}
