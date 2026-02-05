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
const { getCurrentSeason, isSeasonActive, getMostRecentSeason } = require("../util/consts/pvpSeasons.js");
const { isCarBanned, getBanReason } = require("../util/consts/pvpBans.js");
const { 
    validatePvPHand,
    getMaxAllowedCR,
    getBaseCarID,
    getEffectiveCR,
    calculateTotalCR,
    generateDefenseDisplay,
    validateCarOwnership
} = require("../util/functions/pvpUtils.js");
const carNameGen = require("../util/functions/carNameGen.js");
const searchGarage = require("../util/functions/searchGarage.js");
const selectUpgrade = require("../util/functions/selectUpgrade.js");
const getPvPButtons = require("../util/functions/getPvPButtons.js");
const filterCheck = require("../util/functions/filterCheck.js");
const reqDisplay = require("../util/functions/reqDisplay.js");
const pvpModel = require("../models/pvpSchema.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "pvpdefense",
    aliases: ["pvpdef", "pvpd"],
    usage: ["<league>"],
    args: 1,
    category: "PvP",
    cooldown: 10,
    description: "Set your defense lineup for a PvP league. Your defense protects your rating when attacked.",
    
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
        
        const season = getCurrentSeason();
        const existingDefense = pvpProfile.leagueStats[leagueName]?.defense || [];
        
        // If defense exists, show it first and ask if they want to change
        if (existingDefense.length === 5) {
            const { lines, totalCR } = generateDefenseDisplay(existingDefense);
            
            const confirmEmbed = new InfoMessage({
                channel: message.channel,
                title: `🛡️ Current Defense — ${leagueConfig.name}`,
                desc: `You already have a defense set:\n\n${lines.join("\n")}\n\n**Total CR:** ${totalCR}\n\nDo you want to change it?`,
                author: message.author
            });
            confirmEmbed.embed.color = leagueConfig.color;
            
            const { confirm: editBtn, cancel: keepBtn } = getPvPButtons("pvp_defense_confirm");
            
            const row = new ActionRowBuilder().addComponents(editBtn, keepBtn);
            const confirmMessage = await confirmEmbed.sendMessage({ buttons: [row] });
            
            try {
                const response = await confirmMessage.message.awaitMessageComponent({
                    filter: i => i.user.id === message.author.id,
                    time: 30000
                });
                
                await response.deferUpdate().catch(() => {});
                
                if (response.customId === "pvp_cancel") {
                    const keptEmbed = new InfoMessage({
                        channel: message.channel,
                        title: "Defense Unchanged",
                        desc: "Your defense remains the same.",
                        author: message.author
                    });
                    return keptEmbed.sendMessage({ currentMessage: confirmMessage });
                }
                
                // Continue to setup flow with existing defense pre-filled
                await defenseSetupFlow(message, profile, pvpProfile, leagueName, leagueConfig, season, confirmMessage, existingDefense);
                
            } catch (err) {
                // Timeout - keep existing
                const timeoutEmbed = new InfoMessage({
                    channel: message.channel,
                    title: "Defense Unchanged",
                    desc: "No response - your defense remains the same.",
                    author: message.author
                });
                return timeoutEmbed.sendMessage({ currentMessage: confirmMessage });
            }
        } else {
            // No existing defense, go straight to setup
            await defenseSetupFlow(message, profile, pvpProfile, leagueName, leagueConfig, season, null, []);
        }
    }
};

