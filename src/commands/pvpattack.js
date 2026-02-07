"use strict";

const bot = require("../config/config.js");
const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { InfoMessage, ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { getCar, getTrack } = require("../util/functions/dataManager.js");
const { moneyEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { 
    PVP_LEAGUES, 
    LEAGUE_ORDER, 
    PVP_SETTINGS,
    getLeague
} = require("../util/consts/pvpConfig.js");
const { getCurrentSeason, isSeasonActive, getMostRecentSeason } = require("../util/consts/pvpSeasons.js");
const { 
    findOpponents,
    calculateRatingChange,
    calculateRewards,
    selectBattleTracks,
    generateDefenseDisplay,
    getAttacksDisplay,
    getWinRate
} = require("../util/functions/pvpUtils.js");
const carNameGen = require("../util/functions/carNameGen.js");
const createCar = require("../util/functions/createCar.js");
const race = require("../util/functions/race.js");
const getPvPButtons = require("../util/functions/getPvPButtons.js");
const { trackMoneySpent, trackMoneyEarned, trackTrophiesEarned, trackPvPAttack } = require("../util/functions/tracker.js");
const pvpModel = require("../models/pvpSchema.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "pvpattack",
    aliases: ["pvpa", "pvpchallenge"],
    usage: ["<league>"],
    args: 1,
    category: "PvP",
    cooldown: 15,
    description: "Attack another player's defense in PvP. Your defense fights their defense - but you can reorder your cars!",
    
    async execute(message, args) {
        // Check if season is active
        if (!isSeasonActive()) {
            const recentSeason = getMostRecentSeason();
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "⏳ Off-Season",
                desc: `PvP is currently between seasons!\n\n**Last Season:** ${recentSeason.name}\n\nWait for the next season to begin, or check \`cd-pvpseason\` for updates.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        
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
        
        const profile = await profileModel.findOne({ userID: message.author.id });
        if (!profile) return;
        
        // Check garage requirement
        if (profile.garage.length < leagueConfig.minGarageSize) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "League Locked",
                desc: `You need at least **${leagueConfig.minGarageSize} cars** to access ${leagueConfig.name}.\n\nYou currently have **${profile.garage.length}** cars.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        
        // Get PvP profile
        let pvpProfile = await pvpModel.findOrCreate(message.author.id);
        
        // Check if player has a defense set
        const stats = pvpProfile.leagueStats[leagueName];
        if (!stats.defense || stats.defense.length !== 5) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "No Defense Set",
                desc: `You need to set a defense before you can attack!\n\nUse \`cd-pvpdefense ${leagueName}\` to set your 5-car lineup.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        
        // Check for attack reset
        if (pvpProfile.shouldResetAttacks(PVP_SETTINGS.attackResetHour)) {
            pvpProfile.attacksToday = 0;
            pvpProfile.lastAttackReset = new Date();
            await pvpProfile.save();
        }
        
        // Check daily attack limit
        if (pvpProfile.attacksToday >= PVP_SETTINGS.maxAttacksPerDay) {
            const attacksInfo = getAttacksDisplay(
                pvpProfile.attacksToday,
                PVP_SETTINGS.maxAttacksPerDay,
                pvpProfile.lastAttackReset
            );
            
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Daily Attack Limit Reached",
                desc: `You've used all ${PVP_SETTINGS.maxAttacksPerDay} attacks today.\n\nAttacks reset in **${attacksInfo.resetIn}**.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        
        const season = getCurrentSeason();
        
        // Check entry fee
        if (leagueConfig.entryFee > 0 && profile.money < leagueConfig.entryFee) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Insufficient Funds",
                desc: `${leagueConfig.name} requires ${moneyEmoji}${leagueConfig.entryFee.toLocaleString()} entry fee.\n\nYou have: ${moneyEmoji}${profile.money.toLocaleString()}`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        
        // Start attack flow
        await attackFlow(message, profile, pvpProfile, leagueName, leagueConfig, season);
    }
};

async function attackFlow(message, profile, pvpProfile, leagueName, leagueConfig, season) {
    const stats = pvpProfile.leagueStats[leagueName];
    const attacksInfo = getAttacksDisplay(
        pvpProfile.attacksToday,
        PVP_SETTINGS.maxAttacksPerDay,
        pvpProfile.lastAttackReset
    );
    
    // Find opponents
    const opponents = await findOpponents(pvpModel, message.author.id, leagueName, stats.rating);
    
    if (opponents.length === 0) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "No Opponents Found",
            desc: "Could not find any opponents. Try again later or try a different league.",
            author: message.author
        });
        return errorMessage.sendMessage();
    }
    
    const hasGhosts = opponents.some(o => o.isGhost);
    
    // Resolve opponent usernames
    for (const opp of opponents) {
        if (!opp.isGhost) {
            try {
                const user = await bot.users.fetch(opp.userID);
                opp.displayName = user.username;
            } catch {
                opp.displayName = `Player ${opp.userID.slice(-4)}`;
            }
        }
    }
    
    // Display opponent selection
    let desc = `**Your Rating:** ${stats.rating} | **Attacks Today:** ${attacksInfo.remaining}/${attacksInfo.total}\n\n`;
    
    if (hasGhosts) {
        desc += `⚠️ **No players available.** Racing ghost opponents.\n(Reduced rewards: ${Math.round(PVP_SETTINGS.ghostRewardMultiplier * 100)}% cash, no rating change)\n\n`;
    }
    
    for (let i = 0; i < opponents.length; i++) {
        const opp = opponents[i];
        const oppStats = opp.leagueStats[leagueName];
        
        // Calculate potential rating changes
        const { winnerChange, loserChange } = calculateRatingChange(stats.rating, oppStats.rating);
        const ratingText = opp.isGhost ? "(no rating change)" : `(+${winnerChange}/-${Math.abs(loserChange)})`;
        
        const totalCR = oppStats.defense.reduce((sum, car) => {
            const carData = getCar(car.carID);
            return sum + (carData?.cr || 0);
        }, 0);
        
        const avgCR = Math.round(totalCR / 5);
        const winRate = getWinRate(oppStats.attackWins || 0, oppStats.attackLosses || 0);
        
        desc += `**${i + 1}️⃣ ${opp.displayName}** — Rating: ${oppStats.rating} ${ratingText}\n`;
        desc += `   Defense CR: ${totalCR} (avg ${avgCR})`;
        if (oppStats.attackWins || oppStats.attackLosses) {
            desc += ` | W/L: ${oppStats.attackWins || 0}-${oppStats.attackLosses || 0} (${winRate}%)`;
        }
        desc += `\n\n`;
    }
    
    const selectEmbed = new InfoMessage({
        channel: message.channel,
        title: `⚔️ Choose Your Opponent — ${leagueConfig.name}`,
        desc: desc,
        author: message.author,
        footer: "Select an opponent to view their defense and arrange your attack order."
    });
    
    selectEmbed.embed.color = leagueConfig.color;
    
    // Add buttons
    const { opp1, opp2, opp3, refresh, cancel } = getPvPButtons("pvp_opponents");
    
    // Disable buttons for non-existent opponents
    if (opponents.length < 2) opp2.setDisabled(true);
    if (opponents.length < 3) opp3.setDisabled(true);
    
    const row = new ActionRowBuilder().addComponents(opp1, opp2, opp3, refresh, cancel);
    
    let currentMessage = await selectEmbed.sendMessage({ buttons: [row], preserve: true });
    
    const filter = button => button.user.id === message.author.id && button.customId.startsWith("pvp_");
    const collector = message.channel.createMessageComponentCollector({
        filter,
        time: PVP_SETTINGS.opponentSelectTimeout
    });
    
    let selectedOpponent = null;
    
    collector.on("collect", async (button) => {
        try {
            await button.deferUpdate().catch(() => {});
            
            if (button.customId === "pvp_cancel") {
                collector.stop("cancelled");
                const cancelEmbed = new InfoMessage({
                    channel: message.channel,
                    title: "Attack Cancelled",
                    desc: "No attacks were used.",
                    author: message.author
                });
                return cancelEmbed.sendMessage({ currentMessage });
            }
            
            if (button.customId === "pvp_refresh") {
                collector.stop("refresh");
                // Re-run the command
                return module.exports.execute(message, [leagueName]);
            }
            
            if (button.customId.startsWith("pvp_opp_")) {
                const index = parseInt(button.customId.split("_")[2]) - 1;
                if (index >= 0 && index < opponents.length) {
                    selectedOpponent = opponents[index];
                    collector.stop("selected");
                }
            }
        } catch (err) {
            console.error("PvP attack opponent select error:", err);
        }
    });
    
    collector.on("end", async (collected, reason) => {
        if (reason === "selected" && selectedOpponent) {
            await arrangeAttackOrder(message, profile, pvpProfile, leagueName, leagueConfig, season, selectedOpponent, currentMessage);
        } else if (reason === "time") {
            const timeoutEmbed = new InfoMessage({
                channel: message.channel,
                title: "Selection Timed Out",
                desc: "No attacks were used.",
                author: message.author
            });
            timeoutEmbed.sendMessage({ currentMessage });
        }
    });
}

