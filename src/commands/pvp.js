"use strict";

const bot = require("../config/config.js");
const { ActionRowBuilder } = require("discord.js");
const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { 
    PVP_LEAGUES, 
    LEAGUE_ORDER, 
    PVP_SETTINGS,
    getLeague
} = require("../util/consts/pvpConfig.js");
const { getCurrentSeason, getSeasonTimeRemaining } = require("../util/consts/pvpSeasons.js");
const { 
    generateDefenseDisplay, 
    getAttacksDisplay,
    getWinRate,
    calculateTotalCR
} = require("../util/functions/pvpUtils.js");
const getPvPButtons = require("../util/functions/getPvPButtons.js");
const pvpModel = require("../models/pvpSchema.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "pvp",
    aliases: ["ranked", "ladder"],
    usage: ["[league]"],
    args: 0,
    category: "PvP",
    cooldown: 5,
    description: "View your PvP profile, leagues, and battle status. The main hub for all PvP activities.",
    
    async execute(message, args) {
        const profile = await profileModel.findOne({ userID: message.author.id });
        if (!profile) return;
        
        // Check minimum garage requirement
        const minGarage = Math.min(...Object.values(PVP_LEAGUES).map(l => l.minGarageSize));
        if (profile.garage.length < minGarage) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "PvP Locked",
                desc: `You need at least **${minGarage} cars** in your garage to access PvP.\n\nYou currently have **${profile.garage.length}** cars.`,
                author: message.author,
                footer: "Keep collecting cars to unlock PvP!"
            });
            return errorMessage.sendMessage();
        }
        
        // Get or create PvP profile
        let pvpProfile = await pvpModel.findOrCreate(message.author.id);
        
        // Check for attack reset
        if (pvpProfile.shouldResetAttacks(PVP_SETTINGS.attackResetHour)) {
            pvpProfile.attacksToday = 0;
            pvpProfile.lastAttackReset = new Date();
            await pvpProfile.save();
        }
        
        // Check for pending notifications
        const notifications = pvpProfile.getAndClearNotifications();
        if (notifications.length > 0) {
            await pvpProfile.save();
            
            // Send notifications first
            const notifEmbed = new InfoMessage({
                channel: message.channel,
                title: "📬 PvP Notifications",
                desc: notifications.map(n => n.message).join("\n\n"),
                author: message.author,
                footer: "These are results from battles while you were away."
            });
            await notifEmbed.sendMessage({ preserve: true });
        }
        
        const season = getCurrentSeason();
        const timeRemaining = getSeasonTimeRemaining();
        
        // If a specific league is provided, show detailed view
        if (args.length > 0) {
            const leagueName = args[0].toLowerCase();
            return showLeagueDetail(message, pvpProfile, profile, leagueName, season);
        }
        
        // Show main hub
        return showMainHub(message, pvpProfile, profile, season, timeRemaining);
    }
};

async function showMainHub(message, pvpProfile, profile, season, timeRemaining) {
    const attacksInfo = getAttacksDisplay(
        pvpProfile.attacksToday, 
        PVP_SETTINGS.maxAttacksPerDay,
        pvpProfile.lastAttackReset
    );
    
    // Build league summary
    const leagueFields = [];
    let activeLeagues = 0;
    
    for (const leagueName of LEAGUE_ORDER) {
        const leagueConfig = PVP_LEAGUES[leagueName];
        const stats = pvpProfile.leagueStats[leagueName];
        const hasDefense = stats.defense && stats.defense.length === 5;
        
        // Check if player can access this league
        const canAccess = profile.garage.length >= leagueConfig.minGarageSize;
        
        if (!canAccess) continue; // Skip leagues player can't access
        
        activeLeagues++;
        
        const totalGames = stats.attackWins + stats.attackLosses;
        const winRate = getWinRate(stats.attackWins, stats.attackLosses);
        
        let statusIcon = hasDefense ? "✅" : "⚠️";
        let statusText = hasDefense ? `Defense Set` : `No Defense`;
        
        // Get emoji based on league
        const emojiID = bot.emojis.cache.get(require("../util/consts/consts.js")[leagueConfig.emoji]);
        const leagueEmoji = emojiID || "🔷";
        
        let fieldValue = "";
        if (totalGames === 0) {
            fieldValue = `Rating: **${stats.rating}** (Unranked)\n${statusIcon} ${statusText}`;
        } else {
            fieldValue = `Rating: **${stats.rating}** | W/L: ${stats.attackWins}-${stats.attackLosses} (${winRate}%)\n${statusIcon} ${statusText}`;
        }
        
        // Only show first 4 leagues in compact view
        if (leagueFields.length < 4) {
            leagueFields.push({
                name: `${leagueEmoji} ${leagueConfig.name}`,
                value: fieldValue,
                inline: true
            });
        }
    }
    
    // Add "more leagues" indicator if needed
    if (activeLeagues > 4) {
        leagueFields.push({
            name: "➕ More Leagues",
            value: `Use \`cd-pvp <league>\` to view\n${activeLeagues - 4} more leagues available`,
            inline: true
        });
    }
    
    // Build description
    let desc = `**${season.name}**\n`;
    desc += `📅 ${timeRemaining.days}d ${timeRemaining.hours}h remaining\n\n`;
    desc += `⚔️ **Attacks Today:** ${attacksInfo.remaining}/${attacksInfo.total}`;
    if (attacksInfo.remaining < attacksInfo.total) {
        desc += ` (resets in ${attacksInfo.resetIn})`;
    }
    desc += `\n\n`;
    desc += `🛣️ **Track Pool:** ${season.trackPool.surfaces.join(", ")}\n`;
    desc += `🌤️ **Weather:** ${Object.entries(season.trackPool.weatherWeights).map(([w, p]) => `${Math.round(p * 100)}% ${w}`).join(" / ")}`;
    
    const hubEmbed = new InfoMessage({
        channel: message.channel,
        title: "⚔️ PvP Hub",
        desc: desc,
        author: message.author,
        fields: leagueFields,
        footer: "cd-pvpattack <league> | cd-pvpdefense <league> | cd-pvpseason"
    });
    
    // Add buttons
    const { attack, defense, season: seasonBtn, history } = getPvPButtons("pvp_hub");
    const row = new ActionRowBuilder().addComponents(attack, defense, seasonBtn, history);
    
    const hubMessage = await hubEmbed.sendMessage({ buttons: [row], preserve: true });
    
    // Handle button interactions
    const filter = (button) => button.user.id === message.author.id;
    const collector = message.channel.createMessageComponentCollector({
        filter,
        time: 60000
    });
    
    collector.on("collect", async (button) => {
        try {
            await button.deferUpdate().catch(() => {});
            
            switch (button.customId) {
                case "pvp_attack":
                    await button.followUp({ 
                        content: "Use `cd-pvpattack <league>` to start an attack.\nExample: `cd-pvpattack epic`",
                        ephemeral: true 
                    });
                    break;
                    
                case "pvp_defense":
                    await button.followUp({ 
                        content: "Use `cd-pvpdefense <league>` to set your defense.\nExample: `cd-pvpdefense epic`",
                        ephemeral: true 
                    });
                    break;
                    
                case "pvp_season":
                    await button.followUp({ 
                        content: "Use `cd-pvpseason` to view season details and prizes.",
                        ephemeral: true 
                    });
                    break;
                    
                case "pvp_history":
                    await button.followUp({ 
                        content: "Use `cd-pvphistory` to view your battle history.",
                        ephemeral: true 
                    });
                    break;
            }
        } catch (err) {
            console.error("PvP hub button error:", err);
        }
    });
    
    collector.on("end", () => {
        hubMessage?.removeButtons();
    });
}

