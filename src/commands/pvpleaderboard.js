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
const { getWinRate } = require("../util/functions/pvpUtils.js");
const getPvPButtons = require("../util/functions/getPvPButtons.js");
const pvpModel = require("../models/pvpSchema.js");

module.exports = {
    name: "pvpleaderboard",
    aliases: ["pvplb", "pvpranks", "pvprank"],
    usage: ["<league>"],
    args: 1,
    category: "PvP",
    cooldown: 5,
    description: "View the PvP leaderboard for a specific league.",
    
    async execute(message, args) {
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
        
        // Get leaderboard data
        const leaderboard = await pvpModel.getLeaderboard(
            leagueName, 
            25, 
            PVP_SETTINGS.minGamesForLeaderboard
        );
        
        if (leaderboard.length === 0) {
            const embed = new InfoMessage({
                channel: message.channel,
                title: `🏆 Leaderboard — ${leagueConfig.name}`,
                desc: `No players ranked yet!\n\nBe the first to set a defense and play ${PVP_SETTINGS.minGamesForLeaderboard} games to appear on the leaderboard.`,
                author: message.author
            });
            embed.embed.color = leagueConfig.color;
            return embed.sendMessage();
        }
        
        // Find player's rank
        const playerPvP = await pvpModel.findOne({ userID: message.author.id });
        let playerRank = null;
        let playerStats = null;
        
        if (playerPvP) {
            playerStats = playerPvP.leagueStats[leagueName];
            const totalGames = playerStats.attackWins + playerStats.attackLosses;
            
            if (totalGames >= PVP_SETTINGS.minGamesForLeaderboard) {
                const higherRated = await pvpModel.countDocuments({
                    [`leagueStats.${leagueName}.rating`]: { $gt: playerStats.rating }
                });
                playerRank = higherRated + 1;
            }
        }
        
        // Build leaderboard display
        let desc = "";
        
        // Pagination
        const pageSize = 10;
        let page = 0;
        const totalPages = Math.ceil(leaderboard.length / pageSize);
        
        async function getPageContent(pageNum) {
            const start = pageNum * pageSize;
            const end = Math.min(start + pageSize, leaderboard.length);
            const pageEntries = leaderboard.slice(start, end);
            
            let content = "";
            
            for (let i = 0; i < pageEntries.length; i++) {
                const entry = pageEntries[i];
                const rank = start + i + 1;
                const user = await bot.users.fetch(entry.userID).catch(() => null);
                const username = user ? user.username : `User ${entry.userID.slice(-4)}`;
                
                const winRate = getWinRate(entry.wins, entry.losses);
                const isPlayer = entry.userID === message.author.id;
                
                // Rank medals
                let rankDisplay = `${rank}.`;
                if (rank === 1) rankDisplay = "🥇";
                else if (rank === 2) rankDisplay = "🥈";
                else if (rank === 3) rankDisplay = "🥉";
                
                content += `${rankDisplay} ${isPlayer ? "**" : ""}${username}${isPlayer ? " (You)**" : ""}\n`;
                content += `   Rating: **${entry.rating}** | W/L: ${entry.wins}-${entry.losses} (${winRate}%)\n`;
                
                if (entry.winStreak > 0) {
                    content += `   🔥 Streak: ${entry.winStreak}\n`;
                }
                content += `\n`;
            }
            
            return content;
        }
        
        desc = await getPageContent(page);
        
        // Add player info if not on first page
        if (playerRank && playerRank > pageSize) {
            desc += `\n---\n`;
            desc += `**Your Rank: #${playerRank}**\n`;
            desc += `Rating: ${playerStats.rating} | W/L: ${playerStats.attackWins}-${playerStats.attackLosses}\n`;
        }
        
        const embed = new InfoMessage({
            channel: message.channel,
            title: `🏆 Leaderboard — ${leagueConfig.name}`,
            desc: desc,
            author: message.author,
            footer: `Page ${page + 1}/${totalPages} | Min ${PVP_SETTINGS.minGamesForLeaderboard} games to rank`
        });
        
        embed.embed.color = leagueConfig.color;
        
        // Add pagination buttons if multiple pages
        let currentMessage;
        
        if (totalPages > 1) {
            const { prev, next, close } = getPvPButtons("pvp_pagination");
            prev.setDisabled(page === 0);
            next.setDisabled(page >= totalPages - 1);
            
            const row = new ActionRowBuilder().addComponents(prev, next, close);
            currentMessage = await embed.sendMessage({ buttons: [row], preserve: true });
            
            const filter = button => button.user.id === message.author.id;
            const collector = message.channel.createMessageComponentCollector({
                filter,
                time: 60000
            });
            
            collector.on("collect", async (button) => {
                try {
                    await button.deferUpdate().catch(() => {});
                    
                    if (button.customId === "pvp_prev_page" && page > 0) {
                        page--;
                    } else if (button.customId === "pvp_next_page" && page < totalPages - 1) {
                        page++;
                    } else if (button.customId === "pvp_close") {
                        collector.stop("closed");
                        return currentMessage?.removeButtons();
                    }
                    
                    // Update embed
                    const newContent = await getPageContent(page);
                    embed.editEmbed({ 
                        desc: playerRank && playerRank > (page + 1) * pageSize 
                            ? newContent + `\n---\n**Your Rank: #${playerRank}**\nRating: ${playerStats.rating}`
                            : newContent,
                        footer: `Page ${page + 1}/${totalPages} | Min ${PVP_SETTINGS.minGamesForLeaderboard} games to rank`
                    });
                    
                    // Update buttons
                    prev.setDisabled(page === 0);
                    next.setDisabled(page >= totalPages - 1);
                    const newRow = new ActionRowBuilder().addComponents(prev, next, close);
                    
                    currentMessage = await embed.sendMessage({ currentMessage, buttons: [newRow], preserve: true });
                } catch (err) {
                    console.error("Leaderboard pagination error:", err);
                }
            });
            
            collector.on("end", () => {
                currentMessage?.removeButtons();
            });
        } else {
            await embed.sendMessage();
        }
    }
};