async function defenseSetupFlow(message, profile, pvpProfile, leagueName, leagueConfig, season, existingMessage = null, prefillDefense = []) {
    const selectedCars = [];
    let totalCR = 0;
    let currentMessage = existingMessage;
    const warnings = [];
    
    // Pre-fill with existing defense if provided
    if (prefillDefense && prefillDefense.length > 0) {
        for (const car of prefillDefense) {
            const carData = getCar(car.carID);
            if (!carData) {
                warnings.push(`⚠️ Unknown car removed from defense`);
                continue;
            }
            
            // Get effective CR (handles BM cars)
            const carCR = getEffectiveCR(car.carID);
            const carName = carNameGen({ currentCar: carData, upgrade: car.upgrade, rarity: true });
            const baseCarID = getBaseCarID(car.carID);
            
            // Check if car is now banned (check both car and base car)
            if (isCarBanned(car.carID, leagueName, season.id) || isCarBanned(baseCarID, leagueName, season.id)) {
                warnings.push(`🚫 ${carName} is now BANNED - removed`);
                continue;
            }
            
            // Check season filter
            const seasonFilter = season.filter;
            if (seasonFilter && Object.keys(seasonFilter).length > 0) {
                if (!filterCheck({ car, filter: seasonFilter, applyOrLogic: true })) {
                    warnings.push(`⚠️ ${carName} doesn't meet season requirements - removed`);
                    continue;
                }
            }
            
            // Check CR range
            if (carCR < leagueConfig.minCarCR || carCR > leagueConfig.maxCarCR) {
                warnings.push(`⚠️ ${carName} (CR ${carCR}) outside CR range - removed`);
                continue;
            }
            
            // Check duplicate limit using BASE car ID
            const currentCount = selectedCars.filter(c => getBaseCarID(c.carID) === baseCarID).length;
            if (currentCount >= leagueConfig.maxDuplicates) {
                warnings.push(`⚠️ ${carName} exceeds duplicate limit - removed`);
                continue;
            }
            
            // Car is valid, add it
            selectedCars.push({
                carID: car.carID,
                upgrade: car.upgrade || "000"
            });
            totalCR += carCR;
        }
    }
    
    const minCR = leagueConfig.minCarCR;
    const maxCR = leagueConfig.maxCarCR === Infinity ? "∞" : leagueConfig.maxCarCR;
    
    // Build initial warning message if any cars were invalid
    let initialWarnings = "";
    if (warnings.length > 0) {
        initialWarnings = warnings.join("\n");
    }
    
    // Display current selection state
    async function updateDisplay(additionalInfo = "") {
        const maxTotalCR = leagueConfig.maxTotalCR === Infinity ? "∞" : leagueConfig.maxTotalCR;
        const remainingCR = leagueConfig.maxTotalCR === Infinity ? "∞" : (leagueConfig.maxTotalCR - totalCR);
        
        let desc = `**Rules:**\n`;
        desc += `• CR Range per car: ${minCR} - ${maxCR}\n`;
        desc += `• Max total CR: ${maxTotalCR}\n`;
        desc += `• Max duplicates: ${leagueConfig.maxDuplicates} per car\n`;
        
        // Show season filter if any
        const seasonFilter = season.filter;
        if (seasonFilter && Object.keys(seasonFilter).length > 0) {
            desc += `• **Season Reqs:** \`${reqDisplay(seasonFilter, true)}\`\n`;
        }
        
        desc += `\n`;
        desc += `**Track Pool this Season:** ${season.trackPool.surfaces.join(", ")}\n\n`;
        
        if (selectedCars.length === 0) {
            desc += `**Current Selection:** (empty)\n\n`;
        } else {
            desc += `**Current Selection:**\n`;
            for (let i = 0; i < selectedCars.length; i++) {
                const car = selectedCars[i];
                const carData = getCar(car.carID);
                const carName = carNameGen({ currentCar: carData, upgrade: car.upgrade, rarity: true });
                const cr = getEffectiveCR(car.carID);
                
                // Check duplicate status using BASE car ID
                const baseCarID = getBaseCarID(car.carID);
                const count = selectedCars.filter(c => getBaseCarID(c.carID) === baseCarID).length;
                const dupWarning = count >= leagueConfig.maxDuplicates ? " ⚠️" : "";
                
                desc += `${i + 1}. ${carName} — CR ${cr}${dupWarning}\n`;
            }
            desc += `\n`;
        }
        
        // CR Budget display
        desc += `**CR Budget:** ${totalCR} / ${maxTotalCR}`;
        if (leagueConfig.maxTotalCR !== Infinity) {
            desc += ` (${remainingCR} remaining)`;
            
            // Show max allowed for next car if limited
            if (selectedCars.length < 5) {
                const slotsLeft = 5 - selectedCars.length;
                const maxAllowed = getMaxAllowedCR(totalCR, leagueName, slotsLeft);
                if (maxAllowed < leagueConfig.maxCarCR) {
                    desc += `\n⚠️ Next car limited to **CR ${maxAllowed}** or below`;
                }
            }
        }
        
        if (additionalInfo) {
            desc += `\n\n${additionalInfo}`;
        }
        
        const slotsRemaining = 5 - selectedCars.length;
        let footerText = "";
        if (slotsRemaining > 0) {
            footerText = `Type a car name to add (${slotsRemaining} slot${slotsRemaining !== 1 ? "s" : ""} remaining)`;
        } else {
            footerText = "All 5 slots filled! Click Save Defense to confirm.";
        }
        
        const embed = new InfoMessage({
            channel: message.channel,
            title: `🛡️ Set Defense — ${leagueConfig.name}`,
            desc: desc,
            author: message.author,
            footer: footerText
        });
        
        embed.embed.color = leagueConfig.color;
        
        // Add buttons
        const { save, clear, cancel } = getPvPButtons("pvp_defense_setup");
        
        // Disable save if not 5 cars
        save.setDisabled(selectedCars.length !== 5);
        
        // Disable clear if nothing selected
        clear.setDisabled(selectedCars.length === 0);
        
        const buttonRow = new ActionRowBuilder().addComponents(save, clear, cancel);
        
        // Add remove buttons if cars selected
        const rows = [buttonRow];
        if (selectedCars.length > 0) {
            const { remove1, remove2, remove3, remove4, remove5 } = getPvPButtons("pvp_car_actions");
            const removeButtons = [remove1, remove2, remove3, remove4, remove5].slice(0, selectedCars.length);
            const removeRow = new ActionRowBuilder().addComponents(...removeButtons);
            rows.push(removeRow);
        }
        
        currentMessage = await embed.sendMessage({ currentMessage, buttons: rows, preserve: true });
        return currentMessage;
    }
    
    // Initial display - show warnings if any cars were invalid
    let initialMessage = "Type a car name from your garage to add it.";
    if (initialWarnings) {
        initialMessage = initialWarnings + "\n\n" + initialMessage;
    }
    currentMessage = await updateDisplay(initialMessage);
    
    // Collectors
    const messageFilter = response => response.author.id === message.author.id;
    const buttonFilter = button => {
        // Only catch PvP-specific buttons, let searchGarage/selectUpgrade handle their own
        return button.user.id === message.author.id && button.customId.startsWith("pvp_");
    };
    
    let active = true;
    
    // Button collector
    const buttonCollector = message.channel.createMessageComponentCollector({
        filter: buttonFilter,
        time: PVP_SETTINGS.carSelectTimeout * 5 // Extended timeout for setup
    });
    
    buttonCollector.on("collect", async (button) => {
        try {
            // Try to defer, but don't crash if already acknowledged
            await button.deferUpdate().catch(() => {});
            
            if (button.customId === "pvp_save_defense") {
                if (selectedCars.length !== 5) {
                    await button.followUp({ content: "You need exactly 5 cars!", ephemeral: true });
                    return;
                }
                
                // Final validation
                const validation = validatePvPHand(selectedCars, leagueName, season.id);
                if (!validation.valid) {
                    await button.followUp({ 
                        content: `**Cannot save defense:**\n${validation.errors.join("\n")}`, 
                        ephemeral: true 
                    });
                    return;
                }
                
                // Verify ownership
                const ownership = validateCarOwnership(selectedCars, profile.garage);
                if (!ownership.valid) {
                    await button.followUp({ 
                        content: `**Ownership error:**\n${ownership.errors.join("\n")}`, 
                        ephemeral: true 
                    });
                    return;
                }
                
                // Save defense
                active = false;
                buttonCollector.stop("saved");
                
                // Use the setDefense method for proper persistence
                console.log(`[PvP Defense] Attempting save for ${message.author.id} in ${leagueName}`);
                console.log(`[PvP Defense] selectedCars:`, JSON.stringify(selectedCars));
                
                pvpProfile.setDefense(leagueName, selectedCars);
                
                console.log(`[PvP Defense] After setDefense, defense is:`, JSON.stringify(pvpProfile.leagueStats[leagueName]?.defense));
                
                try {
                    await pvpProfile.save();
                    console.log(`[PvP Defense] Save successful for ${message.author.id}`);
                    
                    // Verify it saved by re-fetching
                    const verifyProfile = await pvpModel.findOne({ userID: message.author.id });
                    console.log(`[PvP Defense] Verification - defense after save:`, JSON.stringify(verifyProfile?.leagueStats[leagueName]?.defense));
                    
                    const { lines, totalCR: finalCR } = generateDefenseDisplay(selectedCars);
                    
                    const successEmbed = new SuccessMessage({
                        channel: message.channel,
                        title: `🛡️ Defense Saved — ${leagueConfig.name}`,
                        desc: `Your defense has been set!\n\n${lines.join("\n")}\n\n**Total CR:** ${finalCR}`,
                        author: message.author
                    });
                    
                    return successEmbed.sendMessage({ currentMessage });
                    
                } catch (saveErr) {
                    console.error(`[PvP Defense] Save FAILED for ${message.author.id}:`, saveErr);
                    
                    const errorEmbed = new ErrorMessage({
                        channel: message.channel,
                        title: "Save Failed",
                        desc: "There was an error saving your defense. Please try again.",
                        author: message.author
                    });
                    
                    return errorEmbed.sendMessage({ currentMessage });
                }
            }
            
            if (button.customId === "pvp_clear_defense") {
                selectedCars.length = 0;
                totalCR = 0;
                currentMessage = await updateDisplay("All cars cleared. Type a car name to start over.");
                return;
            }
            
            if (button.customId === "pvp_cancel") {
                active = false;
                buttonCollector.stop("cancelled");
                
                const cancelEmbed = new InfoMessage({
                    channel: message.channel,
                    title: "Defense Setup Cancelled",
                    desc: "Your defense was not changed.",
                    author: message.author
                });
                return cancelEmbed.sendMessage({ currentMessage });
            }
            
            // Remove buttons
            if (button.customId.startsWith("pvp_remove_")) {
                const index = parseInt(button.customId.split("_")[2]) - 1;
                if (index >= 0 && index < selectedCars.length) {
                    const removed = selectedCars.splice(index, 1)[0];
                    const removedCar = getCar(removed.carID);
                    totalCR -= (removedCar.cr || 0);
                    
                    const carName = carNameGen({ currentCar: removedCar });
                    currentMessage = await updateDisplay(`✅ Removed ${carName}`);
                }
                return;
            }
        } catch (err) {
            console.error("PvP defense button error:", err);
        }
    });
    
    // Message collector for car input
    const messageCollector = message.channel.createMessageCollector({
        filter: messageFilter,
        time: PVP_SETTINGS.carSelectTimeout * 5
    });
    
    messageCollector.on("collect", async (msg) => {
        if (!active) return;
        
        try {
            // Delete user message
            if (message.channel.type !== 1) {
                msg.delete().catch(() => {});
            }
            
            const input = msg.content.toLowerCase().trim();
            
            // Special commands
            if (input === "done" || input === "save") {
                if (selectedCars.length === 5) {
                    // Trigger save
                    const saveEvent = { customId: "pvp_save_defense", deferUpdate: async () => {}, followUp: async (opts) => msg.channel.send(opts) };
                    buttonCollector.emit("collect", saveEvent);
                }
                return;
            }
            
            if (input === "clear") {
                selectedCars.length = 0;
                totalCR = 0;
                currentMessage = await updateDisplay("All cars cleared.");
                return;
            }
            
            if (input === "cancel") {
                active = false;
                buttonCollector.stop("cancelled");
                messageCollector.stop("cancelled");
                
                const cancelEmbed = new InfoMessage({
                    channel: message.channel,
                    title: "Defense Setup Cancelled",
                    desc: "Your defense was not changed.",
                    author: message.author
                });
                return cancelEmbed.sendMessage({ currentMessage });
            }
            
            // Check if slots full
            if (selectedCars.length >= 5) {
                currentMessage = await updateDisplay("⚠️ All 5 slots filled! Remove a car or click Save Defense.");
                return;
            }
            
            // Search garage for car
            let query, searchByID = false;
            if (input.startsWith("-c")) {
                query = [input.slice(2)];
                searchByID = true;
            } else {
                query = input.split(" ");
            }
            
            // Filter garage to only show valid cars for this league
            const slotsRemaining = 5 - selectedCars.length;
            const maxAllowedCR = getMaxAllowedCR(totalCR, leagueName, slotsRemaining);
            
            const validGarage = profile.garage.filter(car => {
                const carData = getCar(car.carID);
                if (!carData) return false;
                
                // Get effective CR (handles BM cars with CR 0)
                const carCR = getEffectiveCR(car.carID);
                
                // Check season filter (make, country, etc.)
                const seasonFilter = season.filter;
                if (seasonFilter && Object.keys(seasonFilter).length > 0) {
                    if (!filterCheck({ car, filter: seasonFilter, applyOrLogic: true })) {
                        return false;
                    }
                }
                
                // Check CR range for this league (min and max per car)
                if (carCR < leagueConfig.minCarCR) {
                    return false;
                }
                if (carCR > leagueConfig.maxCarCR) {
                    return false;
                }
                
                // Check if adding would exceed CR budget
                if (carCR > maxAllowedCR) {
                    return false;
                }
                
                // Check if banned (check both the car and its base car)
                const baseCarID = getBaseCarID(car.carID);
                if (isCarBanned(car.carID, leagueName, season.id) || isCarBanned(baseCarID, leagueName, season.id)) {
                    return false;
                }
                
                // Check OWNERSHIP - can't use more copies than you own (across all tunes)
                const totalOwned = Object.values(car.upgrades || {}).reduce((sum, count) => sum + count, 0);
                const selectedCount = selectedCars.filter(c => c.carID === car.carID).length;
                if (selectedCount >= totalOwned) {
                    return false;
                }
                
                // Check duplicate limit using BASE car ID (so BM + base car count together)
                const baseSelectedCount = selectedCars.filter(c => getBaseCarID(c.carID) === baseCarID).length;
                if (baseSelectedCount >= leagueConfig.maxDuplicates) return false;
                
                return true;
            });
            
            console.log(`[PvP Defense] Filter: ${validGarage.length} valid cars out of ${profile.garage.length} (CR range: ${leagueConfig.minCarCR}-${leagueConfig.maxCarCR}, max allowed: ${maxAllowedCR})`);
            
            if (validGarage.length === 0) {
                currentMessage = await updateDisplay("⚠️ No valid cars available! Check CR limits and duplicates.");
                return;
            }
            
            // Search
            const searchResult = await searchGarage({
                message,
                query,
                garage: validGarage,
                amount: 1,
                searchByID,
                currentMessage
            });
            
            if (!Array.isArray(searchResult)) {
                // Search failed or cancelled - immediately update display
                currentMessage = await updateDisplay("Search cancelled. Type another car name.");
                return;
            }
            
            const [selectedGarageCar, newCurrentMessage] = searchResult;
            
            // Update currentMessage reference for next operation
            if (newCurrentMessage?.message) {
                currentMessage = newCurrentMessage;
            }
            
            // Create a copy of the car with reduced upgrade counts based on what's already selected
            // This prevents selecting the same tune multiple times if you only own 1
            const adjustedCar = {
                ...selectedGarageCar,
                upgrades: { ...selectedGarageCar.upgrades }
            };
            
            // Reduce counts for already-selected upgrades of this car
            for (const selected of selectedCars) {
                if (selected.carID === selectedGarageCar.carID) {
                    if (adjustedCar.upgrades[selected.upgrade] > 0) {
                        adjustedCar.upgrades[selected.upgrade]--;
                    }
                }
            }
            
            // Now select upgrade (will only show upgrades with count >= 1)
            const upgradeResult = await selectUpgrade({
                message,
                currentCar: adjustedCar,
                amount: 1,
                currentMessage
            });
            
            if (!Array.isArray(upgradeResult)) {
                // Upgrade selection cancelled - immediately update display
                currentMessage = await updateDisplay("Upgrade selection cancelled. Type another car name.");
                return;
            }
            
            const [selectedUpgrade, upgradeMessage] = upgradeResult;
            
            // Update currentMessage reference
            if (upgradeMessage?.message) {
                currentMessage = upgradeMessage;
            }
            
            // Safety check: verify user actually owns this car at this tune
            const actualOwned = selectedGarageCar.upgrades?.[selectedUpgrade] || 0;
            const alreadyUsed = selectedCars.filter(c => c.carID === selectedGarageCar.carID && c.upgrade === selectedUpgrade).length;
            
            if (alreadyUsed >= actualOwned) {
                currentMessage = await updateDisplay(`⚠️ You don't have another ${selectedUpgrade} tune available for this car!`);
                return;
            }
            
            // Add car to selection
            const carData = getCar(selectedGarageCar.carID);
            const carCR = getEffectiveCR(selectedGarageCar.carID);
            selectedCars.push({
                carID: selectedGarageCar.carID,
                upgrade: selectedUpgrade
            });
            totalCR += carCR;
            
            const carName = carNameGen({ currentCar: carData, upgrade: selectedUpgrade });
            console.log(`[PvP Defense] Added car: ${selectedGarageCar.carID} (CR ${carCR}), Total CR now: ${totalCR}`);
            currentMessage = await updateDisplay(`✅ Added ${carName} (CR ${carCR})`);
            
        } catch (err) {
            console.error("PvP defense message collector error:", err);
            currentMessage = await updateDisplay("⚠️ Error processing input. Try again.");
        }
    });
    
    buttonCollector.on("end", (collected, reason) => {
        active = false;
        messageCollector.stop(reason);
        
        if (reason === "time") {
            const timeoutEmbed = new InfoMessage({
                channel: message.channel,
                title: "Defense Setup Timed Out",
                desc: "Your defense was not changed.",
                author: message.author
            });
            timeoutEmbed.sendMessage({ currentMessage });
        }
    });
}