async function arrangeAttackOrder(message, profile, pvpProfile, leagueName, leagueConfig, season, opponent, currentMessage) {
    const stats = pvpProfile.leagueStats[leagueName];
    const oppStats = opponent.leagueStats[leagueName];
    const settings = profile.settings || {};
    
    // Your defense cars (will be reordered)
    let attackOrder = [...stats.defense]; // Clone the array
    
    // Display opponent's defense
    const { lines: defenseLines, totalCR: defenseCR } = generateDefenseDisplay(oppStats.defense);
    
    async function updateArrangeDisplay(additionalInfo = "") {
        let desc = `**🛡️ ${opponent.displayName}'s DEFENSE:**\n`;
        for (let i = 0; i < oppStats.defense.length; i++) {
            const car = oppStats.defense[i];
            const carData = getCar(car.carID);
            const carName = carNameGen({ currentCar: carData, upgrade: car.upgrade, rarity: true });
            desc += `${i + 1}. ${carName}\n`;
        }
        
        desc += `\n**⚔️ YOUR ATTACK ORDER:**\n`;
        for (let i = 0; i < attackOrder.length; i++) {
            const car = attackOrder[i];
            const carData = getCar(car.carID);
            const carName = carNameGen({ currentCar: carData, upgrade: car.upgrade, rarity: true });
            desc += `${i + 1}. ${carName} → vs ${i + 1}\n`;
        }
        
        desc += `\n**Track Pool:** ${season.trackPool.name || season.trackPool.surfaces.join(", ")}\n`;
        desc += `\n💡 **Tip:** Use the dropdown to swap car positions to counter their lineup!`;
        
        if (additionalInfo) {
            desc += `\n\n${additionalInfo}`;
        }
        
        const embed = new InfoMessage({
            channel: message.channel,
            title: `⚔️ Arrange Attack Order — ${leagueConfig.name}`,
            desc: desc,
            author: message.author,
            footer: "Swap positions to optimize your matchups, then click Start Battle!"
        });
        
        embed.embed.color = leagueConfig.color;
        
        // Swap dropdown
        const swapOptions = [];
        for (let i = 0; i < 5; i++) {
            for (let j = i + 1; j < 5; j++) {
                swapOptions.push({
                    label: `Swap Position ${i + 1} ↔ ${j + 1}`,
                    value: `swap_${i}_${j}`,
                    description: `Move car ${i + 1} to slot ${j + 1} and vice versa`
                });
            }
        }
        
        const swapDropdown = new StringSelectMenuBuilder()
            .setCustomId("pvp_swap")
            .setPlaceholder("Swap car positions...")
            .addOptions(swapOptions);
        
        const dropdownRow = new ActionRowBuilder().addComponents(swapDropdown);
        
        // Battle buttons
        const { start, cancel } = getPvPButtons("pvp_battle");
        const buttonRow = new ActionRowBuilder().addComponents(start, cancel);
        
        currentMessage = await embed.sendMessage({ currentMessage, buttons: [dropdownRow, buttonRow], preserve: true });
        return currentMessage;
    }
    
    currentMessage = await updateArrangeDisplay();
    
    const filter = interaction => interaction.user.id === message.author.id;
    const collector = message.channel.createMessageComponentCollector({
        filter,
        time: PVP_SETTINGS.carSelectTimeout * 3
    });
    
    collector.on("collect", async (interaction) => {
        try {
            await interaction.deferUpdate().catch(() => {});
            
            if (interaction.customId === "pvp_swap") {
                const [, i, j] = interaction.values[0].split("_").map(Number);
                
                // Swap positions
                [attackOrder[i], attackOrder[j]] = [attackOrder[j], attackOrder[i]];
                
                const car1 = getCar(attackOrder[i].carID);
                const car2 = getCar(attackOrder[j].carID);
                await updateArrangeDisplay(`✅ Swapped ${carNameGen({ currentCar: car1 })} ↔ ${carNameGen({ currentCar: car2 })}`);
            }
            
            if (interaction.customId === "pvp_start_battle") {
                collector.stop("battle");
                await executeBattle(message, profile, pvpProfile, leagueName, leagueConfig, season, opponent, attackOrder, currentMessage);
            }
            
            if (interaction.customId === "pvp_cancel") {
                collector.stop("cancelled");
                const cancelEmbed = new InfoMessage({
                    channel: message.channel,
                    title: "Attack Cancelled",
                    desc: "No attacks were used.",
                    author: message.author
                });
                return cancelEmbed.sendMessage({ currentMessage });
            }
        } catch (err) {
            console.error("PvP arrange error:", err);
        }
    });
    
    collector.on("end", (collected, reason) => {
        if (reason === "time") {
            const timeoutEmbed = new InfoMessage({
                channel: message.channel,
                title: "Attack Setup Timed Out",
                desc: "No attacks were used.",
                author: message.author
            });
            timeoutEmbed.sendMessage({ currentMessage });
        }
    });
}

