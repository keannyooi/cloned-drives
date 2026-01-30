"use strict";

const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { getCar } = require("../util/functions/dataManager.js");
const { 
    PVP_LEAGUES, 
    LEAGUE_ORDER,
    getLeague
} = require("../util/consts/pvpConfig.js");
const { getCurrentSeason } = require("../util/consts/pvpSeasons.js");
const { getBannedCars, getBanReason, GLOBAL_BANS, SEASON_BANS } = require("../util/consts/pvpBans.js");
const carNameGen = require("../util/functions/carNameGen.js");

module.exports = {
    name: "pvpbans",
    aliases: ["pvpban", "pvpbanned"],
    usage: ["[league]"],
    args: 0,
    category: "PvP",
    cooldown: 5,
    description: "View banned cars for PvP leagues this season.",
    
    async execute(message, args) {
        const season = getCurrentSeason();
        
        if (args.length > 0) {
            // Show bans for specific league
            const leagueName = args[0].toLowerCase();
            const leagueConfig = getLeague(leagueName);
            
            if (!leagueConfig) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Invalid League",
                    desc: `"${leagueName}" is not a valid league.\n\nAvailable leagues: ${LEAGUE_ORDER.join(", ")}`,
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
            
            return showLeagueBans(message, leagueName, leagueConfig, season);
        }
        
        // Show overview of all bans
        return showAllBans(message, season);
    }
};

async function showLeagueBans(message, leagueName, leagueConfig, season) {
    const bannedCars = getBannedCars(leagueName, season.id);
    
    if (bannedCars.length === 0) {
        const embed = new InfoMessage({
            channel: message.channel,
            title: `🚫 Banned Cars — ${leagueConfig.name}`,
            desc: `No cars are banned in ${leagueConfig.name} this season!\n\n**Season:** ${season.name}`,
            author: message.author,
            footer: "Bans rotate each season based on meta data."
        });
        embed.embed.color = leagueConfig.color;
        return embed.sendMessage();
    }
    
    let desc = `These cars cannot be used in ${leagueConfig.name} PvP this season.\n\n`;
    
    for (const ban of bannedCars) {
        const car = getCar(ban.carID);
        if (!car) {
            desc += `• Unknown car (${ban.carID})\n`;
            continue;
        }
        
        const carName = carNameGen({ currentCar: car, rarity: true });
        
        desc += `**${carName}**\n`;
        desc += `Reason: ${ban.reason || "No reason specified"}`;
        if (ban.isGlobal) {
            desc += ` *(Banned in ALL leagues)*`;
        } else if (ban.isAllLeagues) {
            desc += ` *(Season-wide ban)*`;
        }
        desc += `\n\n`;
    }
    
    const embed = new InfoMessage({
        channel: message.channel,
        title: `🚫 Banned Cars — ${leagueConfig.name}`,
        desc: desc,
        author: message.author,
        footer: `Season: ${season.name} | Bans rotate each season.`
    });
    
    embed.embed.color = leagueConfig.color;
    return embed.sendMessage();
}

async function showAllBans(message, season) {
    let desc = `**Season:** ${season.name}\n\n`;
    
    // Global bans (from GLOBAL_BANS object)
    const globalBanEntries = Object.entries(GLOBAL_BANS);
    if (globalBanEntries.length > 0) {
        desc += `**🌐 Banned in ALL Leagues (Global):**\n`;
        for (const [carID, reason] of globalBanEntries) {
            const car = getCar(carID);
            if (!car) continue;
            const carName = carNameGen({ currentCar: car, rarity: true });
            desc += `• ${carName}\n`;
        }
        desc += `\n`;
    }
    
    // Season-wide bans (allLeagues for this season)
    const seasonBans = SEASON_BANS[season.id];
    const seasonWideBans = seasonBans?.allLeagues || [];
    if (seasonWideBans.length > 0) {
        desc += `**📅 Banned This Season (All Leagues):**\n`;
        for (const ban of seasonWideBans) {
            const car = getCar(ban.carID);
            if (!car) continue;
            const carName = carNameGen({ currentCar: car, rarity: true });
            desc += `• ${carName}\n`;
        }
        desc += `\n`;
    }
    
    // Per-league bans
    let hasLeagueBans = false;
    for (const leagueName of LEAGUE_ORDER) {
        const leagueBans = seasonBans?.perLeague?.[leagueName] || [];
        if (leagueBans.length > 0) {
            hasLeagueBans = true;
            const leagueConfig = PVP_LEAGUES[leagueName];
            desc += `**${leagueConfig.name}:** ${leagueBans.length} banned\n`;
        }
    }
    
    const totalBans = globalBanEntries.length + seasonWideBans.length;
    if (!hasLeagueBans && totalBans === 0) {
        desc += `No cars are banned this season! All cars are available in all leagues.`;
    } else if (hasLeagueBans) {
        desc += `\nUse \`cd-pvpbans <league>\` to see specific banned cars.`;
    }
    
    const embed = new InfoMessage({
        channel: message.channel,
        title: "🚫 PvP Banned Cars Overview",
        desc: desc,
        author: message.author,
        footer: "Bans rotate each season based on meta data."
    });
    
    return embed.sendMessage();
}
