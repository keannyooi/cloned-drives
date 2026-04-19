"use strict";

const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultWaitTime, defaultChoiceTime, diamondEmojiID, DIAMONDS_ENABLED } = require("../util/consts/consts.js");
const { getCarFiles, getCar } = require("../util/functions/dataManager.js");
const carNameGen = require("../util/functions/carNameGen.js");
const calcTotal = require("../util/functions/calcTotal.js");
const updateHands = require("../util/functions/updateHands.js");
const addCars = require("../util/functions/addCars.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const { getAvailableTunes } = require("../util/functions/calcTune.js");
const { trackExchange } = require("../util/functions/tracker.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "diamondexchange",
    aliases: ["dx", "diamondex"],
    usage: [],
    args: 0,
    category: "Gameplay",
    description: "Exchange a duplicate Diamond car for another Diamond car you don't own (within 50 CR and same tyre type).",
    async execute(message, args) {
        // Feature is paused until diamond cars are designed.
        if (!DIAMONDS_ENABLED) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Diamond Exchange is not available yet.",
                desc: "Diamond cars haven't launched in Cloned Drives yet. Stay tuned!",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const playerData = await profileModel.findOne({ userID: message.author.id });
        const carFiles = getCarFiles();

        // Step 1: Find all duplicate Diamond cars (diamonds where player owns more than 1)
        const duplicateDiamondCars = [];
        for (const garageCar of playerData.garage) {
            const carData = getCar(garageCar.carID);
            if (carData && carData.diamond === true && !carData.reference) {
                const totalOwned = calcTotal(garageCar);
                if (totalOwned > 1) {
                    duplicateDiamondCars.push({
                        garageCar,
                        carData,
                        totalOwned
                    });
                }
            }
        }

        // Step 2: Check if player has any duplicate Diamond cars
        if (duplicateDiamondCars.length === 0) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, you do not own any duplicate Diamond cars.",
                desc: "You need to own more than one of a Diamond car to exchange it. Diamond cars are sell- and fuse-protected, so exchanging is the only way to part with a duplicate.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        // Step 3: Create dropdown with duplicate Diamond cars
        const options = duplicateDiamondCars.map((item, index) => ({
            label: `${carNameGen({ currentCar: item.carData, removeDiamondTag: true })} (x${item.totalOwned})`,
            description: `CR: ${item.carData.cr} | ${item.carData.tyreType || "Standard"} tyres`,
            value: `${index}`,
            emoji: `<:Chips:${diamondEmojiID}>`
        }));

        const dropdownList = new StringSelectMenuBuilder()
            .setCustomId("diamondExchangeSelect")
            .setPlaceholder("Select a duplicate Diamond car to exchange...")
            .addOptions(...options);
        const row = new ActionRowBuilder().addComponents(dropdownList);

        const selectMessage = new InfoMessage({
            channel: message.channel,
            title: "💎 Diamond Car Exchange",
            desc: "Select a duplicate Diamond car you want to exchange.",
            author: message.author,
            footer: `You have been given ${defaultWaitTime / 1000} seconds to select.`
        });
        let currentMessage = await selectMessage.sendMessage({ buttons: [row], preserve: true });

        // Step 4: Wait for selection
        const filter = (interaction) => interaction.user.id === message.author.id && interaction.customId === "diamondExchangeSelect";

        try {
            const selection = await message.channel.awaitMessageComponent({
                filter,
                time: defaultWaitTime
            });
            await selection.deferUpdate();
            await currentMessage.removeButtons();

            const selectedIndex = parseInt(selection.values[0]);
            const selectedDuplicate = duplicateDiamondCars[selectedIndex];
            const selectedCarData = selectedDuplicate.carData;
            const selectedGarageCar = selectedDuplicate.garageCar;
            const selectedTyreType = selectedCarData.tyreType || "Standard";

            // Step 5: Ask player to type desired Diamond car
            const typeMessage = new InfoMessage({
                channel: message.channel,
                title: "Type out the Diamond car you want",
                desc: `You selected: **${carNameGen({ currentCar: selectedCarData, rarity: true })}**\n\nNow type the name of the Diamond car you want to receive.\nIt must be within ±50 CR of your selected car (CR ${selectedCarData.cr - 50} to ${selectedCarData.cr + 50}) and have the same tyre type (**${selectedTyreType}**).`,
                author: message.author,
                image: selectedCarData.racehud,
                footer: `You have been given ${defaultWaitTime / 1000} seconds to respond.`
            });
            currentMessage = await typeMessage.sendMessage({ currentMessage });

            // Step 6: Wait for player to type car name
            const messageFilter = (m) => m.author.id === message.author.id;

            try {
                const collected = await message.channel.awaitMessages({
                    filter: messageFilter,
                    max: 1,
                    time: defaultWaitTime,
                    errors: ["time"]
                });

                const userInput = collected.first().content.toLowerCase().split(" ");

                // Try to delete the user's message to keep chat clean
                try {
                    await collected.first().delete();
                } catch (e) {
                    // Ignore if we can't delete
                }

                // Step 7: Filter car files to ACTIVE Diamond cars within CR range AND same tyre type.
                // Inactive (limited-time / retired) diamonds cannot be exchanged TO, only FROM.
                const validDiamondCars = carFiles.filter(file => {
                    const carId = file.endsWith('.json') ? file.slice(0, -5) : file;
                    const car = getCar(carId);
                    if (!car || car.diamond !== true || car.reference) return false;
                    if (car.active === false) return false;
                    const crDiff = Math.abs(car.cr - selectedCarData.cr);
                    if (crDiff > 50) return false;
                    const carTyreType = car.tyreType || "Standard";
                    return carTyreType === selectedTyreType;
                });

                if (validDiamondCars.length === 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, no valid Diamond cars found.",
                        desc: `There are no other Diamond cars within the CR range with **${selectedTyreType}** tyres to exchange for.`,
                        author: message.author
                    });
                    return errorMessage.sendMessage({ currentMessage });
                }

                // Search for the car
                await new Promise(resolve => resolve(search(message, userInput, validDiamondCars, "car", currentMessage)))
                    .then(async (response) => {
                        if (!Array.isArray(response)) return;
                        let [carFile, currentMessage2] = response;
                        currentMessage = currentMessage2;

                        const desiredCarID = carFile.endsWith('.json') ? carFile.slice(0, -5) : carFile.slice(0, 6);
                        const desiredCar = getCar(desiredCarID);

                        // Step 8: Check if player already owns the desired car
                        const alreadyOwns = playerData.garage.find(c => c.carID === desiredCarID.slice(0, 6));
                        if (alreadyOwns && calcTotal(alreadyOwns) > 0) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Sorry, you can't trade for a Diamond car you already own!",
                                desc: `You already own the ${carNameGen({ currentCar: desiredCar, rarity: true })}.`,
                                author: message.author,
                                image: desiredCar.racehud
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        // Step 9: Check if it's the same car
                        if (desiredCarID.slice(0, 6) === selectedGarageCar.carID) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, you can't exchange a car for itself!",
                                desc: "Please choose a different Diamond car.",
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        // Step 10: Double-check CR range (should already be filtered but just in case)
                        const crDiff = Math.abs(desiredCar.cr - selectedCarData.cr);
                        if (crDiff > 50) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, Diamond car is not within CR range!",
                                desc: `The selected car must be within ±50 CR of your duplicate.\nYour car: CR ${selectedCarData.cr}\nDesired car: CR ${desiredCar.cr}\nDifference: ${crDiff} CR (max: 50)`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        // Step 10b: Double-check tyre type
                        const desiredTyreType = desiredCar.tyreType || "Standard";
                        if (desiredTyreType !== selectedTyreType) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, tyre types do not match!",
                                desc: `The selected car must have the same tyre type.\nYour car: **${selectedTyreType}** tyres\nDesired car: **${desiredTyreType}** tyres`,
                                author: message.author
                            });
                            return errorMessage.sendMessage({ currentMessage });
                        }

                        // Step 11: Confirmation
                        const confirmationMessage = new InfoMessage({
                            channel: message.channel,
                            title: "💎 Confirm Diamond Car Exchange",
                            desc: `Are you sure you want to exchange:\n\n**Giving:** ${carNameGen({ currentCar: selectedCarData, rarity: true })}\n**Receiving:** ${carNameGen({ currentCar: desiredCar, rarity: true })}`,
                            author: message.author,
                            image: desiredCar.racehud,
                            footer: `You have ${defaultChoiceTime / 1000} seconds to confirm.`
                        });

                        await confirm(message, confirmationMessage, acceptedFunction, playerData.settings.buttonstyle, currentMessage);

                        async function acceptedFunction(currentMessage) {
                            // Find the upgrade to remove (prefer stock, then lowest upgrade)
                            let upgradeToRemove = null;
                            const upgradeOrder = getAvailableTunes();
                            for (const upg of upgradeOrder) {
                                if (selectedGarageCar.upgrades[upg] > 0) {
                                    upgradeToRemove = upg;
                                    break;
                                }
                            }

                            if (!upgradeToRemove) {
                                const errorMessage = new ErrorMessage({
                                    channel: message.channel,
                                    title: "Error, could not find a car to remove.",
                                    desc: "Something went wrong. Please try again.",
                                    author: message.author
                                });
                                return errorMessage.sendMessage({ currentMessage });
                            }

                            // Remove one of the duplicate Diamond cars
                            updateHands(playerData, selectedGarageCar.carID, upgradeToRemove, "remove");
                            selectedGarageCar.upgrades[upgradeToRemove] -= 1;

                            // If no more of this car, remove from garage
                            if (calcTotal(selectedGarageCar) === 0) {
                                playerData.garage.splice(playerData.garage.indexOf(selectedGarageCar), 1);
                            }

                            // Add the new Diamond car (stock upgrade)
                            playerData.garage = addCars(playerData.garage, [{ carID: desiredCarID.slice(0, 6), upgrade: "000" }]);

                            // Save to database
                            await profileModel.updateOne({ userID: message.author.id }, {
                                garage: playerData.garage,
                                hand: playerData.hand,
                                decks: playerData.decks
                            });

                            trackExchange();

                            // Success message
                            const successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: "💎 Congratulations! Diamond Exchange Successful!",
                                desc: `You exchanged your ${carNameGen({ currentCar: selectedCarData, rarity: true })} for a brand new ${carNameGen({ currentCar: desiredCar, rarity: true })}!`,
                                author: message.author,
                                image: desiredCar.racehud
                            });
                            await successMessage.sendMessage({ currentMessage });
                            return successMessage.removeButtons();
                        }
                    })
                    .catch(error => {
                        throw error;
                    });

            } catch (timeError) {
                const cancelMessage = new InfoMessage({
                    channel: message.channel,
                    title: "Action cancelled automatically.",
                    desc: `You didn't type a car name in time. Please try again.`,
                    author: message.author
                });
                return cancelMessage.sendMessage({ currentMessage });
            }

        } catch (error) {
            const cancelMessage = new InfoMessage({
                channel: message.channel,
                title: "Action cancelled automatically.",
                desc: `You didn't select a car in time. Please try again.`,
                author: message.author
            });
            await cancelMessage.sendMessage({ currentMessage });
            return currentMessage.removeButtons();
        }
    }
};