async function executeBattle(message, profile, pvpProfile, leagueName, leagueConfig, season, opponent, attackOrder, currentMessage) {
    const oppStats = opponent.leagueStats[leagueName];
    const settings = profile.settings || {};
    
    // Deduct entry fee
    if (leagueConfig.entryFee > 0) {
        await profileModel.updateOne(
            { userID: message.author.id },
            { $inc: { money: -leagueConfig.entryFee } }
        );
        trackMoneySpent(leagueConfig.entryFee);
    }
    
    // Increment attacks used (use atomic update to avoid VersionError on later save)
    pvpProfile.attacksToday++;
    await pvpModel.updateOne(
        { userID: pvpProfile.userID },
        { $inc: { attacksToday: 1 } }
    );
    
    // Select tracks for this battle
    const tracks = selectBattleTracks(PVP_SETTINGS.racesPerBattle);
    
    // Battle state
    let attackerWins = 0;
    let defenderWins = 0;
    const results = [];
    
    // Pre-battle display
    let battleDesc = `**⚔️ ${message.author.username} vs ${opponent.displayName}**\n\n`;
    battleDesc += `**YOUR ATTACK ORDER:**\n`;
    for (let i = 0; i < attackOrder.length; i++) {
        const carData = getCar(attackOrder[i].carID);
        battleDesc += `${i + 1}. ${carNameGen({ currentCar: carData, upgrade: attackOrder[i].upgrade })}\n`;
    }
    battleDesc += `\n**THEIR DEFENSE:**\n`;
    for (let i = 0; i < oppStats.defense.length; i++) {
        const carData = getCar(oppStats.defense[i].carID);
        battleDesc += `${i + 1}. ${carNameGen({ currentCar: carData, upgrade: oppStats.defense[i].upgrade })}\n`;
    }
    
    const battleEmbed = new InfoMessage({
        channel: message.channel,
        title: `⚔️ PvP Battle — ${leagueConfig.name}`,
        desc: battleDesc,
        author: message.author,
        footer: "Battle starting..."
    });
    
    battleEmbed.embed.color = leagueConfig.color;
    currentMessage = await battleEmbed.sendMessage({ currentMessage, preserve: true });
    
    // Run races
    for (let round = 0; round < PVP_SETTINGS.racesPerBattle; round++) {
        // Check if battle is already decided
        if (attackerWins >= PVP_SETTINGS.racesToWin || defenderWins >= PVP_SETTINGS.racesToWin) {
            break;
        }
        
        const track = tracks[round];
        const trackData = getTrack(track.trackID);
        
        if (!trackData) {
            console.error(`Track not found: ${track.trackID}`);
            continue;
        }
        
        // Create battle track with weather - MUST validate weather/surface compatibility
        const battleTrack = { ...trackData };
        
        // Surfaces that can have rain - others must stay Sunny
        const rainCompatibleSurfaces = ["Asphalt", "Track", "Drag", "Gravel", "Dirt"];
        
        if (track.weather === "Rainy" && !rainCompatibleSurfaces.includes(trackData.surface)) {
            // Invalid combo (e.g., "Rainy Snow") - force Sunny
            battleTrack.weather = "Sunny";
            console.warn(`[PvP] Corrected invalid weather: ${track.weather} ${trackData.surface} -> Sunny ${trackData.surface}`);
        } else if (track.weather) {
            battleTrack.weather = track.weather;
        }
        
        // Create car objects
        const [attackerCar] = createCar(attackOrder[round], settings.unitpreference);
        const [defenderCar] = createCar(oppStats.defense[round], settings.unitpreference);
        
        // Get car names for display
        const attackerCarData = getCar(attackOrder[round].carID);
        const defenderCarData = getCar(oppStats.defense[round].carID);
        
        // Show round info
        const roundEmbed = new InfoMessage({
            channel: message.channel,
            title: `Round ${round + 1} — ${battleTrack.trackName}`,
            desc: `**${carNameGen({ currentCar: attackerCarData })}** vs **${carNameGen({ currentCar: defenderCarData })}**\n\nConditions: ${battleTrack.weather} ${battleTrack.surface}`,
            author: message.author,
            thumbnail: battleTrack.map
        });
        await roundEmbed.sendMessage({ preserve: true });
        
        // Run the race
        const result = await race(message, attackerCar, defenderCar, battleTrack, settings.disablegraphics);
        
        if (result > 0) {
            attackerWins++;
            results.push({ round: round + 1, track: battleTrack.trackName, result: "WIN", margin: result });
        } else if (result < 0) {
            defenderWins++;
            results.push({ round: round + 1, track: battleTrack.trackName, result: "LOSS", margin: Math.abs(result) });
        } else {
            // Tie - neither side gets a point
            results.push({ round: round + 1, track: battleTrack.trackName, result: "TIE", margin: 0 });
        }
        
        // Brief pause between rounds
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // Battle complete - check for draw
    const attackerWon = attackerWins > defenderWins;
    const isDraw = attackerWins === defenderWins;
    const stats = pvpProfile.leagueStats[leagueName];
    
    // Calculate rating changes (no change on draw)
    let ratingChange = 0;
    if (!opponent.isGhost && !isDraw) {
        const { winnerChange, loserChange } = calculateRatingChange(
            attackerWon ? stats.rating : oppStats.rating,
            attackerWon ? oppStats.rating : stats.rating
        );
        ratingChange = attackerWon ? winnerChange : loserChange;
    }
    
    // Calculate rewards (attacker gets rewards even on draw)
    const rewardResult = isDraw ? true : attackerWon; // Draws count as "win" for reward purposes
    const rewards = calculateRewards(leagueName, rewardResult, opponent.isGhost, stats.winStreak);
    
    // Update attacker stats
    if (attackerWon) {
        stats.attackWins++;
        stats.winStreak++;
        if (stats.winStreak > stats.bestWinStreak) {
            stats.bestWinStreak = stats.winStreak;
        }
    } else if (isDraw) {
        // Draw - no win/loss counted, streak preserved
        stats.draws = (stats.draws || 0) + 1;
    } else {
        stats.attackLosses++;
        stats.winStreak = 0;
    }
    
    stats.rating += ratingChange;
    if (stats.rating > stats.peakRating) {
        stats.peakRating = stats.rating;
    }
    
    // Update global stats
    if (attackerWon) {
        pvpProfile.globalStats.totalAttackWins++;
    } else if (!isDraw) {
        pvpProfile.globalStats.totalAttackLosses++;
    }
    // Draws don't count as win or loss
    pvpProfile.globalStats.totalMoneyEarned += rewards.money;
    pvpProfile.globalStats.totalTrophiesEarned += rewards.trophies;
    
    // Add to battle log
    pvpProfile.addBattleLog({
        league: leagueName,
        opponentID: opponent.isGhost ? "ghost" : opponent.userID,
        opponentName: opponent.displayName,
        wasAttacker: true,
        won: attackerWon,
        isDraw,
        score: `${attackerWins}-${defenderWins}`,
        ratingChange,
        rewards
    });
    
    pvpProfile.markModified(`leagueStats.${leagueName}`);
    pvpProfile.markModified('globalStats');
    await pvpProfile.save();
    
    // Update defender (if not ghost)
    if (!opponent.isGhost) {
        const defenderPvP = await pvpModel.findOne({ userID: opponent.userID });
        if (defenderPvP) {
            const defStats = defenderPvP.leagueStats[leagueName];
            
            if (isDraw) {
                // Draw - no rating change, no win/loss counted
                defStats.draws = (defStats.draws || 0) + 1;
            } else if (attackerWon) {
                defStats.defenseLosses++;
                defStats.rating += ratingChange * -1; // Opposite of attacker
            } else {
                defStats.defenseWins++;
                defStats.rating += Math.abs(ratingChange);
            }
            
            if (defStats.rating > defStats.peakRating) {
                defStats.peakRating = defStats.rating;
            }
            
            // Build notification message
            let notifResult = attackerWon ? "won" : isDraw ? "drew" : "lost";
            let notifRating = isDraw 
                ? "No rating change" 
                : (attackerWon ? `Rating: ${ratingChange * -1}` : `Rating: +${Math.abs(ratingChange)}`);
            
            defenderPvP.addBattleLog({
                league: leagueName,
                opponentID: message.author.id,
                opponentName: message.author.username,
                wasAttacker: false,
                won: !attackerWon && !isDraw,
                isDraw,
                score: `${defenderWins}-${attackerWins}`,
                ratingChange: isDraw ? 0 : (attackerWon ? ratingChange * -1 : Math.abs(ratingChange)),
                rewards: { money: 0, trophies: 0 }
            });
            
            defenderPvP.addNotification(
                `⚔️ **${message.author.username}** attacked your ${leagueConfig.name} defense and ${notifResult} ${attackerWins}-${defenderWins}.\n${notifRating}`
            );
            
            defenderPvP.markModified(`leagueStats.${leagueName}`);
            await defenderPvP.save();
        }
    }
    
    // Track PvP result
    if (isDraw) trackPvPAttack("draw");
    else if (attackerWon) trackPvPAttack("win");
    else trackPvPAttack("loss");
    if (rewards.money > 0) trackMoneyEarned(rewards.money);
    if (rewards.trophies > 0) trackTrophiesEarned(rewards.trophies);

    // Add rewards to unclaimed (must be separate objects with reward type as first key)
    if (rewards.money > 0) {
        await profileModel.updateOne(
            { userID: message.author.id },
            {
                $push: {
                    unclaimedRewards: {
                        money: rewards.money,
                        origin: `PvP ${leagueConfig.name}`
                    }
                }
            }
        );
    }
    
    if (rewards.trophies > 0) {
        await profileModel.updateOne(
            { userID: message.author.id },
            {
                $push: {
                    unclaimedRewards: {
                        trophies: rewards.trophies,
                        origin: `PvP ${leagueConfig.name}`
                    }
                }
            }
        );
    }
    
    // Final result display
    const moneyEmoji = bot.emojis.cache.get(moneyEmojiID) || "💰";
    const trophyEmoji = bot.emojis.cache.get(trophyEmojiID) || "🏆";
    
    let resultDesc = `**Score: ${attackerWins}-${defenderWins}**\n\n`;
    
    for (const r of results) {
        const icon = r.result === "WIN" ? "✅" : r.result === "LOSS" ? "❌" : "➖";
        resultDesc += `${icon} Round ${r.round}: ${r.track} (${r.result}${r.margin > 0 ? ` by ${r.margin}` : ""})\n`;
    }
    
    resultDesc += `\n`;
    
    if (!opponent.isGhost) {
        if (isDraw) {
            resultDesc += `📈 **Rating:** ${stats.rating} (No change)\n`;
        } else {
            resultDesc += `📈 **Rating:** ${stats.rating - ratingChange} → ${stats.rating} (${ratingChange >= 0 ? "+" : ""}${ratingChange})\n`;
        }
    }
    
    resultDesc += `🔥 **Win Streak:** ${stats.winStreak}\n\n`;
    resultDesc += `💰 **Rewards:**\n`;
    resultDesc += `${moneyEmoji} ${rewards.money.toLocaleString()}\n`;
    resultDesc += `${trophyEmoji} ${rewards.trophies}\n`;
    resultDesc += `\nUse \`cd-rewards\` to claim!`;
    
    // Choose appropriate message class and title
    let ResultClass, resultTitle;
    if (isDraw) {
        ResultClass = InfoMessage;
        resultTitle = `🤝 DRAW! Evenly matched with ${opponent.displayName}`;
    } else if (attackerWon) {
        ResultClass = SuccessMessage;
        resultTitle = `🏆 VICTORY! You defeated ${opponent.displayName}`;
    } else {
        ResultClass = ErrorMessage;
        resultTitle = `💥 DEFEAT! ${opponent.displayName} defended successfully`;
    }
    
    const resultEmbed = new ResultClass({
        channel: message.channel,
        title: resultTitle,
        desc: resultDesc,
        author: message.author
    });
    
    return resultEmbed.sendMessage();
}
