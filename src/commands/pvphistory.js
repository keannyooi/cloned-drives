"use strict";

const bot = require("../config/config.js");
const { ActionRowBuilder } = require("discord.js");
const { InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { 
    PVP_LEAGUES, 
    LEAGUE_ORDER,
    getLeague
} = require("../util/consts/pvpConfig.js");
const getPvPButtons = require("../util/functions/getPvPButtons.js");
const pvpModel = require("../models/pvpSchema.js");

module.exports = {
    name: "pvphistory",
    aliases: ["pvph", "pvplog", "pvpbattles"],
    usage: ["[league]"],
    args: 0,
    category: "PvP",
    cooldown: 5,
    description: "View your recent PvP battle history.",
    
    async execute(message, args) {
        const pvpProfile = await pvpModel.findOne({ userID: message.author.id });
        
        if (!pvpProfile || pvpProfile.battleLog.length === 0) {
            const embed = new InfoMessage({
                channel: message.channel,
                title: "📜 PvP Battle History",
                desc: "You haven't fought any PvP battles yet!\n\nUse `cd-pvpattack <league>` to start battling.",
                author: message.author
            });
            return embed.sendMessage();
        }
        
        // Filter by league if specified
        let battles = pvpProfile.battleLog;
        let leagueFilter = null;
        
        if (args.length > 0) {
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
            
            leagueFilter = leagueName;
            battles = battles.filter(b => b.league === leagueName);
            
            if (battles.length === 0) {
                const embed = new InfoMessage({
                    channel: message.channel,
                    title: `📜 Battle History — ${leagueConfig.name}`,
                    desc: `No battles in ${leagueConfig.name} yet!`,
                    author: message.author
                });
                embed.embed.color = leagueConfig.color;
                return embed.sendMessage();
            }
        }
        
        // Pagination
        const pageSize = 5;
        let page = 0;
        const totalPages = Math.ceil(battles.length / pageSize);
        
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID) || "💰";
        const trophyEmoji = bot.emojis.cache.get(trophyEmojiID) || "🏆";
        
        async function getPageContent(pageNum) {
            const start = pageNum * pageSize;
            const end = Math.min(start + pageSize, battles.length);
            const pageBattles = battles.slice(start, end);
            
            let content = "";
            
            for (const battle of pageBattles) {
                const leagueConfig = PVP_LEAGUES[battle.league];
                const timestamp = new Date(battle.timestamp);
                const timeAgo = getTimeAgo(timestamp);
                
                // Get opponent name
                let oppName;
                if (battle.opponentID === "ghost") {
                    oppName = battle.opponentName;
                } else {
                    const user = await bot.users.fetch(battle.opponentID).catch(() => null);
                    oppName = user ? user.username : `User ${battle.opponentID.slice(-4)}`;
                }
                
                // Result icon
                const resultIcon = battle.won ? "✅" : "❌";
                const roleText = battle.wasAttacker ? "⚔️ Attack" : "🛡️ Defense";
                
                content += `${resultIcon} **${battle.won ? "Victory" : "Defeat"}** vs ${oppName}\n`;
                content += `   ${roleText} | ${leagueConfig?.name || battle.league} | ${battle.score}\n`;
                
                if (battle.ratingChange !== 0) {
                    const ratingText = battle.ratingChange > 0 ? `+${battle.ratingChange}` : `${battle.ratingChange}`;
                    content += `   📈 Rating: ${ratingText}`;
                }
                
                if (battle.rewards && (battle.rewards.money > 0 || battle.rewards.trophies > 0)) {
                    if (battle.ratingChange !== 0) content += " | ";
                    else content += "   ";
                    
                    if (battle.rewards.money > 0) {
                        content += `${moneyEmoji}${battle.rewards.money.toLocaleString()}`;
                    }
                    if (battle.rewards.trophies > 0) {
                        content += ` ${trophyEmoji}${battle.rewards.trophies}`;
                    }
                }
                
                content += `\n   *${timeAgo}*\n\n`;
            }
            
            return content;
        }
        
        const desc = await getPageContent(page);
        
        // Calculate stats
        const wins = battles.filter(b => b.won).length;
        const losses = battles.length - wins;
        const attackWins = battles.filter(b => b.wasAttacker && b.won).length;
        const attackLosses = battles.filter(b => b.wasAttacker && !b.won).length;
        const defenseWins = battles.filter(b => !b.wasAttacker && b.won).length;
        const defenseLosses = battles.filter(b => !b.wasAttacker && !b.won).length;
        
        let statsLine = `**Overall:** ${wins}W - ${losses}L`;
        if (attackWins + attackLosses > 0) {
            statsLine += ` | ⚔️ ${attackWins}-${attackLosses}`;
        }
        if (defenseWins + defenseLosses > 0) {
            statsLine += ` | 🛡️ ${defenseWins}-${defenseLosses}`;
        }
        
        const title = leagueFilter 
            ? `📜 Battle History — ${PVP_LEAGUES[leagueFilter].name}`
            : "📜 PvP Battle History";
        
        const embed = new InfoMessage({
            channel: message.channel,
            title: title,
            desc: `${statsLine}\n\n${desc}`,
            author: message.author,
            footer: `Page ${page + 1}/${totalPages} | Showing last ${battles.length} battles`
        });
        
        if (leagueFilter) {
            embed.embed.color = PVP_LEAGUES[leagueFilter].color;
        }
        
        // Pagination
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
                    
                    const newContent = await getPageContent(page);
                    embed.editEmbed({ 
                        desc: `${statsLine}\n\n${newContent}`,
                        footer: `Page ${page + 1}/${totalPages} | Showing last ${battles.length} battles`
                    });
                    
                    prev.setDisabled(page === 0);
                    next.setDisabled(page >= totalPages - 1);
                    const newRow = new ActionRowBuilder().addComponents(prev, next, close);
                    
                    currentMessage = await embed.sendMessage({ currentMessage, buttons: [newRow], preserve: true });
                } catch (err) {
                    console.error("History pagination error:", err);
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

/**
 * Get human-readable time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
}