async function showLeagueDetail(message, pvpProfile, profile, leagueName, season) {
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
    
    // Check if player can access this league
    if (profile.garage.length < leagueConfig.minGarageSize) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "League Locked",
            desc: `You need at least **${leagueConfig.minGarageSize} cars** to access ${leagueConfig.name}.\n\nYou currently have **${profile.garage.length}** cars.`,
            author: message.author
        });
        return errorMessage.sendMessage();
    }
    
    const stats = pvpProfile.leagueStats[leagueName];
    const hasDefense = stats.defense && stats.defense.length === 5;
    
    // Build defense display
    let defenseText = "";
    let defenseTotalCR = 0;
    
    if (hasDefense) {
        const { lines, totalCR } = generateDefenseDisplay(stats.defense);
        defenseText = lines.join("\n");
        defenseTotalCR = totalCR;
    } else {
        defenseText = "*No defense set*\nUse `cd-pvpdefense " + leagueName + "` to set up your defense.";
    }
    
    // Calculate stats
    const totalAttacks = stats.attackWins + stats.attackLosses;
    const totalDefense = stats.defenseWins + stats.defenseLosses;
    const attackWinRate = getWinRate(stats.attackWins, stats.attackLosses);
    const defenseWinRate = getWinRate(stats.defenseWins, stats.defenseLosses);
    
    // Build description
    let desc = `**CR Range per car:** ${leagueConfig.minCarCR} - ${leagueConfig.maxCarCR === Infinity ? "Unlimited" : leagueConfig.maxCarCR}\n`;
    desc += `**Max total CR:** ${leagueConfig.maxTotalCR === Infinity ? "Unlimited" : leagueConfig.maxTotalCR}\n`;
    desc += `**Max duplicates:** ${leagueConfig.maxDuplicates} per car\n\n`;
    
    desc += `📊 **Your Stats**\n`;
    desc += `Rating: **${stats.rating}** (Peak: ${stats.peakRating})\n`;
    desc += `Win Streak: **${stats.winStreak}** (Best: ${stats.bestWinStreak})\n\n`;
    
    desc += `⚔️ **Attack Record:** ${stats.attackWins}W - ${stats.attackLosses}L`;
    if (totalAttacks > 0) desc += ` (${attackWinRate}%)`;
    desc += `\n`;
    
    desc += `🛡️ **Defense Record:** ${stats.defenseWins}W - ${stats.defenseLosses}L`;
    if (totalDefense > 0) desc += ` (${defenseWinRate}%)`;
    
    const maxTotalCRDisplay = leagueConfig.maxTotalCR === Infinity ? "∞" : leagueConfig.maxTotalCR;
    const fields = [
        {
            name: `🛡️ Your Defense ${hasDefense ? `(CR: ${defenseTotalCR}/${maxTotalCRDisplay})` : ""}`,
            value: defenseText
        }
    ];
    
    const leagueEmbed = new InfoMessage({
        channel: message.channel,
        title: `${leagueConfig.name}`,
        desc: desc,
        author: message.author,
        fields: fields,
        footer: `cd-pvpattack ${leagueName} | cd-pvpdefense ${leagueName} | cd-pvpbans ${leagueName}`
    });
    
    leagueEmbed.embed.color = leagueConfig.color;
    
    return leagueEmbed.sendMessage();
}
